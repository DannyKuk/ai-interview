from typing import Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from backend.guard.plan_signature import is_signed
from backend.schemas.chat import (
    MAX_MESSAGE_CHARS,
    PLAN_EXPIRED,
    InterviewSettings,
)
from backend.schemas.plan import MAX_EXTRA_TURNS, MAX_QUESTIONS, SignedPlan


class Exchange(BaseModel):
    # one interviewer message and the candidate's answer to it
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    interviewer: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)
    candidate: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class AnsweredQuestion(BaseModel):
    # everything said about one plan question: the question, then follow-ups / steering back
    model_config = ConfigDict(extra="forbid")

    question: int = Field(ge=0, lt=MAX_QUESTIONS)  # 0-based index in the plan
    exchanges: list[Exchange] = Field(min_length=1, max_length=1 + MAX_EXTRA_TURNS)


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: UUID  # the cost cap counts per session, feedback included
    settings: InterviewSettings
    plan: SignedPlan
    answers: list[AnsweredQuestion] = Field(min_length=1, max_length=MAX_QUESTIONS)

    @model_validator(mode="after")
    def answers_fit_the_plan(self) -> Self:
        # same rule as the chat: only our own plan.
        if not is_signed(self.plan):
            raise PydanticCustomError("plan_not_signed", PLAN_EXPIRED)
        indices = [answer.question for answer in self.answers]
        if len(set(indices)) != len(indices):
            raise PydanticCustomError("duplicate_question", "Each question only once.")
        if max(indices) >= len(self.plan.plan.questions):
            raise PydanticCustomError("question_past_plan", PLAN_EXPIRED)
        return self


class CriterionScore(BaseModel):
    criterion: str  # a rubric line of the plan, or the fixed one for the question type
    met: float  # Jev: P(the answer meets it)
    score: float  # 1-5 = 1 + 4 * met


class AnswerEvaluation(BaseModel):
    question: int  # 0-based index in the plan
    topic: str
    asked: str  # the planned question
    criteria: list[CriterionScore]
    score: float  # 1-5, the average of the criteria
    feedback: str  # LLM: what went well, what to improve
    unverified: bool = False  # claims Jev can't check: correctness isn't scored
    wrong_claim: bool = False  # a technical claim is certainly wrong: feedback names it


class Scorecard(BaseModel):
    overall: float  # 1-5, the average of the answered questions
    answered: int
    total: int  # questions in the plan
    strengths: list[str]  # LLM, 0-3: empty when nothing worked
    improvements: list[str]  # LLM, at most 3
    weakest_question: int
    sample_answer: str


class FeedbackResponse(BaseModel):
    evaluations: list[AnswerEvaluation]
    scorecard: Scorecard


class QuestionFeedback(BaseModel):
    model_config = ConfigDict(extra="forbid")

    number: int = Field(description="The question's number as shown, e.g. 2")
    feedback: str = Field(
        description="2-3 sentences to the candidate: what worked (if anything), what to do better"
    )


class FeedbackText(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # first, so the model reasons before it writes (FR-14). Not shown to the candidate
    analysis: str = Field(
        description="Per question: what the answer covered and missed, given the scores"
    )
    questions: list[QuestionFeedback] = Field(min_length=1, max_length=MAX_QUESTIONS)
    # may be empty: with min_length=1 it made one up for nonsense answers
    strengths: list[str] = Field(
        max_length=3, description="Only what the candidate did well; may be empty"
    )
    improvements: list[str] = Field(min_length=1, max_length=3)
    sample_answer: str = Field(
        description="A stronger answer to the weakest question, in the candidate's voice"
    )
