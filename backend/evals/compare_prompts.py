"""Compare interviewer configs on the same fixed snapshots: the prompts (techniques),
and the model settings (model, reasoning effort, max tokens).

uv run python evals/compare_prompts.py                   # 5 techniques x 6 snapshots x 3 runs
uv run python evals/compare_prompts.py --runs 1          # a quick look
uv run python evals/compare_prompts.py --techniques zero_shot few_shot --snapshots vague

# the settings experiment: every combination of the lists, zero-shot only
uv run python evals/compare_prompts.py --techniques zero_shot \
    --models openai/gpt-5-mini openai/gpt-5-nano \
    --efforts minimal low medium --max-tokens 500 1000

Every reply goes through the real turn code (guard verdict -> plan note -> chain). The
defaults are the app's model settings. The guard runs once per snapshot, so every config
gets the same verdict and note: only the config differs. Checks in code, then Jev
judges each reply (evals/judge.py). Everything is saved to evals/out/.
"""

import argparse
import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from itertools import product
from pathlib import Path
from statistics import mean
from typing import get_args

import httpx
from judge import LOWER_IS_BETTER, QUESTIONS, judge
from snapshots import PLAN, SNAPSHOTS, Snapshot

from backend.api.interview import (
    TurnPlan,
    guard_chat,
    plan_this_turn,
    to_langchain_messages,
)
from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.config import settings as app_settings
from backend.guard.canary import leaked
from backend.guard.jev import describe
from backend.guard.transcript_signature import sign_transcript
from backend.schemas.chat import (
    ChatRequest,
    Effort,
    ModelSettings,
    Technique,
    answered_part,
)

logger = logging.getLogger(__name__)

OUT = Path(__file__).parent / "out"
TECHNIQUES: list[Technique] = list(get_args(Technique))
EFFORTS: list[Effort] = list(get_args(Effort))
DEFAULTS = ModelSettings()  # what the app uses: effort low, 1000 max tokens
PARALLEL = 6  # model calls at once, to stay clear of rate limits

# the prompts ask for plain text: bold, code, headings, list items
MARKDOWN = re.compile(r"\*\*|__|`|^\s*(#|[-*] |\d+\. )", re.MULTILINE)
# chain-of-thought / self-critique must think silently: signs they wrote the steps out
SHOWN_STEPS = re.compile(r"\b(draft|critique|checklist|step \d)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Config:
    technique: Technique
    model: str
    effort: Effort
    max_tokens: int

    @property
    def label(self) -> str:
        model = self.model.removeprefix("openai/")
        return f"{self.technique} {model} {self.effort} {self.max_tokens}"

    def model_settings(self) -> ModelSettings:
        return ModelSettings(
            model=self.model, reasoning_effort=self.effort, max_tokens=self.max_tokens
        )


@dataclass
class Reply:
    config: str  # Config.label, one row in the tables
    technique: Technique
    model: str
    effort: Effort
    max_tokens: int
    snapshot: str
    run: int
    text: str
    seconds: float
    input_tokens: int
    output_tokens: int  # reasoning included
    cost: float | None
    finish_reason: str | None  # "length" = cut off, the reasoning used up max_tokens
    # checks in code
    questions: int  # "?" count: the prompts ask for exactly one question
    words: int
    markdown: bool
    shows_steps: bool
    leaked: bool
    # Jev: P(yes) per question (judge.py), {} = no judgment (empty reply, Jev failed)
    judged: dict[str, float] = field(default_factory=dict)


async def prepare(snapshot: Snapshot) -> TurnPlan:
    # the same guard call as the chat API: its verdict decides the note for this turn
    session_id = uuid.uuid4()
    request = ChatRequest(
        session_id=session_id,
        messages=snapshot.messages,
        settings=snapshot.settings,
        # our own snapshots, so signed like the server signs a real conversation
        history_signature=sign_transcript(session_id, answered_part(snapshot.messages)),
    )
    verdict = await guard_chat(request)

    if verdict.blocked:
        raise RuntimeError(f"{snapshot.name}: blocked by the guard ({verdict.blocked})")

    return plan_this_turn(PLAN, snapshot.progress, verdict)


async def reply(
        config: Config, snapshot: Snapshot, turn: TurnPlan, run: int
) -> Reply:
    chain = build_interviewer_chain(
        config.technique, config.model_settings(), with_plan=True
    )
    chain_input = build_interviewer_input(
        snapshot.settings,
        to_langchain_messages(snapshot.messages),
        turn.note,
        PLAN.approach,
    )
    start = time.perf_counter()
    result = await chain.ainvoke(chain_input)
    seconds = time.perf_counter() - start

    text = result.text
    usage = result.usage_metadata or {}
    return Reply(
        config=config.label,
        technique=config.technique,
        model=config.model,
        effort=config.effort,
        max_tokens=config.max_tokens,
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


async def judged(reply: Reply, snapshot: Snapshot) -> Reply:
    if not reply.text:
        return reply

    try:
        reply.judged = await judge(snapshot, reply.text)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        logger.warning("judge failed for %s: %s", reply.snapshot, describe(error))

    return reply


def average(replies: list[Reply], name: str) -> str:
    values = [r.judged[name] for r in replies if name in r.judged]
    return f"{mean(values):.2f}" if values else "-"


def summary(replies: list[Reply]) -> None:
    configs = list(dict.fromkeys(r.config for r in replies))  # in run order
    by_config = {label: [r for r in replies if r.config == label] for label in configs}
    width = max(len(label) for label in configs) + 1

    print(
        f"\n{'config':{width}} {'n':>3} {'1 question':>10} {'words':>6} {'s':>5} "
        f"{'max s':>5} {'out tok':>7} {'$ total':>8} {'md':>3} {'steps':>5} "
        f"{'leak':>4} {'empty':>5} {'length':>6}"
    )
    for label, mine in by_config.items():
        one = sum(r.questions == 1 for r in mine)
        cost = sum(r.cost or 0 for r in mine)

        print(
            f"{label:{width}} {len(mine):>3} {one:>6}/{len(mine):<3} "
            f"{mean(r.words for r in mine):>6.0f} {mean(r.seconds for r in mine):>5.1f} "
            f"{max(r.seconds for r in mine):>5.1f} "
            f"{mean(r.output_tokens for r in mine):>7.0f} {cost:>8.4f} "
            f"{sum(r.markdown for r in mine):>3} {sum(r.shows_steps for r in mine):>5} "
            f"{sum(r.leaked for r in mine):>4} {sum(not r.text for r in mine):>5} "
            f"{sum(r.finish_reason == 'length' for r in mine):>6}"
        )

    # Jev: mean P(yes). good_reply: higher is better, the rest lower
    names = ["good_reply", *QUESTIONS]
    arrows = {name: "↓" if name in LOWER_IS_BETTER else "↑" for name in names}
    print(f"\n{'Jev, mean P':{width}} " + " ".join(f"{n + arrows[n]:>13}" for n in names))
    for label, mine in by_config.items():
        print(f"{label:{width}} " + " ".join(f"{average(mine, n):>13}" for n in names))

    # good_reply per snapshot: where each config does well or badly
    snapshots = list(dict.fromkeys(r.snapshot for r in replies))
    print(f"\n{'good_reply ↑':{width}} " + " ".join(f"{name:>18}" for name in snapshots))

    for label, mine in by_config.items():
        cells = (
            average([r for r in mine if r.snapshot == name], "good_reply")
            for name in snapshots
        )
        print(f"{label:{width}} " + " ".join(f"{cell:>18}" for cell in cells))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument(
        "--techniques", nargs="*", default=TECHNIQUES, choices=TECHNIQUES
    )
    names = [snapshot.name for snapshot in SNAPSHOTS]
    parser.add_argument("--snapshots", nargs="*", default=names, choices=names)
    parser.add_argument(
        "--models",
        nargs="*",
        default=[app_settings.default_model],
        choices=app_settings.allowed_models,
    )
    parser.add_argument(
        "--efforts", nargs="*", default=[DEFAULTS.reasoning_effort], choices=EFFORTS
    )
    parser.add_argument(
        "--max-tokens", nargs="*", type=int, default=[DEFAULTS.max_tokens]
    )
    args = parser.parse_args()

    configs = [
        Config(technique, model, effort, max_tokens)
        for technique, model, effort, max_tokens in product(
            args.techniques, args.models, args.efforts, args.max_tokens
        )
    ]

    snapshots = [snapshot for snapshot in SNAPSHOTS if snapshot.name in args.snapshots]
    turns = await asyncio.gather(*(prepare(snapshot) for snapshot in snapshots))
    for snapshot, turn in zip(snapshots, turns):
        print(f"{snapshot.name}: hint {turn.hint}, note: {turn.note}")

    limit = asyncio.Semaphore(PARALLEL)

    async def limited(config, snapshot, turn, run):
        async with limit:
            return await judged(await reply(config, snapshot, turn, run), snapshot)

    replies = await asyncio.gather(
        *(
            limited(config, snapshot, turn, run)
            for snapshot, turn in zip(snapshots, turns)
            for config in configs
            for run in range(1, args.runs + 1)
        )
    )

    for snapshot in snapshots:
        print(f"\n=== {snapshot.name}: {snapshot.good_reply}")
        for r in replies:
            if r.snapshot == snapshot.name:
                scores = " ".join(f"{name} {p:.2f}" for name, p in r.judged.items())
                print(f"[{r.config} #{r.run}, {r.seconds} s] {r.text}\n    Jev: {scores}")

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
