from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Seniority = Literal["junior", "mid", "senior", "lead"]


class Experience(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(description="Job title as written in the CV")
    company: str
    period: str = Field(description='As written in the CV, e.g. "2021 – present"')
    highlights: list[str] = Field(
        max_length=3, description="Up to 3 short achievements, only facts from the CV"
    )


class CandidateProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # no email, phone or address: the profile goes along with every chat turn
    first_name: str | None = Field(description="First name only, null if not found")
    headline: str = Field(description="One line: profession, years, focus")
    seniority: Seniority = Field(
        description="Level in the candidate's own field, not in the job they apply for"
    )
    years_experience: int | None = Field(
        description="Total years of work experience, null if unclear"
    )
    skills: list[str] = Field(max_length=15)
    experience: list[Experience] = Field(max_length=5, description="Newest first")
    education: list[str] = Field(max_length=3)
    interview_topics: list[str] = Field(
        min_length=3,
        max_length=5,
        description="Concrete things from this CV an interviewer could ask about",
    )
