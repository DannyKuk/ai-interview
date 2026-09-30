from langchain_openrouter import ChatOpenRouter

from backend.config import settings
from backend.schemas.chat import Effort


def get_chat_model(
    model: str | None = None,
    max_tokens: int = 1000,
    effort: Effort = "low",
    timeout_ms: int | None = None,
) -> ChatOpenRouter:
    return ChatOpenRouter(
        model=model or settings.default_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_api_base,
        max_tokens=max_tokens,
        reasoning={"effort": effort},
        timeout=timeout_ms or settings.llm_timeout_ms,
        max_retries=2,
    )
