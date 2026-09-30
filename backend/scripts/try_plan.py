"""Make interview plans for three sample candidates and compare reasoning efforts.

uv run python scripts/sample_cvs/make_sample_cvs.py   # build the PDFs first
uv run python scripts/try_plan.py                     # all cases, low + medium (LLM calls, costs)
uv run python scripts/try_plan.py lukas --effort low  # one case, one effort
uv run python scripts/try_plan.py --fresh             # rebuild the cached profiles too

Profiles are cached in out/profiles/ (one LLM call each), plans are saved to out/plans/.
"""

import argparse
import asyncio
import time
from dataclasses import dataclass
from pathlib import Path

from langchain_core.callbacks import get_usage_metadata_callback

from backend.chains.cv_profile import extract_profile
from backend.chains.plan import make_plan
from backend.schemas.chat import InterviewSettings
from backend.schemas.cv import CandidateProfile
from backend.services.cv_reader import read_cv

OUT = Path(__file__).parent / "out"
CVS = OUT / "cvs"
PROFILES = OUT / "profiles"
PLANS = OUT / "plans"

BACKEND_JD = (
    "Backend Engineer, Payments. You build and run Python and Go services that "
    "handle millions of transactions a day. You design APIs, own services in "
    "production (on-call included) and improve reliability. We look for 4+ years "
    "of backend experience, Kafka or similar event streaming, PostgreSQL, and "
    "experience mentoring other engineers."
)
JUNIOR_JD = (
    "Junior Software Developer at a fintech. You write Python services, review pull "
    "requests and work in a small agile team. Nice to have: SQL, Git, testing."
)


@dataclass
class Case:
    name: str
    settings: InterviewSettings
    cv: str | None  # file name in out/cvs/, None = no CV
    job_description: str | None


CASES = [
    Case(
        "anna",
        InterviewSettings(company="Guugle", role="Backend Engineer", difficulty="hard"),
        "01_clean.pdf",
        BACKEND_JD,
    ),
    Case(
        "lukas",  # the career changer: head baker -> junior developer
        InterviewSettings(company="Netflux", role="Junior Software Developer"),
        "09_career_changer.pdf",
        JUNIOR_JD,
    ),
    Case(
        "nocv",
        InterviewSettings(company="Amazin", role="Data Analyst", difficulty="easy"),
        None,
        None,
    ),
]


async def load_profile(cv: str, fresh: bool) -> CandidateProfile:
    cached = PROFILES / f"{Path(cv).stem}.json"
    if cached.exists() and not fresh:
        return CandidateProfile.model_validate_json(cached.read_text())
    profile = (await extract_profile(read_cv((CVS / cv).read_bytes()))).value
    PROFILES.mkdir(parents=True, exist_ok=True)
    cached.write_text(profile.model_dump_json(indent=2))
    return profile


async def run(case: Case, effort: str, fresh: bool) -> None:
    profile = await load_profile(case.cv, fresh) if case.cv else None

    start = time.perf_counter()
    with get_usage_metadata_callback() as usage:
        plan = (
            await make_plan(case.settings, profile, case.job_description, effort)
        ).value
    seconds = time.perf_counter() - start

    # {model: {input_tokens, output_tokens, output_token_details: {reasoning}}}
    tokens = next(iter(usage.usage_metadata.values()), {})
    reasoning = tokens.get("output_token_details", {}).get("reasoning", "?")
    print(
        f"\n=== {case.name} / {effort}: {seconds:.1f} s, "
        f"{tokens.get('input_tokens', '?')} in, {tokens.get('output_tokens', '?')} out "
        f"({reasoning} reasoning)"
    )
    print(f"approach: {plan.approach}")
    for number, question in enumerate(plan.questions, 1):
        # more than one "?" is a hint for a multi-part question
        parts = (
            f"  [{question.question.count('?')}?]"
            if question.question.count("?") > 1
            else ""
        )
        print(f"{number}. [{question.type}] {question.question}{parts}")
        print(f"   why: {question.why}")
        for criterion in question.rubric:
            print(f"   - {criterion}")

    PLANS.mkdir(parents=True, exist_ok=True)
    (PLANS / f"{case.name}_{effort}.json").write_text(plan.model_dump_json(indent=2))


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "match", nargs="?", default="", help="only cases with this name"
    )
    parser.add_argument("--effort", nargs="+", default=["low", "medium"])
    parser.add_argument("--fresh", action="store_true", help="rebuild cached profiles")
    args = parser.parse_args()

    for case in CASES:
        if args.match in case.name:
            for effort in args.effort:
                await run(case, effort, args.fresh)


if __name__ == "__main__":
    asyncio.run(main())
