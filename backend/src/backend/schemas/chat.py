from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

MAX_MESSAGE_CHARS = 4000  # we must "speak it", so keep it "short"
MAX_MESSAGES = 50


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    # only send user and assistant messages, never the system prompt
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    # empty messages -> new chat
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(max_length=MAX_MESSAGES)


class ChatResponse(BaseModel):
    reply: str
