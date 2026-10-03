"""Spike (Oct 2): does the feedback name a wrong claim AND say what's correct? The saved
interview (contradiction_interview.json) with Q2 replaced by an answer that contains
the SQLite claim, flagged wrong_claim, run with two wordings of the prompt line.

    cd backend && uv run python ../docs/spikes/challenge/wrong_claim_feedback.py [--runs 3]
"""

import argparse
import asyncio
import json
from pathlib import Path

from backend.chains import feedback as feedback_chain
from backend.schemas.chat import InterviewSettings
from backend.schemas.feedback import AnsweredQuestion, CriterionScore
from backend.schemas.plan import InterviewPlan
from backend.services.answer_scores import ScoredAnswer

DATA = json.loads((Path(__file__).parent / "contradiction_interview.json").read_text())

Q2_ANSWER = (
    "I'd add a form with a field per weekday for the opening and closing time, and a "
    "Flask POST route that validates the times and saves them to SQLite. SQLite "
    "handles any number of simultaneous writes without locking, so if two staff "
    "members save at the same time I don't need to think about concurrency."
)

CURRENT = (
    "A technical claim here is clearly wrong: name it in one sentence and say "
    "what is correct. If the candidate corrected it later, say so."
)
VARIANTS = {
    "current": CURRENT,
    "start_with": (
        "Wrong claim: a technical claim in this answer is clearly wrong. Start the "
        "feedback for this question with one sentence that names the claim and says "
        "what is actually correct. If the candidate corrected it later, say so."
    ),
}

original_format = feedback_chain.format_question


def with_line(line: str):
    def format_question(plan, answer, scored):
        return original_format(plan, answer, scored).replace(CURRENT, line)

    return format_question


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runs", type=int, default=3)
    args = parser.parse_args()

    settings = InterviewSettings.model_validate(DATA["settings"])
    plan = InterviewPlan.model_validate(DATA["plan"])
    answers = [AnsweredQuestion.model_validate(a) for a in DATA["answers"]]
    q2 = answers[1]
    answers[1] = q2.model_copy(
        update={"exchanges": [q2.exchanges[0].model_copy(update={"candidate": Q2_ANSWER})]}
    )
    scores = []
    for e in DATA["evaluations"]:
        criteria = [CriterionScore.model_validate(c) for c in e["criteria"]]
        flagged = e["question"] == 1
        if flagged:  # a decent answer with one wrong claim, not the contradiction
            criteria = [
                c.model_copy(update={"score": 4.0, "met": 0.75})
                if not c.criterion.startswith("Stays consistent")
                else None
                for c in criteria
            ]
            criteria = [c for c in criteria if c]
            technical = next(c for c in criteria if "technically correct" in c.criterion)
            criteria[criteria.index(technical)] = technical.model_copy(
                update={"score": 1.2, "met": 0.05}
            )
        scores.append(
            ScoredAnswer(
                criteria=criteria,
                score=round(sum(c.score for c in criteria) / len(criteria), 2),
                wrong_claim=flagged,
            )
        )

    for name, line in VARIANTS.items():
        feedback_chain.format_question = with_line(line)
        results = await asyncio.gather(
            *(
                feedback_chain.write_feedback(settings, plan, answers, scores, 1)
                for _ in range(args.runs)
            )
        )
        cost = sum(r.cost or 0 for r in results)
        print(f"\n=== {name} (${cost:.4f})")
        for result in results:
            text = next(q.feedback for q in result.value.questions if q.number == 2)
            print(f"- {text}\n")


if __name__ == "__main__":
    asyncio.run(main())
