import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Response

from backend.api.cost_cap import add_cost, over_cap, report_cost
from backend.api.interview import REFUSALS as CHAT_REFUSALS
from backend.api.rate_limit import chat_rate_limit
from backend.chains.feedback import write_feedback
from backend.guard.jev import check_input
from backend.schemas.feedback import (
    AnswerEvaluation,
    FeedbackRequest,
    FeedbackResponse,
    Scorecard,
)
from backend.services.answer_scores import score_answer

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/interview", tags=["interview"], dependencies=[Depends(chat_rate_limit)]
)

# 422: nothing gets scored when part of it is manipulated (same rule as the CV)
FEEDBACK_REFUSED = (
    "We can't score this interview: part of it reads like instructions to the AI. "
    "Please start a new interview."
)
# 503 = "not your fault, try again" (guard error, LLM timeout, …)
FEEDBACK_FAILED = "We couldn't prepare your feedback right now. Please try again."
OVER_BUDGET = "This interview has used up its budget, so there's no feedback for it."
# the LLM skipped a question: its scores still show
NO_WRITTEN_FEEDBACK = "No written feedback for this answer, but its scores still count."


@router.post("/feedback")
async def create_feedback(
    request: FeedbackRequest, response: Response
) -> FeedbackResponse:
    if over_cap(request.session_id):
        raise HTTPException(status_code=429, detail=OVER_BUDGET)
    plan = request.plan.plan
    answers = sorted(request.answers, key=lambda answer: answer.question)

    # each answer is checked against the answers to the questions before it
    earlier = [
        [exchange.candidate for answer in answers[:i] for exchange in answer.exchanges]
        for i in range(len(answers))
    ]
    # all Jev calls at once (~0.5 s): the role goes into the feedback prompt, and the
    # history comes from the browser, so both are checked again
    role, *scores = await asyncio.gather(
        check_input(request.settings.role),
        *(
            score_answer(plan.questions[a.question], a.exchanges, earlier[i])
            for i, a in enumerate(answers)
        ),
    )
    blocked = {role.blocked, *(scored.blocked for scored in scores)}
    if "guard_error" in blocked:
        raise HTTPException(status_code=503, detail=FEEDBACK_FAILED)
    if "role" in blocked:
        raise HTTPException(status_code=422, detail=CHAT_REFUSALS["role"])
    if "injection" in blocked:
        raise HTTPException(status_code=422, detail=FEEDBACK_REFUSED)

    # the sample answer is for the lowest score
    weakest = min(zip(answers, scores), key=lambda pair: pair[1].score)[0].question
    try:
        written = await write_feedback(request.settings, plan, answers, scores, weakest)
    except Exception as error:
        logger.warning("feedback failed: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail=FEEDBACK_FAILED) from error
    add_cost(request.session_id, written.cost)
    report_cost(response, written.cost)

    # the LLM numbers the questions as shown (1-based)
    feedback_for = {
        entry.number - 1: entry.feedback for entry in written.value.questions
    }
    evaluations = [
        AnswerEvaluation(
            question=answer.question,
            topic=plan.questions[answer.question].topic,
            asked=plan.questions[answer.question].question,
            criteria=scored.criteria,
            score=scored.score,
            feedback=feedback_for.get(answer.question, NO_WRITTEN_FEEDBACK),
            unverified=scored.unverified,
            wrong_claim=scored.wrong_claim,
            contradiction=scored.contradiction,
        )
        for answer, scored in zip(answers, scores)
    ]
    overall = sum(evaluation.score for evaluation in evaluations) / len(evaluations)
    return FeedbackResponse(
        evaluations=evaluations,
        scorecard=Scorecard(
            overall=round(overall, 2),
            answered=len(answers),
            total=len(plan.questions),
            strengths=written.value.strengths,
            improvements=written.value.improvements,
            weakest_question=weakest,
            sample_answer=written.value.sample_answer,
        ),
    )
