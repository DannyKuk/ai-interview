"""Compare interviewer configs on the same fixed snapshots: the prompts (techniques),
and the model settings (model, reasoning effort, max tokens).

uv run python evals/compare_prompts.py                   # 5 techniques x 6 snapshots x 3 runs
uv run python evals/compare_prompts.py --runs 1          # a quick look
uv run python evals/compare_prompts.py --techniques zero_shot few_shot --snapshots vague

# the settings experiment: every combination of the lists, zero-shot only
uv run python evals/compare_prompts.py --techniques zero_shot \
    --models openai/gpt-5-mini openai/gpt-5-nano \
    --efforts minimal low medium --max-tokens 500 1000

# open-weight models in LM Studio (another machine on the network): --models are its ids
uv run python evals/compare_prompts.py --techniques zero_shot \
    --local http://localhost:1234/v1 --models qwen/qwen3.8-27b --efforts none

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
from typing import Literal, get_args

import httpx
import openai
from judge import LOWER_IS_BETTER, QUESTIONS, judge
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.prompt_values import ChatPromptValue
from langchain_core.runnables import Runnable, RunnableLambda
from langchain_openai import ChatOpenAI
from snapshots import PLAN, SNAPSHOTS, Snapshot

from backend.api.interview import (
    TurnPlan,
    guard_chat,
    plan_this_turn,
    to_langchain_messages,
)
from backend.chains.interviewer import (
    build_interviewer_chain,
    build_interviewer_input,
    build_interviewer_prompt,
)
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
LOCAL_ATTEMPTS = 3

# the prompts ask for plain text: bold, code, headings, list items
MARKDOWN = re.compile(r"\*\*|__|`|^\s*(#|[-*] |\d+\. )", re.MULTILINE)
# chain-of-thought / self-critique must think silently: signs they wrote the steps out
SHOWN_STEPS = re.compile(r"\b(draft|critique|checklist|step \d)\b", re.IGNORECASE)
# a local thinking model can write its thoughts into the reply (the app would speak them)
THINKING = re.compile(r"<think>.*?(</think>|$)", re.DOTALL)


def notes_as_user(prompt: ChatPromptValue) -> list[BaseMessage]:
    # the turn note is a system message after the history: OpenAI's models take it, but
    # chat templates like Qwen's allow a system message only first (and need a user one)
    return [
        HumanMessage(m.content) if m.type == "system" and i > 0 else m
        for i, m in enumerate(prompt.to_messages())
    ]


@dataclass(frozen=True)
class Config:
    technique: Technique
    model: str
    # local only: "none" = thinking off, None = not sent (LM Studio's setting applies)
    effort: Effort | Literal["none"] | None
    max_tokens: int
    base_url: str | None = None  # an LM Studio server, None = OpenRouter

    @property
    def label(self) -> str:
        model = self.model.removeprefix("openai/")
        where = " local" if self.base_url else ""
        return f"{self.technique} {model}{where} {self.effort or '-'} {self.max_tokens}"

    def chain(self) -> Runnable:
        if not self.base_url:
            return build_interviewer_chain(
                self.technique, self.model_settings(), with_plan=True
            )
        # the app's prompt, only the model is swapped
        prompt = build_interviewer_prompt(self.technique, with_plan=True)
        return prompt | RunnableLambda(notes_as_user) | self.local_model()

    def local_model(self) -> ChatOpenAI:
        # LM Studio speaks OpenAI's API; its thinking comes back apart from the reply
        return ChatOpenAI(
            model=self.model,
            base_url=self.base_url,
            api_key="lm-studio",  # LM Studio ignores it, the client needs one
            max_tokens=self.max_tokens,
            reasoning_effort=self.effort,
            stream_usage=True,
            timeout=300,  # a model half in RAM is slow
        )

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
    first_token: float | None  # seconds until the first words: the app speaks from there
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
    thought: bool  # <think> in the reply, removed before the other checks
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
    chain = config.chain()
    chain_input = build_interviewer_input(
        snapshot.settings,
        to_langchain_messages(snapshot.messages),
        turn.note,
        PLAN.approach,
    )
    # streamed like the app's chat, so the first words can be timed
    raw, first_token, finish_reason, usage, cost = "", None, None, {}, None
    start = time.perf_counter()
    async for chunk in chain.astream(chain_input):
        if chunk.text and first_token is None:
            first_token = round(time.perf_counter() - start, 2)
        raw += chunk.text
        finish_reason = chunk.response_metadata.get("finish_reason", finish_reason)
        if chunk.usage_metadata:
            usage = chunk.usage_metadata
            cost = chunk.response_metadata.get("cost")
    seconds = time.perf_counter() - start

    text = THINKING.sub("", raw).strip()
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
        first_token=first_token,
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        cost=cost,
        finish_reason=finish_reason,
        questions=text.count("?"),
        words=len(text.split()),
        markdown=bool(MARKDOWN.search(text)),
        shows_steps=bool(SHOWN_STEPS.search(text)),
        leaked=leaked(raw, chain_input["canary"]),
        thought=bool(THINKING.search(raw)),
    )


async def reply_with_retry(
        config: Config, snapshot: Snapshot, turn: TurnPlan, run: int
) -> Reply:
    # LM Studio's link to the other machine can drop for a moment, then it's back
    for _ in range(LOCAL_ATTEMPTS - 1):
        try:
            return await reply(config, snapshot, turn, run)
        except openai.APIError as error:
            logger.warning("%s #%d failed (%s), again in 30 s", snapshot.name, run, error)
            await asyncio.sleep(30)
    return await reply(config, snapshot, turn, run)


async def warm_up(config: Config) -> None:
    # LM Studio loads a model on its first request: load it before the clock runs
    start = time.perf_counter()
    await config.local_model().ainvoke("Hi")
    print(f"{config.model} loaded in {time.perf_counter() - start:.0f} s")


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
        f"\n{'config':{width}} {'n':>3} {'1 question':>10} {'words':>6} {'1st s':>5} "
        f"{'s':>5} {'max s':>5} {'out tok':>7} {'$ total':>8} {'md':>3} {'steps':>5} "
        f"{'leak':>4} {'empty':>5} {'length':>6} {'think':>5}"
    )
    for label, mine in by_config.items():
        one = sum(r.questions == 1 for r in mine)
        cost = sum(r.cost or 0 for r in mine)
        firsts = [r.first_token for r in mine if r.first_token is not None]
        first = f"{mean(firsts):>5.1f}" if firsts else f"{'-':>5}"

        print(
            f"{label:{width}} {len(mine):>3} {one:>6}/{len(mine):<3} "
            f"{mean(r.words for r in mine):>6.0f} {first} "
            f"{mean(r.seconds for r in mine):>5.1f} "
            f"{max(r.seconds for r in mine):>5.1f} "
            f"{mean(r.output_tokens for r in mine):>7.0f} {cost:>8.4f} "
            f"{sum(r.markdown for r in mine):>3} {sum(r.shows_steps for r in mine):>5} "
            f"{sum(r.leaked for r in mine):>4} {sum(not r.text for r in mine):>5} "
            f"{sum(r.finish_reason == 'length' for r in mine):>6} "
            f"{sum(r.thought for r in mine):>5}"
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
    parser.add_argument("--models", nargs="*", default=[app_settings.default_model])
    parser.add_argument(
        "--local",
        metavar="URL",
        help="an LM Studio server (http://<ip>:1234/v1); --models are its model ids",
    )
    # local: not sent unless given; "none" switches a local model's thinking off
    parser.add_argument("--efforts", nargs="*", choices=["none", *EFFORTS])
    parser.add_argument(
        "--max-tokens", nargs="*", type=int, default=[DEFAULTS.max_tokens]
    )
    args = parser.parse_args()

    unknown = set(args.models) - set(app_settings.allowed_models)
    if unknown and not args.local:
        parser.error(f"not in the app's model list: {', '.join(sorted(unknown))}")
    if args.local and len(args.models) != 1:
        parser.error("one model per local run: LM Studio would reload between models")
    efforts = args.efforts or [None if args.local else DEFAULTS.reasoning_effort]
    if "none" in efforts and not args.local:
        parser.error("--efforts none is for local models")

    configs = [
        Config(technique, model, effort, max_tokens, args.local)
        for technique, model, effort, max_tokens in product(
            args.techniques, args.models, efforts, args.max_tokens
        )
    ]

    snapshots = [snapshot for snapshot in SNAPSHOTS if snapshot.name in args.snapshots]
    turns = await asyncio.gather(*(prepare(snapshot) for snapshot in snapshots))
    for snapshot, turn in zip(snapshots, turns):
        print(f"{snapshot.name}: hint {turn.hint}, note: {turn.note}")

    if args.local:
        await warm_up(configs[0])

    # local: one reply at a time, so the seconds are what one candidate would wait
    limit = asyncio.Semaphore(1 if args.local else PARALLEL)

    async def limited(config, snapshot, turn, run):
        async with limit:
            answer = reply_with_retry if args.local else reply
            return await judged(await answer(config, snapshot, turn, run), snapshot)

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
