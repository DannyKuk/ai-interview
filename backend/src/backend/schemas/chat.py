from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from backend.prompts.turn_hints import HintName
from backend.schemas.guard import BlockReason

MAX_MESSAGE_CHARS = 4000  # we must "speak it", so keep it "short"
MAX_MESSAGES = 50
MAX_ROLE_CHARS = 60


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
    "Amazin'",
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


Technique = Literal[
    "zero_shot", "few_shot", "chain_of_thought", "persona", "self_critique"
]
DEFAULT_TECHNIQUE: Technique = "zero_shot"


class ChatRequest(BaseModel):
    # empty messages -> new chat
    model_config = ConfigDict(extra="forbid")
    session_id: UUID
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    settings: InterviewSettings = Field(default_factory=InterviewSettings)
    system_prompt: Technique = DEFAULT_TECHNIQUE


EndReason = Literal["candidate_left", "limit_reached"]


class ChatResponse(BaseModel):
    reply: str
    blocked: BlockReason | None = None
    hint: HintName | None = None
    ended: EndReason | None = None  # TODO: the frontend will end the call when set


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0  # includes reasoning tokens
    cost: float | None = None
