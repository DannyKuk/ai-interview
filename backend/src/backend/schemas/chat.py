from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from backend import config
from backend.prompts.turn_hints import HintName
from backend.schemas.guard import BlockReason
from backend.schemas.plan import MAX_QUESTIONS, MIN_QUESTIONS

MAX_MESSAGE_CHARS = 4000  # we must "speak it", so keep it "short"
MAX_MESSAGES = 50
MAX_ROLE_CHARS = 60
# max_tokens includes the reasoning tokens: below ~500 low effort can use it all up
MIN_MAX_TOKENS = 500
MAX_MAX_TOKENS = 4000


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # only send user and assistant messages, never the system prompt
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


Company = Literal[
    "Guugle",
    "HeadBook",
    "Instakilogram",
    "Netflux",
    "Amazin",
    "Goldman Sax",
    "Tesler",
    "Starbacks",
]
Difficulty = Literal["easy", "medium", "hard"]
Persona = Literal["friendly", "neutral", "strict"]


class InterviewSettings(BaseModel):
    # these values will be in the system prompt, so we try to keep them as "safe" as possible
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    company: Company = "Guugle"

    # free text (a CV can be for any job), but short and without sentences.
    # simple filter before guard checks it
    role: str = Field(
        default="Software Engineer",
        min_length=2,
        max_length=MAX_ROLE_CHARS,
        pattern=r"^[A-Za-z0-9 \-/&,.()']+$",
    )
    difficulty: Difficulty = "medium"
    persona: Persona = "friendly"
    question_count: int = Field(default=5, ge=MIN_QUESTIONS, le=MAX_QUESTIONS)


Technique = Literal[
    "zero_shot", "few_shot", "chain_of_thought", "persona", "self_critique"
]
DEFAULT_TECHNIQUE: Technique = "zero_shot"

Effort = Literal["minimal", "low", "medium", "high"]


class ModelSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    model: str | None = None  # None = default_model from config
    reasoning_effort: Effort = "low"
    max_tokens: int = Field(default=1000, ge=MIN_MAX_TOKENS, le=MAX_MAX_TOKENS)

    @field_validator("model")
    @classmethod
    def model_is_allowed(cls, model: str | None) -> str | None:
        if model is not None and model not in config.settings.allowed_models:
            raise ValueError(f"model must be one of {config.settings.allowed_models}")
        return model


class ChatRequest(BaseModel):
    # empty messages -> new chat
    model_config = ConfigDict(extra="forbid")
    session_id: UUID
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    settings: InterviewSettings = Field(default_factory=InterviewSettings)
    system_prompt: Technique = DEFAULT_TECHNIQUE
    model_settings: ModelSettings = Field(default_factory=ModelSettings)


EndReason = Literal["candidate_left", "limit_reached"]


class ChatResponse(BaseModel):
    reply: str
    blocked: BlockReason | None = None
    hint: HintName | None = None
    ended: EndReason | None = None  # the frontend ends the call when set


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0  # includes reasoning tokens
    cost: float | None = None
