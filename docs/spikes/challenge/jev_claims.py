"""Spike (Oct 2): can Jev tell wrong technical claims and contradictions apart from
correct-but-surprising claims, personal claims and harmless corrections?

Run from backend/ (uses the app's Jev call and .env):
    cd backend && uv run python ../docs/spikes/challenge/jev_claims.py [--runs 2] [--only wrong,true_recent]

Per case: one Jev call with the three candidate questions (guard-style state + the
candidate's earlier answers), and for technical cases a second call with the feedback's
"technically correct" criterion (scoring-style state), to see if the score punishes
correct claims Jev doesn't know.
"""

import argparse
import asyncio
import json
import statistics
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from backend.guard.delimiters import wrap
from backend.guard.jev import ask_jev
from backend.services.answer_scores import FIXED_CRITERIA, criterion_question

OUT = Path(__file__).parent / "out"

# --- candidate questions -----------------------------------------------------------

WRONG_CLAIM = {
    "type": "noul",
    "instructions": (
        "This is one turn of a job interview. Does the answer in <candidate_message> "
        "contain a technical claim that is clearly false, i.e. it contradicts "
        "well-established facts about how a technology, tool or method works? Only "
        "say yes when the claim is certainly wrong. A claim that is new, niche or "
        "surprising but could be true does not count. Neither do claims about the "
        "candidate's own experience, numbers or results, an honest 'I don't know', "
        "or an answer that is only vague or incomplete."
    ),
}

UNVERIFIED_CLAIM = {
    "type": "noul",
    "instructions": (
        "This is one turn of a job interview. Does the answer in <candidate_message> "
        "contain a technical claim about how a technology, tool or method works that "
        "you can't confirm as correct, because it is new, niche or you don't know "
        "it? Claims about the candidate's own experience, numbers or results do not "
        "count, and neither do well-known correct facts."
    ),
}

CONTRADICTION = {
    "type": "noul",
    "instructions": (
        "This is one turn of a job interview. <earlier_answers> holds what the "
        "candidate said before. Does the answer in <candidate_message> contradict a "
        "fact the candidate stated earlier about themselves or their work, so that "
        "both can't be true? Openly correcting a small detail ('sorry, I meant…'), "
        "changing an opinion with a reason, or adding new details does not count."
    ),
}

# the same two claim questions for the feedback's scoring state: several exchanges,
# so "any answer" instead of "the answer"
SCORING_WRONG = {
    "type": "noul",
    "instructions": (
        "This is part of a job interview. Does any of the candidate's answers in "
        "<candidate_message> contain a technical claim that is clearly false, i.e. it "
        "contradicts well-established facts about how a technology, tool or method "
        "works? Only say yes when the claim is certainly wrong. A claim that is new, "
        "niche or surprising but could be true does not count. Neither do claims "
        "about the candidate's own experience, numbers or results, an honest 'I "
        "don't know', or an answer that is only vague or incomplete."
    ),
}
SCORING_UNVERIFIED = {
    "type": "noul",
    "instructions": (
        "This is part of a job interview. Does any of the candidate's answers in "
        "<candidate_message> contain a technical claim about how a technology, tool "
        "or method works that you can't confirm as correct, because it is new, niche "
        "or you don't know it? Claims about the candidate's own experience, numbers "
        "or results do not count, and neither do well-known correct facts."
    ),
}

QUESTIONS = {
    "wrong": WRONG_CLAIM,
    "unverified": UNVERIFIED_CLAIM,
    "contradiction": CONTRADICTION,
}

# --- cases -------------------------------------------------------------------------

ROLE = "Junior Software Developer"

# same story as evals/snapshots.py: head baker -> junior developer
A1 = (
    "At the bakery I kept running into the same problem: we never knew how much "
    "flour and butter we had, so we over-ordered. I taught myself Python with the "
    "University of Michigan course, about ten hours a week for eight months, and "
    "built a small Flask app to track our stock. Seeing people use something I built "
    "is what kept me going."
)
A2 = (
    "It replaced our paper stock list. I built all of it myself: a Flask backend with "
    "SQLite, a simple form for the morning counts, and I deployed it on a Raspberry "
    "Pi in the back office. Flour waste went down by about 18% in three months."
)
Q_APP = (
    "Let's talk about that app: what specific problem did your bakery stock tracker "
    "solve, and what was your role in building and deploying it?"
)


@dataclass
class Case:
    name: str
    group: str
    question: str
    answer: str
    expect_wrong: bool = False
    expect_contradiction: bool = False
    earlier: list[str] = field(default_factory=lambda: [A1])
    technical: bool = True


CASES = [
    # clearly wrong: should be challenged
    Case(
        "sqlite_writes", "wrong", Q_APP,
        "It replaced our paper stock list. I built it in Flask with SQLite, and "
        "because SQLite handles any number of simultaneous writes without locking, "
        "all five bakers could save their counts at the same time, so I never had to "
        "think about concurrency.",
        expect_wrong=True,
    ),
    Case(
        "http_stateful", "wrong",
        "How would you keep a user logged in across requests in a web app?",
        "Since HTTP is a stateful protocol, the server remembers each user's "
        "connection between requests, so I wouldn't need cookies or tokens for that.",
        expect_wrong=True,
    ),
    Case(
        "python_lists_immutable", "wrong",
        "Which Python data structures would you use for the stock items, and why?",
        "Python lists are immutable, so whenever I need to change an item I convert "
        "the list to a tuple, change it there and convert it back.",
        expect_wrong=True,
    ),
    Case(
        "sql_fstrings", "wrong",
        "How do you protect an app like yours against SQL injection?",
        "I build every query with f-strings and escape the quotes by hand. That's "
        "the safest way, parameterized queries are actually more vulnerable.",
        expect_wrong=True,
    ),
    Case(
        "git_rebase", "wrong",
        "How do you keep your feature branch up to date with main?",
        "I rebase it on main. Rebase only changes my local working files and never "
        "rewrites commit history, so rebasing a shared branch is always safe.",
        expect_wrong=True,
    ),
    Case(
        "js_const", "wrong",
        "What's the difference between let and const in JavaScript?",
        "const makes the value fully immutable, so once I declare an object with "
        "const, nobody can change any of its properties anymore.",
        expect_wrong=True,
    ),
    # correct, but sounds odd: must not be challenged
    Case(
        "sqlite_most_deployed", "true_odd",
        "Why did you pick SQLite instead of a bigger database?",
        "SQLite is probably the most widely deployed database in the world, it's in "
        "every phone and browser, so it's well tested, and for one bakery a single "
        "file was plenty.",
    ),
    Case(
        "js_typeof_null", "true_odd",
        "How do you check for missing values in JavaScript?",
        "Careful with typeof: typeof null returns 'object', which is an old bug in "
        "the language, so I check for null with === null instead.",
    ),
    Case(
        "float_money", "true_odd",
        "How did you store prices in your app?",
        "Not as floats: 0.1 + 0.2 isn't exactly 0.3 in Python, so I stored prices "
        "as whole cents in integers.",
    ),
    Case(
        "sqlite_wal", "true_odd", Q_APP,
        "It replaced our paper stock list. SQLite only allows one writer at a time, "
        "so I turned on WAL mode, which lets the others keep reading while someone "
        "is writing. With five bakers that was plenty.",
    ),
    # correct, but recent or niche: Jev may not know them
    Case(
        "py314_free_threaded", "true_recent",
        "How would you speed up a CPU-heavy Python script?",
        "First I'd profile it. If it's really CPU-bound, since Python 3.14 the "
        "free-threaded build without the GIL is officially supported, so I'd try "
        "that build with threads, or else use multiprocessing.",
    ),
    Case(
        "react19_actions", "true_recent",
        "How would you handle a form submission with a loading state in React?",
        "With React 19 I'd use an Action and the useActionState hook, which gives me "
        "the pending state, so I don't need my own isLoading flag.",
    ),
    Case(
        "postgres18_aio", "true_recent",
        "If the stock list grew a lot, what would you change in the database?",
        "I'd move to Postgres. Postgres 18 added asynchronous I/O, which can speed up "
        "big sequential scans, and I'd add indexes on the columns I filter by.",
    ),
    Case(
        "nextjs16_turbopack", "true_recent",
        "Which tools would you use to build the frontend?",
        "Next.js 16. Turbopack is now the default bundler there for both dev and "
        "production builds, so the setup is simpler than with webpack.",
    ),
    Case(
        "openrouter_tts", "true_recent",
        "How would you add text-to-speech to an app?",
        "I'd call OpenRouter's /audio/speech endpoint with Google's Gemini 3.8 Flash "
        "Lite TTS model: it returns raw 24 kHz PCM audio, which I can play directly.",
    ),
    Case(
        "parakeet_cpu", "true_recent",
        "How would you transcribe voice answers without sending audio to the cloud?",
        "I'd run NVIDIA's Parakeet TDT 0.6B v2 with onnx-asr on the CPU. It's an "
        "int8 model, and it transcribes about 15 seconds of speech in well under a "
        "second.",
    ),
    # personal claims and other normal answers: neither wrong nor "unverified"
    Case("personal_metrics", "personal", Q_APP, A2),
    Case(
        "personal_speedup", "personal",
        "What was the hardest bug you fixed in your app?",
        "The stock page took about four seconds to load on the Raspberry Pi. I found "
        "that I loaded every past count on each request, added a date filter and an "
        "index, and it went down to under one second.",
    ),
    Case(
        "honest_dont_know", "personal",
        "How does SQLite handle several people writing at once?",
        "Honestly, I'm not sure. It never came up with five bakers, but I'd read up "
        "on it before using it with more users.",
    ),
    Case(
        "buzzwords", "personal", Q_APP,
        "I leveraged a cloud-native microservices architecture with Kubernetes and AI "
        "to create a scalable, data-driven synergy for the bakery's stock.",
    ),
    Case(
        "motivation", "personal",
        "Why do you want to move from head baker to software developer?",
        A1, earlier=[], technical=False,
    ),
    # contradictions: must be challenged
    Case(
        "never_wrote_python", "contradiction", Q_APP,
        "Honestly, I've never written any Python myself. A friend built the whole "
        "tracker, I only used it at the bakery.",
        expect_contradiction=True, technical=False,
    ),
    Case(
        "never_deployed", "contradiction",
        "How did you keep the app running day to day?",
        "I never deployed it anywhere. It only ran on my laptop when I happened to "
        "be at work.",
        expect_contradiction=True, earlier=[A1, A2], technical=False,
    ),
    Case(
        "secret_engineer", "contradiction",
        "Tell me about a time you worked in a team on code.",
        "In my five years as a backend engineer at a bank, I worked in a team of "
        "eight and we reviewed every pull request together.",
        expect_contradiction=True, earlier=[A1, A2], technical=False,
    ),
    # not contradictions: must not be challenged
    Case(
        "small_correction", "no_contradiction",
        "How long did it take you to build the first version?",
        "About two months. And sorry, a small correction to earlier: the self-study "
        "was about seven months, not eight.",
        earlier=[A1, A2], technical=False,
    ),
    Case(
        "changed_opinion", "no_contradiction",
        "Would you build it the same way again?",
        "Mostly, but thinking about it now, with more people writing at once I'd "
        "pick Postgres instead of SQLite, because it handles concurrent writes better.",
        earlier=[A1, A2], technical=False,
    ),
    Case(
        "new_details", "no_contradiction",
        "What else did the app do?",
        "Besides the stock counts, I added a small script that emails our supplier "
        "when flour drops below two bags.",
        earlier=[A1, A2], technical=False,
    ),
    Case(
        "friend_helped", "no_contradiction",
        "Did anyone help you with the app?",
        "A friend who works as a developer reviewed my code once and showed me how "
        "to set up the Raspberry Pi, but I wrote the app myself.",
        earlier=[A1, A2], technical=False,
    ),
]


def candidate_state(case: Case) -> str:
    # the guard's state (role, last question, message) plus the earlier answers
    parts = [wrap("role", ROLE)]
    if case.earlier:
        parts.append(wrap("earlier_answers", "\n\n".join(case.earlier)))
    parts.append(wrap("interviewer_question", case.question))
    parts.append(wrap("candidate_message", case.answer))
    return "\n".join(parts)


def scoring_state(case: Case) -> str:
    # like services/answer_scores.build_state; with --follow-up the claim comes in a
    # second exchange after a harmless first answer
    parts = [wrap("planned_question", case.question)]
    if FOLLOW_UP:
        parts += [
            wrap("interviewer", case.question),
            wrap("candidate_message", "Let me think. I'd start with what I know."),
            wrap("interviewer", "Can you be more specific?"),
        ]
    else:
        parts.append(wrap("interviewer", case.question))
    parts.append(wrap("candidate_message", case.answer))
    return "\n".join(parts)


FOLLOW_UP = False


async def run_case(case: Case, semaphore: asyncio.Semaphore) -> dict:
    async with semaphore:
        answers = (await ask_jev(candidate_state(case), QUESTIONS)).answers
        result = {key: answers[key]["noul"] for key in QUESTIONS}
        if case.technical:
            scored = await ask_jev(
                scoring_state(case),
                {
                    "correct": criterion_question(FIXED_CRITERIA["technical"]),
                    "s_wrong": SCORING_WRONG,
                    "s_unverified": SCORING_UNVERIFIED,
                },
            )
            for key in ("correct", "s_wrong", "s_unverified"):
                result[key] = scored.answers[key]["noul"]
        return result


def fmt(values: list[float]) -> str:
    if not values:
        return "   -     "
    mean = statistics.mean(values)
    if len(values) == 1:
        return f"{mean:5.2f}    "
    return f"{mean:5.2f}±{max(values) - min(values):.2f}"


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--only", help="comma-separated groups")
    parser.add_argument("--follow-up", action="store_true",
                        help="scoring state: the claim in a second exchange")
    args = parser.parse_args()
    global FOLLOW_UP
    FOLLOW_UP = args.follow_up

    cases = CASES
    if args.only:
        groups = set(args.only.split(","))
        cases = [case for case in CASES if case.group in groups]

    semaphore = asyncio.Semaphore(5)
    jobs = [run_case(case, semaphore) for case in cases for _ in range(args.runs)]
    flat = await asyncio.gather(*jobs)
    runs = [flat[i * args.runs : (i + 1) * args.runs] for i in range(len(cases))]

    print(f"{'case':24} {'group':17} {'exp':5} {'wrong':9} {'unverif':9} "
          f"{'contra':9} {'correct':9} {'s_wrong':9} {'s_unverif':9}")
    rows = []
    for case, results in zip(cases, runs):
        expected = ("W" if case.expect_wrong else "") + (
            "C" if case.expect_contradiction else ""
        )
        cols = {
            key: [r[key] for r in results if key in r]
            for key in ("wrong", "unverified", "contradiction", "correct",
                        "s_wrong", "s_unverified")
        }
        print(f"{case.name:24} {case.group:17} {expected or '-':5} "
              + " ".join(fmt(cols[key]) for key in cols))
        rows.append({"name": case.name, "group": case.group, "expected": expected,
                     "runs": results})

    OUT.mkdir(exist_ok=True)
    path = OUT / f"jev_claims_{datetime.now():%Y%m%d_%H%M%S}.json"
    path.write_text(json.dumps(rows, indent=2))
    print(f"\n{len(flat)} Jev rounds -> {path}")


if __name__ == "__main__":
    asyncio.run(main())
