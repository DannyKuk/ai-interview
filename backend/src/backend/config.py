from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# The .env file is in the repo root: 4 folders up from this file
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    # openrouter_api_key = OPENROUTER_API_KEY
    openrouter_api_key: SecretStr  # no default = required
    openrouter_api_base: str = "https://openrouter.ai/api/v1"
    default_model: str = "openai/gpt-5-mini"
    llm_timeout_ms: int = 30_000

    cors_origins: list[str] = ["http://localhost:3000"]


# Created once when the app starts. Import it wherever you need config.
settings = Settings()
