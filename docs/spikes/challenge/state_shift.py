"""Spike (Oct 2): do the existing guard signals shift when the candidate's earlier
answers are added to the same Jev state (needed for the contradiction question)?

    cd backend && uv run python ../docs/spikes/challenge/state_shift.py [--runs 2]
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd() / "evals"))

from snapshots import SNAPSHOTS  # noqa: E402

from backend.guard.delimiters import wrap  # noqa: E402
from backend.guard.jev import (  # noqa: E402
    ANSWERED_QUESTION,
    CATEGORY_QUESTION,
    ROLE_QUESTION,
    VAGUE_QUESTION,
    WANTS_TO_END_QUESTION,
    ask_jev,
    build_state,
)

QUESTIONS = {
    "role_injection": ROLE_QUESTION,
    "category": CATEGORY_QUESTION,
    "wants_to_end": WANTS_TO_END_QUESTION,
    "answered": ANSWERED_QUESTION,
    "vague": VAGUE_QUESTION,
}


def signals(answers: dict) -> dict:
    probabilities = answers["category"]["probabilities"]
    return {
        "ok": probabilities["ok"],
        "off_topic": probabilities["off_topic"],
        "inj+abuse": probabilities["injection"] + probabilities["abuse"],
        "answered": answers["answered"]["noul"],
        "vague": answers["vague"]["noul"],
        "end": answers["wants_to_end"]["noul"],
    }


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1)
    args = parser.parse_args()

    for snapshot in SNAPSHOTS:
        user = [m.content for m in snapshot.messages if m.role == "user"]
        if len(user) < 2:
            continue
        last_question = next(
            m.content for m in reversed(snapshot.messages) if m.role == "assistant"
        )
        role = snapshot.settings.role
        plain = build_state(role, last_question, user[-1])
        with_earlier = "\n".join(
            [
                wrap("role", role),
                wrap("earlier_answers", "\n\n".join(user[:-1])),
                wrap("interviewer_question", last_question),
                wrap("candidate_message", user[-1]),
            ]
        )
        for _ in range(args.runs):
            a, b = await asyncio.gather(
                ask_jev(plain, QUESTIONS), ask_jev(with_earlier, QUESTIONS)
            )
            sa, sb = signals(a.answers), signals(b.answers)
            print(f"{snapshot.name:14} " + "  ".join(
                f"{key} {sa[key]:.2f}→{sb[key]:.2f}" for key in sa
            ))


if __name__ == "__main__":
    asyncio.run(main())
