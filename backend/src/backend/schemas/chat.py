from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_MESSAGE_CHARS = 4000  # we must "speak it", so keep it "short"
MAX_MESSAGES = 50
MAX_ROLE_CHARS = 60


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # only send user and assistant messages, never the system prompt
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class InterviewSettings(BaseModel):
    # these values will be in the system prompt, so we try to keep them as "safe" as possible
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    company: Literal[
        "Guugle",
        "HeadBook",
        "Instakilogram",
        "Netflux",
        "Amazin'",
        "Goldman Sax",
        "Tesler",
        "Starbacks",
    ] = "Guugle"

    # free text (a CV can be for any job), but short and without sentences
    # TODO: currently the user could still prompt inject like "Ignore all instructions". We must implement a guard.
    role: str = Field(
        default="Software Engineer",
        min_length=2,
        max_length=MAX_ROLE_CHARS,
        pattern=r"^[A-Za-z0-9 \-/&,.()']+$",
    )
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    persona: Literal["friendly", "neutral", "strict"] = "friendly"


Technique = Literal[
    "zero_shot", "few_shot", "chain_of_thought", "persona", "self_critique"
]


class ChatRequest(BaseModel):
    # empty messages -> new chat
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)
    settings: InterviewSettings = Field(default_factory=InterviewSettings)
    system_prompt: Technique = "zero_shot"


class ChatResponse(BaseModel):
    reply: str


class Usage(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0  # includes reasoning tokens
    cost: float | None = None
