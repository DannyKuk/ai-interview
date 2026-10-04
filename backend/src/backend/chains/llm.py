from dataclasses import dataclass

from langchain_openrouter import ChatOpenRouter
from openrouter.utils import BackoffStrategy, RetryConfig

from backend.config import settings
from backend.schemas.chat import Effort

NO_RETRIES = RetryConfig("none", BackoffStrategy(0, 0, 0, 0), False)


def get_chat_model(
        model: str | None = None,
        max_tokens: int = 1000,
        effort: Effort = "low",
        timeout_ms: int | None = None,
) -> ChatOpenRouter:
    llm = ChatOpenRouter(
        model=model or settings.default_model,
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_api_base,
        max_tokens=max_tokens,
        reasoning={"effort": effort},
        timeout=timeout_ms or settings.llm_timeout_ms,
    )
    # max_retries isn't a count: the SDK retries timeouts too, for up to max_retries × 150 s,
    # and 0 falls back to its default of up to an hour. Off = the timeout is the real
    # limit, the user retries from the UI
    llm.client.sdk_configuration.retry_config = NO_RETRIES
    return llm


@dataclass
class Priced[T]:
    value: T
    cost: float | None  # USD


def priced(result: dict, what: str) -> Priced:
    # with_structured_output(include_raw=True) returns {"raw", "parsed", "parsing_error"}
    if result["parsing_error"] or result["parsed"] is None:
        raise ValueError(f"{what} reply didn't parse")
    return Priced(
        value=result["parsed"], cost=result["raw"].response_metadata.get("cost")
    )
