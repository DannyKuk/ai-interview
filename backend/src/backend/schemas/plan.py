from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MIN_QUESTIONS = 3
MAX_QUESTIONS = 8

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
