import secrets
from pathlib import Path

from pydantic import Field, SecretStr
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
    # one bigger call behind a loading screen: 10-21 s seen for 8 questions
    feedback_timeout_ms: int = 60_000
    models_timeout_ms: int = 5_000

    # GUARD model
    guard_model: str = "typesafe/jev-1.13"
    guard_threshold: float = 0.5  # block when P(injection) + P(abuse) >= this
    # Jev typically answeres in <1s but is sometimes much slower
    guard_timeout_ms: int = 5_000
    guard_retries: int = 1  # extra tries on a timeout / 502-504, then fail closed

    # turn hints
    end_threshold: float = 0.7
    off_topic_threshold: float = 0.7
    not_answered_threshold: float = 0.3
    # interview plan: ask one follow-up when P(vague) >= this
    follow_up_threshold: float = 0.5
    # challenge signals (45 cases, Oct 2): wrong claims 0.80-0.98, 29 correct ones
    # (recent / niche too) <= 0.72. 0.9 missed a real 0.82; 0.8 challenges 0 correct
    wrong_claim_threshold: float = 0.8
    # real contradictions 0.64-0.97, corrections / changed opinions <= 0.13
    contradiction_threshold: float = 0.5
    # feedback: correct but recent / niche claims 0.51-0.89, everything else that isn't
    # wrong <= 0.44 -> correctness isn't scored for that answer
    unverified_threshold: float = 0.45

    # reject a CV / job description when P(kind of document) is below this
    document_min_match: float = 0.5

    # per client IP, shared by chat, stream, plan, feedback, system-prompt ("limits" syntax)
    chat_rate_limit: str = "20/minute"
    cv_rate_limit: str = "5/minute"  # every CV upload is an LLM call
    # live captions re-send the answer so far ~1x per second, + the final pass
    stt_rate_limit: str = "120/minute"
    tts_rate_limit: str = "60/minute"  # one call per sentence, a reply has ~2-6
    # per interview (session_id). A normal interview costs about $0.01
    session_cost_cap_usd: float = 0.10

    # speech-to-text, local on the CPU (docs/decisions/speech-to-text.md)
    stt_model: str = "nemo-parakeet-tdt-0.6b-v2"
    stt_threads: int = 4  # the spike's setting: 0.3 s for a 15 s answer

    # text-to-speech when the switch is on (docs/decisions/text-to-speech.md). Off = HeadTTS, local
    tts_model: str = "google/gemini-3.8-flash-lite-tts"
    tts_timeout_ms: int = 15_000  # 1.4-3.8 s per sentence in the spike
    # estimate, the response has no cost: $6 per 1M audio tokens x 25 tokens per second.
    # The spike's billed cost was $0.00012-0.00014/s, so it errs on the cap's safe side
    tts_usd_per_audio_second: float = 0.00015

    cors_origins: list[str] = ["http://localhost:3000"]

    # signs the interview plan: it goes through the browser and into the chat prompt.
    plan_signing_key: SecretStr = Field(
        default_factory=lambda: SecretStr(secrets.token_urlsafe(32)), min_length=32
    )


# Created once when the app starts. Import it wherever you need config.
settings = Settings()
