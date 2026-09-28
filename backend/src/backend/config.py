from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file is in the repo root: 4 folders up from this file
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # INTERVIEWER mode
    # openrouter_api_key = OPENROUTER_API_KEY
    openrouter_api_key: SecretStr  # no default = required
    openrouter_api_base: str = "https://openrouter.ai/api/v1"
    default_model: str = "openai/gpt-5-mini"
    allowed_models: list[str] = ["openai/gpt-5-mini", "openai/gpt-5-nano"]
    llm_timeout_ms: int = 30_000
    models_timeout_ms: int = 5_000

    # GUARD model
    guard_model: str = "typesafe/jev-1.13"
    guard_threshold: float = 0.5  # block when P(injection) + P(abuse) >= this
    guard_timeout_ms: int = 5_000  # Jev typically answeres in <1s

    # turn hints
    end_threshold: float = 0.7
    off_topic_threshold: float = 0.7
    not_answered_threshold: float = 0.3

    # per client IP, shared by both chat endpoints ("limits" syntax)
    chat_rate_limit: str = "20/minute"
    # per interview (session_id). A normal interview costs about $0.01
    session_cost_cap_usd: float = 0.10

    cors_origins: list[str] = ["http://localhost:3000"]


# Created once when the app starts. Import it wherever you need config.
settings = Settings()
