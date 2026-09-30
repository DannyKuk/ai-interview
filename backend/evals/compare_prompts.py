"""Compare the interviewer prompts (techniques) on the same fixed snapshots.

uv run python evals/compare_prompts.py                   # 5 techniques x 6 snapshots x 3 runs
uv run python evals/compare_prompts.py --runs 1          # a quick look
uv run python evals/compare_prompts.py --techniques zero_shot few_shot --snapshots vague

Every reply goes through the real turn code (guard verdict -> plan note -> chain), with
the app's default model settings. The guard runs once per snapshot, so every prompt
gets the same verdict and note: only the prompt differs. Checks in code for now;
Everything is saved to evals/out/.
"""

import argparse
import asyncio
import json
import re
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from statistics import mean
from typing import get_args

from snapshots import PLAN, SETTINGS, SNAPSHOTS, Snapshot

from backend.api.interview import (
    TurnPlan,
    guard_chat,
    plan_this_turn,
    to_langchain_messages,
)
from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.guard.canary import leaked
from backend.schemas.chat import ChatRequest, ModelSettings, Technique

OUT = Path(__file__).parent / "out"
TECHNIQUES: list[Technique] = list(get_args(Technique))
PARALLEL = 6  # model calls at once, to stay clear of rate limits

# the prompts ask for plain text: bold, code, headings, list items
MARKDOWN = re.compile(r"\*\*|__|`|^\s*(#|[-*] |\d+\. )", re.MULTILINE)
# chain-of-thought / self-critique must think silently: signs they wrote the steps out
SHOWN_STEPS = re.compile(r"\b(draft|critique|checklist|step \d)\b", re.IGNORECASE)


@dataclass
class Reply:
    technique: Technique
    snapshot: str
    run: int
    text: str
    seconds: float
    input_tokens: int
    output_tokens: int  # reasoning included
    cost: float | None
    finish_reason: str | None
    # checks in code
    questions: int  # "?" count: the prompts ask for exactly one question
    words: int
    markdown: bool
    shows_steps: bool
    leaked: bool


async def prepare(snapshot: Snapshot) -> TurnPlan:
    # the same guard call as the chat API: its verdict decides the note for this turn
    request = ChatRequest(
        session_id=uuid.uuid4(), messages=snapshot.messages, settings=SETTINGS
    )
    verdict = await guard_chat(request)
    if verdict.blocked:
        raise RuntimeError(f"{snapshot.name}: blocked by the guard ({verdict.blocked})")
    return plan_this_turn(PLAN, snapshot.progress, verdict)


async def reply(
        technique: Technique, snapshot: Snapshot, turn: TurnPlan, run: int
) -> Reply:
    chain = build_interviewer_chain(technique, ModelSettings(), with_plan=True)
    chain_input = build_interviewer_input(
        SETTINGS, to_langchain_messages(snapshot.messages), turn.note, PLAN.approach
    )
    start = time.perf_counter()
    result = await chain.ainvoke(chain_input)
    seconds = time.perf_counter() - start

    text = result.text
    usage = result.usage_metadata or {}
    return Reply(
        technique=technique,
        snapshot=snapshot.name,
        run=run,
        text=text,
        seconds=round(seconds, 2),
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        cost=result.response_metadata.get("cost"),
        finish_reason=result.response_metadata.get("finish_reason"),
        questions=text.count("?"),
        words=len(text.split()),
        markdown=bool(MARKDOWN.search(text)),
        shows_steps=bool(SHOWN_STEPS.search(text)),
        leaked=leaked(text, chain_input["canary"]),
    )


def summary(replies: list[Reply]) -> None:
    print(
        f"\n{'technique':18} {'n':>3} {'1 question':>10} {'words':>6} {'s':>5} "
        f"{'out tok':>7} {'$ total':>8} {'md':>3} {'steps':>5} {'leak':>4} {'empty':>5}"
    )
    for technique in TECHNIQUES:
        mine = [r for r in replies if r.technique == technique]
        if not mine:
            continue
        one = sum(r.questions == 1 for r in mine)
        cost = sum(r.cost or 0 for r in mine)
        print(
            f"{technique:18} {len(mine):>3} {one:>6}/{len(mine):<3} "
            f"{mean(r.words for r in mine):>6.0f} {mean(r.seconds for r in mine):>5.1f} "
            f"{mean(r.output_tokens for r in mine):>7.0f} {cost:>8.4f} "
            f"{sum(r.markdown for r in mine):>3} {sum(r.shows_steps for r in mine):>5} "
            f"{sum(r.leaked for r in mine):>4} {sum(not r.text for r in mine):>5}"
        )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument(
        "--techniques", nargs="*", default=TECHNIQUES, choices=TECHNIQUES
    )
    names = [snapshot.name for snapshot in SNAPSHOTS]
    parser.add_argument("--snapshots", nargs="*", default=names, choices=names)
    args = parser.parse_args()

    snapshots = [snapshot for snapshot in SNAPSHOTS if snapshot.name in args.snapshots]
    turns = await asyncio.gather(*(prepare(snapshot) for snapshot in snapshots))
    for snapshot, turn in zip(snapshots, turns):
        print(f"{snapshot.name}: hint {turn.hint}, note: {turn.note}")

    limit = asyncio.Semaphore(PARALLEL)

    async def limited(technique, snapshot, turn, run):
        async with limit:
            return await reply(technique, snapshot, turn, run)

    replies = await asyncio.gather(
        *(
            limited(technique, snapshot, turn, run)
            for snapshot, turn in zip(snapshots, turns)
            for technique in args.techniques
            for run in range(1, args.runs + 1)
        )
    )

    for snapshot in snapshots:
        print(f"\n=== {snapshot.name}: {snapshot.good_reply}")
        for r in replies:
            if r.snapshot == snapshot.name:
                print(f"[{r.technique} #{r.run}, {r.seconds} s] {r.text}")

    summary(replies)

    OUT.mkdir(exist_ok=True)
    path = OUT / f"replies_{datetime.now(UTC):%Y%m%d_%H%M%S}.json"
    path.write_text(
        json.dumps(
            {
                "notes": {
                    snapshot.name: {"hint": turn.hint, "note": turn.note}
                    for snapshot, turn in zip(snapshots, turns)
                },
                "replies": [asdict(r) for r in replies],
            },
            indent=2,
        )
    )
    print(f"\nsaved to {path}")


if __name__ == "__main__":
    asyncio.run(main())
