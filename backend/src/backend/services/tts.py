import httpx

from backend.chains.llm import Priced
from backend.config import settings

# what Gemini sends back with response_format "pcm": 24 kHz, mono, 16-bit, no header
SAMPLE_RATE = 24_000
BYTES_PER_SAMPLE = 2


def estimate_cost(pcm: bytes) -> float:
    # the response only has an x-generation-id; the billed cost shows up on /generation
    # a moment later. Waiting for it would delay every sentence, so: price x length
    seconds = len(pcm) / (SAMPLE_RATE * BYTES_PER_SAMPLE)
    return seconds * settings.tts_usd_per_audio_second


async def speak(text: str, voice: str) -> Priced[bytes]:
    # plain httpx like Jev: LangChain doesn't wrap /audio/speech. No retry: the browser
    # falls back to HeadTTS instead, a second try would only add seconds of silence
    async with httpx.AsyncClient(timeout=settings.tts_timeout_ms / 1000) as client:
        response = await client.post(
            f"{settings.openrouter_api_base}/audio/speech",
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key.get_secret_value()}"
            },
            json={
                "model": settings.tts_model,
                "input": text,
                "voice": voice,
                "response_format": "pcm",
            },
        )
        response.raise_for_status()
    pcm = response.content
    if not pcm or len(pcm) % BYTES_PER_SAMPLE:
        raise ValueError("TTS sent no usable audio")
    return Priced(value=pcm, cost=estimate_cost(pcm))
