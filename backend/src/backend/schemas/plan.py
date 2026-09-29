from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.chat import MAX_QUESTIONS, MIN_QUESTIONS, InterviewSettings
from backend.schemas.cv import CandidateProfile

MAX_JD_CHARS = 8000

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


class PlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    settings: InterviewSettings = Field(default_factory=InterviewSettings)
    # both optional
    profile: CandidateProfile | None = None  # from /api/cv/parse
    job_description: str | None = Field(default=None, max_length=MAX_JD_CHARS)


class SignedPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan: InterviewPlan
    # hex SHA-256. The pattern also keeps compare_digest happy: it needs ASCII strings
    signature: str = Field(pattern=r"^[0-9a-f]{64}$")
