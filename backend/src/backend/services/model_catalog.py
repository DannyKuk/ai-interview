import logging

import httpx

from backend.config import settings
from backend.schemas.config import ModelInfo

logger = logging.getLogger(__name__)

# filled on the first successful fetch - names and prices don't change while the app runs
_cache: list[ModelInfo] | None = None


async def fetch_models() -> list[dict]:
    # /models/user = only the models this key can call
    async with httpx.AsyncClient(timeout=settings.models_timeout_ms / 1000) as client:
        response = await client.get(
            f"{settings.openrouter_api_base}/models/user",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key.get_secret_value()}"
            },
        )
        response.raise_for_status()
        return response.json()["data"]


def per_million(price: str | None) -> float | None:
    # OpenRouter sends USD per token as a string, e.g. "0.00000025" -> 0.25
    return None if price is None else round(float(price) * 1_000_000, 4)


def to_model_info(raw: dict) -> ModelInfo:
    pricing = raw.get("pricing", {})
    return ModelInfo(
        id=raw["id"],
        name=raw.get("name"),
        input_price_per_m=per_million(pricing.get("prompt")),
        output_price_per_m=per_million(pricing.get("completion")),
        supported_parameters=raw.get("supported_parameters"),
        reasoning_efforts=(raw.get("reasoning") or {}).get("supported_efforts"),
    )


def filter_allowed(raw_models: list[dict], allowed: list[str]) -> list[ModelInfo]:
    by_id = {raw["id"]: raw for raw in raw_models}
    return [to_model_info(by_id[model]) for model in allowed if model in by_id]


async def get_models() -> list[ModelInfo]:
    global _cache
    if _cache is not None:
        return _cache

    try:
        models = filter_allowed(await fetch_models(), settings.allowed_models)
    except (httpx.HTTPError, KeyError, TypeError, ValueError) as error:
        logger.warning("model list fetch failed: %s", type(error).__name__)
        return [ModelInfo(id=model) for model in settings.allowed_models]

    _cache = models
    return models
