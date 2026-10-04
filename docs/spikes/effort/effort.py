"""CV profile, plan and feedback at reasoning effort low (today) vs minimal.

Run from backend/:
  uv run python ../docs/spikes/effort/effort.py cv         # every sample CV, 2 runs per effort
  uv run python ../docs/spikes/effort/effort.py plan       # try_plan's 3 cases, 2 runs per effort
  uv run python ../docs/spikes/effort/effort.py feedback   # Lukas, strong + weak, 8 questions

Results (every reply) go to out/. The feedback compares both efforts on the SAME simulated
answers (cached in out/answers_*.json), so only the effort differs.
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
import uuid
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "out"
SCRIPTS = HERE.parents[2] / "backend" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from fastapi import Response  # noqa: E402
from langchain_core.callbacks import get_usage_metadata_callback  # noqa: E402
from try_feedback import CANDIDATE, STYLES  # noqa: E402
from try_plan import CASES, CVS, load_profile  # noqa: E402

from backend.api import feedback as feedback_api  # noqa: E402
from backend.chains import cv_profile, llm  # noqa: E402
from backend.chains import feedback as feedback_chain  # noqa: E402
from backend.chains.plan import make_plan, profile_text  # noqa: E402
from backend.guard.plan_signature import sign_plan  # noqa: E402
from backend.schemas.chat import InterviewSettings  # noqa: E402
from backend.schemas.feedback import (  # noqa: E402
    AnsweredQuestion,
    Exchange,
    FeedbackRequest,
)
from backend.schemas.plan import InterviewPlan  # noqa: E402
from backend.services.cv_reader import CvError, read_cv  # noqa: E402

EFFORTS = ["low", "minimal"]
RUNS = 2
PARALLEL = asyncio.Semaphore(4)


def force_effort(module, effort: str) -> None:
    # the CV and feedback chains have effort="low" written in; swap it for the run
    module.get_chat_model = lambda **kwargs: llm.get_chat_model(
        **{**kwargs, "effort": effort}
    )


async def timed(make_call):
    # one call: seconds, (in, out, reasoning) tokens, the result. Exceptions are kept
    async with PARALLEL:
        start = time.perf_counter()
        with get_usage_metadata_callback() as usage:
            try:
                result = await make_call()
            except Exception as error:  # noqa: BLE001 - an error is a result here
                result = error
        tokens = next(iter(usage.usage_metadata.values()), {})
        return {
            "seconds": round(time.perf_counter() - start, 1),
            "in": tokens.get("input_tokens"),
            "out": tokens.get("output_tokens"),
            "reasoning": tokens.get("output_token_details", {}).get("reasoning"),
            "result": result,
        }


def summary(rows: list[dict], effort: str) -> str:
    ok = [row for row in rows if row["effort"] == effort and not row["error"]]
    failed = sum(1 for row in rows if row["effort"] == effort and row["error"])
    if not ok:
        return f"{effort:8} all {failed} failed"
    seconds = [row["seconds"] for row in ok]
    cost = [row["cost"] or 0 for row in ok]
    reasoning = [row["reasoning"] or 0 for row in ok]
    return (
        f"{effort:8} {len(ok)} ok, {failed} failed | "
        f"median {statistics.median(seconds):.1f} s (max {max(seconds):.1f}) | "
        f"median ${statistics.median(cost):.5f} | "
        f"median {statistics.median(reasoning):.0f} reasoning tokens"
    )


def save(name: str, rows: list[dict]) -> None:
    OUT.mkdir(exist_ok=True)
    (OUT / f"{name}.json").write_text(json.dumps(rows, indent=2, default=str))


# --- CV -------------------------------------------------------------------------------


async def run_cv() -> None:
    texts = {}
    for pdf in sorted(CVS.glob("*.pdf")):
        if "injection" in pdf.name:  # blocked by Jev before the LLM in the app
            continue
        try:
            texts[pdf.stem] = read_cv(pdf.read_bytes())
        except CvError as error:
            print(f"skip {pdf.stem}: {error}")

    async def one(effort: str, name: str, run: int) -> dict:
        force_effort(cv_profile, effort)
        call = await timed(lambda: cv_profile.extract_profile(texts[name]))
        result = call.pop("result")
        row = {"effort": effort, "cv": name, "run": run, **call, "error": None}
        if isinstance(result, Exception):
            row["error"] = f"{type(result).__name__}: {result}"[:200]
            row["cost"] = None
        else:
            row["cost"] = result.cost
            row["profile"] = result.value.model_dump()
        return row

    # force_effort patches the module, so one effort at a time
    rows = []
    for effort in EFFORTS:
        rows += await asyncio.gather(
            *(one(effort, name, run) for name in texts for run in range(RUNS))
        )
    save("cv", rows)

    def facts(row: dict) -> str:
        if row["error"]:
            return "ERROR"
        p = row["profile"]
        return (
            f"{p['first_name']}, {p['seniority']}, {p['years_experience']} y, "
            f"{len(p['skills'])} skills, {len(p['experience'])} jobs"
        )

    print(f"\n{'CV':22} | " + " | ".join(f"{e} #{r + 1:<26}" for e in EFFORTS for r in range(RUNS)))
    for name in texts:
        by = {
            (row["effort"], row["run"]): row for row in rows if row["cv"] == name
        }
        print(
            f"{name:22} | "
            + " | ".join(f"{facts(by[(e, r)]):29}" for e in EFFORTS for r in range(RUNS))
        )
    for row in rows:
        if row["error"]:
            print(f"error {row['effort']} {row['cv']}: {row['error']}")
    print()
    for effort in EFFORTS:
        print(summary(rows, effort))


# --- plan -----------------------------------------------------------------------------

MULTI_PART = (", and how", ", and what", ", and why", " and how ", " and what ", " and why ")


async def run_plan() -> None:
    profiles = {
        case.name: await load_profile(case.cv, fresh=False) if case.cv else None
        for case in CASES
    }

    async def one(effort: str, case, run: int) -> dict:
        call = await timed(
            lambda: make_plan(
                case.settings, profiles[case.name], case.job_description, effort
            )
        )
        result = call.pop("result")
        row = {"effort": effort, "case": case.name, "run": run, **call, "error": None}
        if isinstance(result, Exception):
            row["error"] = f"{type(result).__name__}: {result}"[:200]
            row["cost"] = None
        else:
            row["cost"] = result.cost
            row["plan"] = result.value.model_dump()
        return row

    rows = await asyncio.gather(
        *(one(e, case, r) for e in EFFORTS for case in CASES for r in range(RUNS))
    )
    save("plan", rows)

    for row in rows:
        print(f"\n=== {row['case']} / {row['effort']} #{row['run'] + 1}: {row['seconds']} s")
        if row["error"]:
            print("ERROR", row["error"])
            continue
        plan = row["plan"]
        print(f"approach ({len(plan['approach'])} chars): {plan['approach']}")
        for number, question in enumerate(plan["questions"], 1):
            text = question["question"]
            flags = []
            if text.count("?") > 1:
                flags.append(f"{text.count('?')}?")
            if any(part in text for part in MULTI_PART):
                flags.append("and-ask")
            flag = f"  [{', '.join(flags)}]" if flags else ""
            print(f"{number}. [{question['type']}] {text}{flag}")
    print()
    for effort in EFFORTS:
        print(summary(rows, effort))


# --- feedback -------------------------------------------------------------------------

FEEDBACK_SETTINGS = InterviewSettings(
    company="Netflux", role="Junior Software Developer", question_count=8
)


async def answers_for(plan: InterviewPlan, style: str) -> list[AnsweredQuestion]:
    # simulated once, then reused: both efforts score the same answers
    cached = OUT / f"answers_{style}.json"
    if cached.exists():
        return [AnsweredQuestion.model_validate(a) for a in json.loads(cached.read_text())]
    profile = await load_profile("09_career_changer.pdf", fresh=False)
    chain = CANDIDATE | llm.get_chat_model(max_tokens=1500, effort="low")
    replies = await asyncio.gather(
        *(
            chain.ainvoke(
                {
                    "role": FEEDBACK_SETTINGS.role,
                    "company": FEEDBACK_SETTINGS.company,
                    "profile": profile_text(profile),
                    "style": STYLES[style],
                    "question": planned.question,
                }
            )
            for planned in plan.questions
        )
    )
    answers = [
        AnsweredQuestion(
            question=i,
            exchanges=[Exchange(interviewer=planned.question, candidate=reply.text)],
        )
        for i, (planned, reply) in enumerate(zip(plan.questions, replies))
    ]
    OUT.mkdir(exist_ok=True)
    cached.write_text(json.dumps([a.model_dump() for a in answers], indent=2))
    return answers


async def run_feedback() -> None:
    plan = InterviewPlan.model_validate_json(
        (SCRIPTS / "out" / "plans" / "lukas_8q.json").read_text()
    )
    answers = {style: await answers_for(plan, style) for style in ("strong", "weak")}

    # the LLM part on its own: Jev's scoring is the same at every effort
    write_feedback = feedback_chain.write_feedback

    rows = []
    for effort in EFFORTS:
        force_effort(feedback_chain, effort)
        for style in answers:
            for run in range(RUNS):
                timing = {}

                async def timed_write(*args):
                    with get_usage_metadata_callback() as usage:
                        start = time.perf_counter()
                        written = await write_feedback(*args)
                        timing["seconds"] = round(time.perf_counter() - start, 1)
                    tokens = next(iter(usage.usage_metadata.values()), {})
                    timing["reasoning"] = tokens.get("output_token_details", {}).get(
                        "reasoning"
                    )
                    timing["cost"] = written.cost
                    return written

                feedback_api.write_feedback = timed_write
                request = FeedbackRequest(
                    session_id=uuid.uuid4(),
                    settings=FEEDBACK_SETTINGS,
                    plan=sign_plan(plan),
                    answers=answers[style],
                )
                row = {"effort": effort, "style": style, "run": run, "error": None}
                try:
                    result = await feedback_api.create_feedback(request, Response())
                    row |= timing | {"feedback": result.model_dump()}
                except Exception as error:  # noqa: BLE001
                    row |= {"seconds": None, "cost": None, "reasoning": None}
                    row["error"] = f"{type(error).__name__}: {error}"[:200]
                rows.append(row)
                print_feedback(row, plan)
    feedback_api.write_feedback = write_feedback
    save("feedback", rows)
    print()
    for effort in EFFORTS:
        print(summary(rows, effort))


def print_feedback(row: dict, plan: InterviewPlan) -> None:
    print(
        f"\n=== {row['style']} / {row['effort']} #{row['run'] + 1}: "
        f"LLM {row['seconds']} s, ${row['cost']}, {row['reasoning']} reasoning"
    )
    if row["error"]:
        print("ERROR", row["error"])
        return
    feedback = row["feedback"]
    card = feedback["scorecard"]
    print(f"overall {card['overall']}")
    for evaluation in feedback["evaluations"]:
        print(f"Q{evaluation['question'] + 1} {evaluation['score']:.2f}: {evaluation['feedback']}")
    print("strengths:", *card["strengths"], sep="\n  + ")
    print("improvements:", *card["improvements"], sep="\n  - ")
    brackets = card["sample_answer"].count("[")
    print(f"sample answer Q{card['weakest_question'] + 1} ({brackets} [brackets]): {card['sample_answer']}")


COMMANDS = {"cv": run_cv, "plan": run_plan, "feedback": run_feedback}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("what", choices=list(COMMANDS))
    asyncio.run(COMMANDS[parser.parse_args().what]())
