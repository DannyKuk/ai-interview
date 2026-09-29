from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MIN_QUESTIONS = 3
MAX_QUESTIONS = 8
MAX_JD_CHARS = 8000
# turns the interviewer may stay on one question (follow-up, steering back), then it moves on
MAX_EXTRA_TURNS = 2

QuestionType = Literal[
    "motivation", "experience", "behavioural", "technical", "situational"
]


class PlannedQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: QuestionType
    topic: str = Field(description='Short label, e.g. "event streaming at Spotifly"')
    question: str = Field(
        description="The core question. The interviewer phrases it in its own words"
    )
    why: str = Field(
        description='One sentence, e.g. "The job description asks for Kafka, the CV shows Kafka"'
    )
    rubric: list[str] = Field(
        min_length=2,
        max_length=4,
        description='Yes/no statements a good answer meets, e.g. "Gives a concrete example"',
    )


class InterviewPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    approach: str = Field(
        description='One line, e.g. "Career changer: focus on motivation and transferable skills"'
    )
    questions: list[PlannedQuestion] = Field(
        min_length=MIN_QUESTIONS, max_length=MAX_QUESTIONS
    )


class SignedPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: InterviewPlan
    # hex SHA-256. The pattern also keeps compare_digest happy: it needs ASCII strings
    signature: str = Field(pattern=r"^[0-9a-f]{64}$")


class PlanProgress(BaseModel):
    # sent back by the browser every turn. Changing it only skips your own questions
    model_config = ConfigDict(extra="forbid")

    # 0-based: the question being asked
    question: int = Field(default=0, ge=0, lt=MAX_QUESTIONS)
    # follow-ups and steering back spent on this question
    extra_turns: int = Field(default=0, ge=0, le=MAX_EXTRA_TURNS)
