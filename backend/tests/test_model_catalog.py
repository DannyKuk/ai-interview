import asyncio

import httpx
import pytest

from backend.config import settings
from backend.services import model_catalog

# trimmed from a real GET /models/user response (28.09.2026)
GPT_5_MINI = {
    "id": "openai/gpt-5-mini",
    "name": "OpenAI: GPT-5 Mini",
    "pricing": {"prompt": "0.00000025", "completion": "0.000002"},
    "supported_parameters": ["max_tokens", "reasoning", "seed"],
    "reasoning": {"supported_efforts": ["high", "medium", "low", "minimal"]},
}
NOT_ALLOWED = {"id": "anthropic/claude-haiku-4.5", "name": "Claude Haiku 4.5"}


@pytest.fixture(autouse=True)
def empty_cache(monkeypatch):
    monkeypatch.setattr(model_catalog, "_cache", None)
    monkeypatch.setattr(
        settings, "allowed_models", ["openai/gpt-5-mini", "openai/gpt-5-nano"]
    )


def test_only_allowed_models_the_key_can_call_are_listed(monkeypatch):
    async def fake_fetch():
        return [NOT_ALLOWED, GPT_5_MINI]  # gpt-5-nano missing = key can't call it

    monkeypatch.setattr(model_catalog, "fetch_models", fake_fetch)
    models = asyncio.run(model_catalog.get_models())

    assert [model.id for model in models] == ["openai/gpt-5-mini"]
    assert models[0].input_price_per_m == 0.25
    assert models[0].output_price_per_m == 2.0
    assert models[0].reasoning_efforts == ["high", "medium", "low", "minimal"]


def test_failed_fetch_falls_back_to_the_allow_list_and_retries(monkeypatch):
    async def failing_fetch():
        raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(model_catalog, "fetch_models", failing_fetch)
    models = asyncio.run(model_catalog.get_models())

    assert [model.id for model in models] == settings.allowed_models
    assert models[0].input_price_per_m is None
    assert model_catalog._cache is None  # the next request tries again
