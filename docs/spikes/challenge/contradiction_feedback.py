"""Spike (Oct 2): does the feedback name both statements of a contradiction? Reruns the
feedback LLM on a saved real interview (contradiction_interview.json, Q2 flagged) with
different wordings of the prompt line.

    cd backend && uv run python ../docs/spikes/challenge/contradiction_feedback.py [--runs 3]
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

CURRENT = (
    "This answer contradicts something the candidate said to an earlier "
    "question: name both statements in one sentence. If they cleared it up, "
    "say so."
)
VARIANTS = {
    "current": CURRENT,
    "quote_first": (
        "Contradiction: something in this answer can't be true together with an "
        "answer to an earlier question. Start the feedback for this question with one "
        "sentence that names both: what the candidate said earlier and what they said "
        "here. If they cleared it up later, say so."
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
    scores = [
        ScoredAnswer(
            criteria=[CriterionScore.model_validate(c) for c in e["criteria"]],
            score=e["score"],
            unverified=e["unverified"],
            wrong_claim=e["wrong_claim"],
            contradiction=e["contradiction"],
        )
        for e in DATA["evaluations"]
    ]
    flagged = next(e["question"] for e in DATA["evaluations"] if e["contradiction"])

    for name, line in VARIANTS.items():
        feedback_chain.format_question = with_line(line)
        results = await asyncio.gather(
            *(
                feedback_chain.write_feedback(
                    settings, plan, answers, scores, DATA["weakest"]
                )
                for _ in range(args.runs)
            )
        )
        cost = sum(r.cost or 0 for r in results)
        print(f"\n=== {name} (${cost:.4f})")
        for result in results:
            text = next(
                q.feedback for q in result.value.questions if q.number == flagged + 1
            )
            print(f"- {text}\n")


if __name__ == "__main__":
    asyncio.run(main())
