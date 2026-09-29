from typing import get_args

from fastapi import APIRouter

from backend.config import settings
from backend.schemas.chat import (
    DEFAULT_TECHNIQUE,
    MAX_MAX_TOKENS,
    MIN_MAX_TOKENS,
    Company,
    Difficulty,
    InterviewSettings,
    ModelSettings,
    Persona,
    Technique,
)
from backend.schemas.config import AppConfig
from backend.schemas.plan import MAX_QUESTIONS, MIN_QUESTIONS
from backend.services.model_catalog import get_models

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/config")
async def get_config() -> AppConfig:
    return AppConfig(
        models=await get_models(),
        default_model=settings.default_model,
        techniques=list(get_args(Technique)),
        default_technique=DEFAULT_TECHNIQUE,
        companies=list(get_args(Company)),
        difficulties=list(get_args(Difficulty)),
        personas=list(get_args(Persona)),
        default_settings=InterviewSettings(),
        default_model_settings=ModelSettings(model=settings.default_model),
        max_tokens_range=(MIN_MAX_TOKENS, MAX_MAX_TOKENS),
        question_count_range=(MIN_QUESTIONS, MAX_QUESTIONS),
    )
