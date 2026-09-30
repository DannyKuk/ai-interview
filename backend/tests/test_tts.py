import json

import httpx
import pytest

from backend.config import settings
from backend.services import tts
from backend.services.tts import SAMPLE_RATE, speak

ONE_SECOND = bytes(SAMPLE_RATE * 2)  # 24 kHz x 16-bit


def fake_openrouter(monkeypatch, response: httpx.Response) -> list[httpx.Request]:
    # OpenRouter answers with this. Returns the requests it got
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return response

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        tts.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    return calls


@pytest.mark.anyio
async def test_asks_for_raw_pcm_and_estimates_the_cost(monkeypatch):
    calls = fake_openrouter(monkeypatch, httpx.Response(200, content=ONE_SECOND * 3))

    audio = await speak("Tell me about a project you're proud of.", "Kore")

    assert audio.value == ONE_SECOND * 3
    assert audio.cost == pytest.approx(3 * settings.tts_usd_per_audio_second)
    assert calls[0].url.path.endswith("/audio/speech")
    assert json.loads(calls[0].content) == {
        "model": settings.tts_model,
        "input": "Tell me about a project you're proud of.",
        "voice": "Kore",
        "response_format": "pcm",
    }


@pytest.mark.anyio
async def test_provider_error_raises(monkeypatch):
    fake_openrouter(monkeypatch, httpx.Response(502))
    with pytest.raises(httpx.HTTPStatusError):
        await speak("Hello.", "Charon")


@pytest.mark.anyio
@pytest.mark.parametrize(
    "content", [b"", b"\x00\x00\x00"], ids=["empty", "half_sample"]
)
async def test_no_usable_audio_raises(monkeypatch, content):
    # a 200 without audio would otherwise play as silence and cost a cap entry
    fake_openrouter(monkeypatch, httpx.Response(200, content=content))
    with pytest.raises(ValueError):
        await speak("Hello.", "Charon")
