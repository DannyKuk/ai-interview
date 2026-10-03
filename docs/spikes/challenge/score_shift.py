"""Spike (Oct 2): do the feedback's criterion scores move when the answers to the
earlier questions are added to the scoring state (needed for the contradiction mark)?

    cd backend && uv run python ../docs/spikes/challenge/score_shift.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from contradiction_scoring import CASES, state  # noqa: E402

from backend.services.answer_scores import (  # noqa: E402
    FIXED_CRITERIA,
    SPECIFIC_CRITERION,
    criterion_question,
)

CRITERIA = {
    "rubric": "Describes how they found out what users needed or what went wrong",
    "behav": FIXED_CRITERIA["behavioural"],
    "clear": FIXED_CRITERIA["situational"],
    "specific": SPECIFIC_CRITERION,
}
QUESTIONS = {key: criterion_question(text) for key, text in CRITERIA.items()}


async def main() -> None:
    cases = [case for case in CASES if case.earlier]
    without = [case.__class__(**{**case.__dict__, "earlier": []}) for case in cases]
    results = await asyncio.gather(
        *(ask_both(a, b) for a, b in zip(cases, without))
    )
    print(f"{'case':30} " + "  ".join(f"{k:12}" for k in CRITERIA))
    for case, (with_, plain) in zip(cases, results):
        print(f"{case.name:30} " + "  ".join(
            f"{plain[k]['noul']:.2f}→{with_[k]['noul']:.2f}   " for k in CRITERIA
        ))


async def ask_both(with_earlier, plain):
    from backend.guard.jev import ask_jev

    replies = await asyncio.gather(
        ask_jev(state(with_earlier), QUESTIONS), ask_jev(state(plain), QUESTIONS)
    )
    return [reply.answers for reply in replies]


if __name__ == "__main__":
    asyncio.run(main())
