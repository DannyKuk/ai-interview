"""

This is a spike/prototype of the stt (speech to text)/transcription.

I've rejected this approach after thoroughly testing due to the timing.
We have an accurate transcription, though the time it takes to transcribe was unstable, reaching from 1.6s - >10s
Additionally, the users voice leaves the machine to a cloud hosted AI model.

New Approach:
We can use a transcription in the browser, this allows us to use WebGPU - though, it requires more computing power
by the user.

"""

import base64
import time
from pathlib import Path

from openrouter import OpenRouter, components, errors

from backend.config import settings

TEXT = "I have five years of experience with Python and FastAPI."
OUT = Path(__file__).parent / "out"
AUDIO = OUT / "stt_test.wav"
RUNS = 3

MODELS = [
    "openai/whisper-large-v3-turbo",
    "openai/gpt-4o-mini-transcribe",
]


def transcribe(client: OpenRouter, model: str, audio_b64: str) -> float | None:
    """Transcribe once. Returns the duration in seconds, or None on failure."""
    start = time.perf_counter()
    try:
        result = client.stt.create_transcription(
            model=model,
            input_audio=components.STTInputAudio(data=audio_b64, format_="wav"),
            language="en",
        )
    except errors.OpenRouterError as e:
        print(f"  FAILED {e.status_code}: {e.body[:200]}")
        return None
    elapsed = time.perf_counter() - start

    cost = result.usage.cost if result.usage else None
    print(f"  {elapsed:5.2f}s  cost={cost}  text={result.text.strip()!r}")
    return elapsed


if __name__ == "__main__":
    audio_b64 = base64.b64encode(AUDIO.read_bytes()).decode()
    print(f"expected: {TEXT!r}\n")

    with OpenRouter(
            api_key=settings.openrouter_api_key.get_secret_value(),
            server_url=settings.openrouter_api_base,
    ) as client:
        for model in MODELS:
            print(f"--- {model} ---")
            times = []
            for _ in range(RUNS):
                elapsed = transcribe(client, model, audio_b64)
                if elapsed is None:
                    break  # blocked/broken model
                times.append(elapsed)

            if times:
                warm = times[1:] or times
                print(
                    f"  first={times[0]:.2f}s  warm avg={sum(warm) / len(warm):.2f}s\n"
                )
            else:
                print()
