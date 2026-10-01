from pydantic import BaseModel

from backend.schemas.chat import (
    Company,
    Difficulty,
    InterviewSettings,
    ModelSettings,
    Persona,
    Technique,
)


class ModelInfo(BaseModel):
    id: str
    name: str | None = None
    input_price_per_m: float | None = None  # USD per 1M tokens
    output_price_per_m: float | None = None
    supported_parameters: list[str] | None = None  # the dev panel hides the rest
    reasoning_efforts: list[str] | None = None


class AppConfig(BaseModel):
    # everything the setup page and dev panel need
    models: list[ModelInfo]
    default_model: str
    techniques: list[Technique]
    default_technique: Technique
    companies: list[Company]
    interviewers: dict[Company, str]
    difficulties: list[Difficulty]
    personas: list[Persona]
    default_settings: InterviewSettings
    default_model_settings: ModelSettings
    max_tokens_range: tuple[int, int]  # (min, max) the backend accepts
    question_count_range: tuple[int, int]  # (min, max) questions in a plan
    session_cost_cap_usd: float  # per interview: chat, voice and feedback stop here
