"""Spike (Oct 2): can the live wrong-claim threshold go from 0.9 to 0.8? The SQLite
claim got only 0.82 under another question in a real interview. Measures the guard's
real question on more correct-but-recent claims and on wrong claims in other contexts.

    cd backend && uv run python ../docs/spikes/challenge/threshold_check.py [--runs 2]
"""

import argparse
import asyncio
import statistics
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from jev_claims import A1, CASES, Case, candidate_state  # noqa: E402

from backend.guard.jev import WRONG_CLAIM_QUESTION, ask_jev  # noqa: E402

SQLITE = (
    "SQLite handles any number of simultaneous writes without locking, so all five "
    "bakers could save at the same time and I never had to think about concurrency."
)

NEW = [
    # correct, recent or niche
    Case("py313_jit", "true_recent2", "How would you make a Python service faster?",
         "First profile it. Python 3.13 also added an experimental JIT compiler, but "
         "it's off by default, so I wouldn't count on it yet."),
    Case("node_strip_types", "true_recent2", "How would you run a small TypeScript script?",
         "With a recent Node.js I can run it directly: Node 22 added the "
         "--experimental-strip-types flag, which strips the types without a build step."),
    Case("tailwind4_theme", "true_recent2", "How do you set up your CSS?",
         "Tailwind CSS v4. The configuration moved into the CSS file itself with the "
         "@theme directive, so there's no tailwind.config.js anymore."),
    Case("django_db_default", "true_recent2", "How would you give a model field a default timestamp?",
         "Since Django 5.0 there's db_default, so the database computes the default, "
         "for example with Now(), instead of Python."),
    Case("pydantic_rust", "true_recent2", "Why did you pick Pydantic?",
         "It's fast because Pydantic v2's validation core, pydantic-core, is written in "
         "Rust, and it gives me clear error messages."),
    Case("uv_python", "true_recent2", "How do you manage Python versions?",
         "With uv: it can install Python itself with uv python install, so I don't "
         "need pyenv anymore."),
    Case("http3_quic", "true_recent2", "What do you know about HTTP/3?",
         "HTTP/3 runs over QUIC, which is built on UDP instead of TCP, so a lost "
         "packet doesn't block the other streams."),
    Case("css_anchor", "true_recent2", "How would you place a tooltip next to a button?",
         "Newer Chrome versions support CSS anchor positioning, so I can place the "
         "tooltip relative to the button without JavaScript, with a fallback for "
         "other browsers."),
    Case("bun_sqlite", "true_recent2", "How would you store data in a small Bun script?",
         "Bun has a built-in SQLite driver, bun:sqlite, so I wouldn't need an extra "
         "package."),
    Case("git_switch", "true_recent2", "How do you change branches?",
         "With git switch. Git 2.23 added switch and restore to split up the "
         "overloaded git checkout."),
    Case("ruff_format", "true_recent2", "Which linters do you use for Python?",
         "Ruff for both: ruff check replaces Flake8 and its plugins, and ruff format "
         "is a Black-compatible formatter."),
    Case("sqlite_returning", "true_recent2", "How do you get the id of a new row?",
         "SQLite 3.35 added RETURNING, so the INSERT gives me the new id directly."),
    Case("pg17_json_table", "true_recent2", "How would you query JSON data in Postgres?",
         "Postgres 17 added JSON_TABLE, which turns JSON into rows I can query with "
         "normal SQL."),
    Case("react_compiler", "true_recent2", "How do you avoid unnecessary re-renders?",
         "With the React Compiler it memoizes components and values automatically, so "
         "I mostly don't need useMemo and useCallback by hand anymore."),
    # wrong, in other contexts
    Case("sqlite_problem", "wrong2", "What problem did your stock tracker solve?",
         "We over-ordered flour. The app replaced the paper list. I used SQLite "
         "because " + SQLITE[0].lower() + SQLITE[1:], expect_wrong=True),
    Case("sqlite_choice", "wrong2", "Which technologies did you use, and why?",
         "Flask and SQLite. I picked SQLite because " + SQLITE[0].lower() + SQLITE[1:],
         expect_wrong=True),
    Case("sqlite_team", "wrong2", "How did the bakers use the app together?",
         "Every morning all five entered their counts at once. " + SQLITE,
         expect_wrong=True),
    Case("sqlite_bug", "wrong2", "The counts are wrong; how would you find the bug?",
         "I'd compare with a manual count. It can't be concurrency: " + SQLITE,
         expect_wrong=True),
    Case("dict_order", "wrong2", "How do you keep data in order in Python?",
         "Python dictionaries don't keep insertion order, so I sort the keys every "
         "time I loop over one.", expect_wrong=True),
    Case("json_binary", "wrong2", "How does your frontend talk to the backend?",
         "With JSON over HTTP. JSON is a binary format, so I compress it before "
         "sending.", expect_wrong=True),
    Case("git_diffs", "wrong2", "How does Git store your history?",
         "Git stores each commit as a diff against the previous one, that's why "
         "checking out an old commit is slow.", expect_wrong=True),
    Case("status_404", "wrong2", "What does a 404 mean?",
         "A 404 means the server crashed, so I'd restart it.", expect_wrong=True),
    Case("index_inserts", "wrong2", "How would you speed up the database?",
         "I'd add an index on every column: indexes make every query faster, "
         "including inserts.", expect_wrong=True),
    Case("docker_vm", "wrong2", "What is Docker?",
         "Docker containers are full virtual machines, each with its own kernel.",
         expect_wrong=True),
]


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=2)
    args = parser.parse_args()

    # the old groups too, with the app's real question
    cases = [c for c in CASES if c.group in ("wrong", "true_odd", "true_recent", "personal")]
    cases += NEW
    for case in cases:
        case.earlier = [A1]
    jobs = [
        ask_jev(candidate_state(c), {"wrong": WRONG_CLAIM_QUESTION})
        for c in cases
        for _ in range(args.runs)
    ]
    flat = [reply.answers for reply in await asyncio.gather(*jobs)]
    rows = []
    for i, case in enumerate(cases):
        values = [a["wrong"]["noul"] for a in flat[i * args.runs : (i + 1) * args.runs]]
        rows.append((case, statistics.mean(values), max(values) - min(values)))
    for case, mean, spread in sorted(rows, key=lambda r: r[1]):
        print(f"{case.name:24} {case.group:13} {'W' if case.expect_wrong else '-'}  "
              f"{mean:.2f} ±{spread:.2f}")
    right = [m for c, m, _ in rows if not c.expect_wrong]
    wrong = [m for c, m, _ in rows if c.expect_wrong]
    print(f"\ncorrect: {len(right)}, max {max(right):.2f} | wrong: {len(wrong)}, "
          f"min {min(wrong):.2f}")
    for threshold in (0.7, 0.75, 0.8, 0.85, 0.9):
        print(f"  {threshold}: catches {sum(m >= threshold for m in wrong)}/{len(wrong)} "
              f"wrong, challenges {sum(m >= threshold for m in right)}/{len(right)} correct")


if __name__ == "__main__":
    asyncio.run(main())
