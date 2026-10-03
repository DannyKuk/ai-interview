"""Spike (Oct 2): does the contradiction question work in the feedback's scoring state
(one planned question, its exchanges, plus the answers to the earlier questions)?

    cd backend && uv run python ../docs/spikes/challenge/contradiction_scoring.py [--runs 2]
"""

import argparse
import asyncio
import statistics
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from jev_claims import A1, A2  # noqa: E402

from backend.guard.delimiters import wrap  # noqa: E402
from backend.guard.jev import ask_jev  # noqa: E402

# the guard's question, worded for several answers per question
CONTRADICTION = {
    "type": "noul",
    "instructions": (
        "This is part of a job interview. <earlier_answers> holds what the candidate "
        "said to earlier questions. Does any of the candidate's answers in "
        "<candidate_message> contradict a fact the candidate stated in "
        "<earlier_answers> about themselves or their work, so that both can't be "
        "true? Openly correcting a small detail ('sorry, I meant…'), changing an "
        "opinion with a reason, or adding new details does not count."
    ),
}

# B: the guard's wording as it is (it gave the bank engineer 0.64)
GUARD_WORDING = {
    "type": "noul",
    "instructions": (
        "This is one turn of a job interview. <earlier_answers> holds what the "
        "candidate said before. Does the answer in <candidate_message> contradict a "
        "fact the candidate stated earlier about themselves or their work, so that "
        "both can't be true? Openly correcting a small detail ('sorry, I meant…'), "
        "changing an opinion with a reason, or adding new details does not count."
    ),
}
# C: names background, jobs and skills, the bank engineer case
BACKGROUND = {
    "type": "noul",
    "instructions": (
        "This is part of a job interview. <earlier_answers> holds what the candidate "
        "said to earlier questions. Does anything the candidate says in "
        "<candidate_message> contradict what they said in <earlier_answers> about "
        "themselves: their background, jobs, experience, skills or what they built, "
        "so that both can't be true? Openly correcting a small detail ('sorry, I "
        "meant…'), changing an opinion with a reason, or adding new details does not "
        "count."
    ),
}
VARIANTS = {"A": CONTRADICTION, "B": GUARD_WORDING, "C": BACKGROUND}

FRIEND = (
    "Honestly, I never really talked to the staff about it. And to be fair, I didn't "
    "build the app myself: a friend of mine wrote all the code, I only used it."
)
CLARIFY = (
    "Sorry, I put that badly. I wrote the app myself; my friend only helped me set "
    "up the Raspberry Pi. I asked the two morning bakers every Friday what annoyed "
    "them and replaced the text fields with plus and minus buttons."
)
SQLITE_WRONG = (
    "It can't be a concurrency problem, because SQLite handles any number of "
    "simultaneous writes without locking, so I'd look at the form."
)
SQLITE_FIXED = (
    "Actually, thinking about it, SQLite locks the database while one write happens, "
    "so the others have to wait. I'd check the logs for 'database is locked'."
)


@dataclass
class Case:
    name: str
    expect: bool
    question: str
    exchanges: list[tuple[str, str]]  # (interviewer, candidate)
    earlier: list[str]


Q = "How did you gather feedback from the bakery staff?"
CASES = [
    # contradictions
    Case("friend_wrote_it", True, Q, [(Q, FRIEND)], [A1, A2]),
    Case(
        "friend_then_clarified", True, Q,
        [(Q, FRIEND), ("Earlier you said you built it yourself. Which is it?", CLARIFY)],
        [A1, A2],
    ),
    Case(
        "never_deployed", True, "How did you keep the app running?",
        [("How did you keep the app running?",
          "I never deployed it anywhere. It only ran on my laptop when I was at work.")],
        [A1, A2],
    ),
    Case(
        "secret_engineer", True, "Tell me about working in a team.",
        [("Tell me about working in a team.",
          "In my five years as a backend engineer at a bank, I worked in a team of eight "
          "and we reviewed every pull request together.")],
        [A1, A2],
    ),
    Case(
        "first_answer_is_the_odd_one", True, Q,
        [(Q, "I asked the bakers every Friday and added plus and minus buttons.")],
        ["Honestly, a friend built the app, I've never written code myself.", A2],
    ),
    # not contradictions
    Case(
        "consistent", False, Q,
        [(Q, "I asked the two morning bakers every Friday and replaced the text fields "
             "with plus and minus buttons.")],
        [A1, A2],
    ),
    Case(
        "small_correction", False, "How long did the first version take?",
        [("How long did the first version take?",
          "About two months. And sorry, a small correction: the self-study was about "
          "seven months, not eight.")],
        [A1, A2],
    ),
    Case(
        "changed_opinion", False, "Would you build it the same way again?",
        [("Would you build it the same way again?",
          "Mostly, but with more people writing at once I'd now pick Postgres instead "
          "of SQLite, because it handles concurrent writes better.")],
        [A1, A2],
    ),
    Case(
        "friend_helped", False, "Did anyone help you?",
        [("Did anyone help you?",
          "A friend who works as a developer reviewed my code once and showed me how "
          "to set up the Raspberry Pi, but I wrote the app myself.")],
        [A1, A2],
    ),
    Case(
        "corrected_tech_claim", False, "How would you diagnose wrong flour levels?",
        [("How would you diagnose wrong flour levels?", SQLITE_WRONG),
         ("Can you explain how SQLite handles simultaneous writes?", SQLITE_FIXED)],
        [A1, A2],
    ),
    Case("first_question", False, Q, [(Q, FRIEND)], []),  # nothing earlier: not asked
]


def state(case: Case) -> str:
    parts = [wrap("planned_question", case.question)]
    if case.earlier:
        parts.insert(0, wrap("earlier_answers", "\n\n".join(case.earlier)))
    for interviewer, candidate in case.exchanges:
        parts += [wrap("interviewer", interviewer), wrap("candidate_message", candidate)]
    return "\n".join(parts)


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1)
    args = parser.parse_args()

    cases = [case for case in CASES if case.earlier]
    jobs = [ask_jev(state(c), VARIANTS) for c in cases for _ in range(args.runs)]
    flat = [reply.answers for reply in await asyncio.gather(*jobs)]
    print(f"{'case':30} {'expect':6} " + "  ".join(f"{k:10}" for k in VARIANTS))
    for i, case in enumerate(cases):
        runs = flat[i * args.runs : (i + 1) * args.runs]
        cols = []
        for key in VARIANTS:
            values = [a[key]["noul"] for a in runs]
            spread = f"±{max(values) - min(values):.2f}" if len(values) > 1 else ""
            cols.append(f"{statistics.mean(values):.2f}{spread:6}")
        print(f"{case.name:30} {'yes' if case.expect else 'no':6} " + "  ".join(cols))


if __name__ == "__main__":
    asyncio.run(main())
