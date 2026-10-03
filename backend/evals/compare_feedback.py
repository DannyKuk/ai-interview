"""Measure feedback prompts on the same frozen interviews.

uv run python evals/compare_feedback.py                       # the app's prompt, weak 10 / others 3
uv run python evals/compare_feedback.py --runs 1              # a quick look
uv run python evals/compare_feedback.py --prompts path/a.md path/b.md --interviews weak
uv run python evals/compare_feedback.py --effort medium
# an open-weight model in LM Studio (load it first, context ≥ 12k: ~3k in + up to 6k out)
uv run python evals/compare_feedback.py --local http://localhost:1234/v1 \
    --model qwen/qwen3.8-27b --effort low

--prompts takes prompt files, so a change can be measured before it goes into
src/backend/prompts/feedback.md. The interviews (evals/feedback_interviews.json) were simulated once and frozen. Jev scores
each one once, and every prompt gets the same scores and the same weakest question: only
the prompt differs. The checks below are counted in code; whether the sample answer
invents what happened is counted by hand from the saved rows (evals/out/feedback_*.json).
"""

import argparse
import asyncio
import json
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from statistics import median
from typing import get_args

from langchain_core.callbacks import get_usage_metadata_callback
from langchain_openai import ChatOpenAI

from backend.chains import feedback as feedback_chain
from backend.chains import llm
from backend.chains.feedback import write_feedback
from backend.guard.jev import total_cost
from backend.prompts import PROMPTS_DIR
from backend.schemas.chat import Effort, InterviewSettings
from backend.schemas.feedback import AnsweredQuestion
from backend.schemas.plan import InterviewPlan
from backend.services.answer_scores import ScoredAnswer, score_answer

HERE = Path(__file__).parent
OUT = HERE / "out"
INTERVIEWS = HERE / "feedback_interviews.json"

APP_PROMPT = PROMPTS_DIR / "feedback.md"
# weak is the case the sample answer fails on: more runs, so 1 of 5 and 3 of 5 differ
RUNS = {"weak": 10, "strong": 3, "no_example": 3, "nonsense": 3}
PARALLEL = 6  # feedback calls at once; a local model: one at a time
EFFORTS: list[Effort] = list(get_args(Effort))

PLACEHOLDER = re.compile(r"\[[^\]]*\]")
QUOTE = re.compile(r"[\"“”]")
WORD = re.compile(r"[a-z][a-z'-]{4,}")
# words from the few-shot examples tried on Oct 2 (other candidates): never in the output
EXAMPLE_WORDS = re.compile(
    r"\b(newsletter|invoice|billing|refund\w*|charged twice|monday)\b", re.IGNORECASE
)


class LMStudioChat(ChatOpenAI):
    # LM Studio takes tool_choice only as a string, not {"type": "function", ...};
    # with_structured_output binds one tool, so "required" forces the same one
    def bind_tools(self, tools, *, tool_choice=None, **kwargs):
        return super().bind_tools(
            tools, tool_choice="required" if tool_choice else None, **kwargs
        )


def priced_or_why(result: dict, what: str) -> llm.Priced:
    # the app's check, but a failed run says why: cut off, no tool call, or broken JSON
    try:
        return llm.priced(result, what)
    except ValueError as error:
        raw = result["raw"]
        why = (
            f"finish {raw.response_metadata.get('finish_reason')}, "
            f"{len(raw.tool_calls)} tool calls, "
            f"{raw.usage_metadata and raw.usage_metadata.get('output_tokens')} tokens out, "
            f"parse error: {str(result['parsing_error'])[:150]}"
        )
        raise ValueError(f"{error} ({why})") from error


feedback_chain.priced = priced_or_why


@dataclass
class Interview:
    name: str
    answers: list[AnsweredQuestion]
    scores: list[ScoredAnswer]
    weakest: int  # plan index, as in the endpoint


@dataclass
class Row:
    prompt: str
    interview: str
    run: int
    effort: str | None = None  # None = the app's (low); local also "none" = no thinking
    model: str | None = None  # None = the app's model; else an LM Studio model id
    error: str | None = None
    seconds: float | None = None
    cost: float | None = None
    out_tokens: int | None = None
    reasoning_tokens: int | None = None
    weakest: int | None = None  # 1-based, as shown
    sample_answer: str = ""
    analysis: str = ""
    strengths: list[str] = field(default_factory=list)
    improvements: list[str] = field(default_factory=list)
    question_feedback: dict[int, str] = field(default_factory=dict)
    # checks in code
    placeholders: list[str] = field(default_factory=list)
    quotes: int = 0
    words: int = 0
    all_questions: bool = False
    example_leak: list[str] = field(default_factory=list)
    # reading aid for the hand count, not a judge: general know-how shows up too
    never_said: list[str] = field(default_factory=list)


def load_interviews() -> tuple[InterviewSettings, InterviewPlan, dict]:
    data = json.loads(INTERVIEWS.read_text())
    answers = {
        name: [AnsweredQuestion.model_validate(a) for a in interview["answers"]]
        for name, interview in data["interviews"].items()
    }
    return (
        InterviewSettings(**data["settings"]),
        InterviewPlan.model_validate(data["plan"]),
        answers,
    )


async def scored(name: str, plan: InterviewPlan, answers: list[AnsweredQuestion]):
    # the same "earlier answers" as the endpoint, so the contradiction check matches
    earlier = [
        [exchange.candidate for answer in answers[:i] for exchange in answer.exchanges]
        for i in range(len(answers))
    ]
    scores = await asyncio.gather(
        *(
            score_answer(plan.questions[a.question], a.exchanges, earlier[i])
            for i, a in enumerate(answers)
        )
    )
    if any(score.blocked for score in scores):
        raise SystemExit(f"{name}: Jev blocked or failed {[s.blocked for s in scores]}")
    weakest = min(zip(answers, scores), key=lambda pair: pair[1].score)[0].question
    return Interview(name, answers, list(scores), weakest)


def never_said(text: str, interview: Interview, plan: InterviewPlan) -> list[str]:
    seen = " ".join(
        [
            e.candidate + " " + e.interviewer
            for a in interview.answers
            for e in a.exchanges
        ]
        + [q.question for q in plan.questions]
    ).lower()
    known = set(WORD.findall(seen))
    return sorted(set(WORD.findall(PLACEHOLDER.sub(" ", text.lower()))) - known)


async def run_one(
    prompt: str,
    system_prompt: str,
    interview: Interview,
    run: int,
    settings: InterviewSettings,
    plan: InterviewPlan,
    limit: asyncio.Semaphore,
) -> Row:
    row = Row(prompt, interview.name, run, weakest=interview.weakest + 1)
    async with limit:
        start = time.perf_counter()
        with get_usage_metadata_callback() as usage:
            try:
                written = await write_feedback(
                    settings,
                    plan,
                    interview.answers,
                    interview.scores,
                    interview.weakest,
                    system_prompt,
                )
            except Exception as error:  # noqa: BLE001 - a failed run is a result here
                row.error = f"{type(error).__name__}: {error}"[:400]
                return row
        row.seconds = round(time.perf_counter() - start, 1)
    tokens = next(iter(usage.usage_metadata.values()), {})
    row.out_tokens = tokens.get("output_tokens")
    row.reasoning_tokens = tokens.get("output_token_details", {}).get("reasoning")

    feedback = written.value
    row.cost = written.cost
    row.sample_answer = feedback.sample_answer
    row.analysis = feedback.analysis
    row.strengths = feedback.strengths
    row.improvements = feedback.improvements
    row.question_feedback = {q.number: q.feedback for q in feedback.questions}

    row.placeholders = PLACEHOLDER.findall(feedback.sample_answer)
    row.quotes = len(QUOTE.findall(feedback.sample_answer))
    row.words = len(feedback.sample_answer.split())
    row.all_questions = set(row.question_feedback) == {
        a.question + 1 for a in interview.answers
    }
    shown = " ".join(
        [feedback.sample_answer, *feedback.strengths, *feedback.improvements]
        + list(row.question_feedback.values())
    )
    row.example_leak = sorted({m.lower() for m in EXAMPLE_WORDS.findall(shown)})
    row.never_said = never_said(feedback.sample_answer, interview, plan)
    return row


def summary(rows: list[Row], prompts: list[str], interviews: list[str]) -> None:
    print(
        f"\n{'prompt':20} {'interview':10} {'ok':>5} {'med s':>6} {'$ med':>8} "
        f"{'[ ] avg':>7} {'no [ ]':>6} {'quotes':>6} {'words':>5} {'strengths':>9} "
        f"{'all Qs':>6} {'leaks':>5}"
    )
    for prompt in prompts:
        for name in interviews:
            mine = [r for r in rows if r.prompt == prompt and r.interview == name]
            ok = [r for r in mine if not r.error]
            if not ok:
                print(f"{prompt:20} {name:10} {0:>2}/{len(mine):<2} all failed")
                continue
            print(
                f"{prompt:20} {name:10} {len(ok):>2}/{len(mine):<2} "
                f"{median(r.seconds for r in ok):>6.1f} "
                f"{median(r.cost or 0 for r in ok):>8.5f} "
                f"{sum(len(r.placeholders) for r in ok) / len(ok):>7.1f} "
                f"{sum(not r.placeholders for r in ok):>6} "
                f"{sum(r.quotes > 0 for r in ok):>6} "
                f"{median(r.words for r in ok):>5.0f} "
                f"{sum(len(r.strengths) for r in ok) / len(ok):>9.1f} "
                f"{sum(r.all_questions for r in ok):>6} "
                f"{sum(bool(r.example_leak) for r in ok):>5}"
            )
    errors = [r for r in rows if r.error]
    for row in errors:
        print(f"FAILED {row.prompt} {row.interview} #{row.run + 1}: {row.error}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--prompts", nargs="+", type=Path, default=[APP_PROMPT])
    parser.add_argument(
        "--interviews", nargs="+", default=list(RUNS), choices=list(RUNS)
    )
    parser.add_argument("--runs", type=int, help="runs per interview (default: RUNS)")
    parser.add_argument(
        "--effort", choices=["none", *EFFORTS], help="default: the app's"
    )
    parser.add_argument("--local", metavar="URL", help="an LM Studio server, with --model")
    parser.add_argument("--model", help="the LM Studio model id")
    args = parser.parse_args()
    if bool(args.local) != bool(args.model):
        parser.error("--local and --model go together")
    if args.effort == "none" and not args.local:
        parser.error("--effort none is for local models")

    if args.local:
        # same chain and schema, only the model is swapped (LM Studio speaks OpenAI's API)
        def local_model(max_tokens: int, effort: Effort, **_) -> ChatOpenAI:
            return LMStudioChat(
                model=args.model,
                base_url=args.local,
                api_key="lm-studio",  # LM Studio ignores it, the client needs one
                max_tokens=max_tokens,
                reasoning_effort=args.effort or effort,
                timeout=900,  # a long feedback on a model half in RAM
            )

        feedback_chain.get_chat_model = local_model
        # LM Studio loads a model on its first request: load it before the clock runs
        await local_model(max_tokens=10, effort="low").ainvoke("Hi")
    elif args.effort:
        # the chain has its effort written in; swap it for this run
        feedback_chain.get_chat_model = lambda **kwargs: llm.get_chat_model(
            **{**kwargs, "effort": args.effort}
        )

    # a file's name is its label in the table and the saved rows
    prompts = {path.stem: path.read_text(encoding="utf-8") for path in args.prompts}
    settings, plan, answers = load_interviews()
    interviews = await asyncio.gather(
        *(scored(name, plan, answers[name]) for name in args.interviews)
    )
    jev_cost = total_cost(*(s.cost for i in interviews for s in i.scores))
    for interview in interviews:
        print(
            f"{interview.name}: scores {[s.score for s in interview.scores]}, "
            f"weakest Q{interview.weakest + 1}"
        )

    limit = asyncio.Semaphore(1 if args.local else PARALLEL)
    rows = await asyncio.gather(
        *(
            run_one(prompt, text, interview, run, settings, plan, limit)
            for prompt, text in prompts.items()
            for interview in interviews
            for run in range(args.runs or RUNS[interview.name])
        )
    )
    for row in rows:
        row.effort = args.effort
        row.model = args.model
    summary(rows, list(prompts), args.interviews)
    llm_cost = sum(r.cost or 0 for r in rows)
    print(
        f"\n{len(rows)} feedback calls, {args.model or 'app model'}, "
        f"effort {args.effort or 'app default'}: "
        f"LLM ${llm_cost:.4f} + Jev ${jev_cost or 0:.4f}"
    )

    OUT.mkdir(exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%d_%H%M%S")
    path = OUT / f"feedback_{stamp}.json"
    path.write_text(json.dumps([asdict(r) for r in rows], indent=2, ensure_ascii=False))
    print(f"saved {path}")


if __name__ == "__main__":
    asyncio.run(main())
