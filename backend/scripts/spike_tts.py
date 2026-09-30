"""Spike: a real TTS model on POST /audio/speech (Gemini 3.8 Flash (Lite) TTS).

Same test lines as spike_audio_chat.py. Per line and voice: time to the first audio
byte, total time, seconds of audio, cost (from /generation, the response only has an
x-generation-id header), and whether it read the line word for word. There's no
transcript in the response, so Whisper (a plain STT model, it can't answer) checks it.
Writes each line as a wav to scripts/out/audio/.

    uv run python scripts/spike_tts.py
    uv run python scripts/spike_tts.py --model google/gemini-3.8-flash-tts --voices Kore Puck
    uv run python scripts/spike_tts.py --only instruction walk tell --repeat 3
"""

import argparse
import asyncio
import base64
import time

import httpx
from spike_audio_chat import OUT, SAMPLE_RATE, SENTENCES, headers, similarity, to_wav

from backend.config import settings

CHECK_MODEL = "openai/whisper-large-v3-turbo"
INTERVIEW_SECONDS = (150, 300)  # interviewer speech in one interview, for the estimate


async def speak(client: httpx.AsyncClient, model: str, voice: str, text: str) -> dict:
    body = {"model": model, "input": text, "voice": voice, "response_format": "pcm"}
    start = time.perf_counter()
    first_byte = None
    pcm = bytearray()
    async with client.stream(
        "POST", "/audio/speech", json=body, headers=headers()
    ) as response:
        if response.status_code != 200:
            raise RuntimeError(f"{response.status_code}: {await response.aread()}")
        generation = response.headers.get("x-generation-id")
        async for chunk in response.aiter_bytes():
            first_byte = first_byte or time.perf_counter() - start
            pcm += chunk
    return {
        "first_byte": first_byte,
        "total": time.perf_counter() - start,
        "pcm": bytes(pcm),
        "generation": generation,
    }


async def cost_of(client: httpx.AsyncClient, generation: str | None) -> float | None:
    # the stats show up a moment after the call
    for _ in range(10):
        response = await client.get(
            "/generation", params={"id": generation}, headers=headers()
        )
        if response.status_code == 200:
            return response.json()["data"].get("total_cost")
        await asyncio.sleep(1)
    return None


async def heard(client: httpx.AsyncClient, wav: bytes) -> str:
    body = {
        "model": CHECK_MODEL,
        "input_audio": {"data": base64.b64encode(wav).decode(), "format": "wav"},
        "language": "en",
    }
    response = await client.post("/audio/transcriptions", json=body, headers=headers())
    response.raise_for_status()
    return response.json()["text"].strip()  # Whisper adds a leading space


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default="google/gemini-3.8-flash-lite-tts")
    parser.add_argument("--voices", nargs="+", default=["Kore", "Charon", "Sulafat"])
    parser.add_argument("--only", nargs="+", help="test lines to run (default: all)")
    parser.add_argument("--repeat", type=int, default=1)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    short = args.model.split("/")[-1]
    lines = {k: v for k, v in SENTENCES.items() if not args.only or k in args.only}
    firsts, costs, audio_seconds, off_script = [], [], [], []

    async with httpx.AsyncClient(
        base_url=settings.openrouter_api_base, timeout=90
    ) as client:
        for voice in args.voices:
            print(f"\n=== {args.model}, {voice}")
            for name, text in lines.items():
                for run in range(args.repeat):
                    result = await speak(client, args.model, voice, text)
                    seconds = len(result["pcm"]) / 2 / SAMPLE_RATE
                    wav = to_wav(result["pcm"])
                    if run == 0:
                        (OUT / f"{name}_{short}_{voice}.wav").write_bytes(wav)
                    cost = await cost_of(client, result["generation"])
                    said = await heard(client, wav)
                    match = similarity(text, said)

                    firsts.append(result["first_byte"])
                    audio_seconds.append(seconds)
                    if cost is not None:
                        costs.append(cost)
                    if match < 0.9:
                        off_script.append(f"{voice}/{name}: {said}")
                    print(
                        f"  {name:<11} first byte {result['first_byte']:.2f} s | total "
                        f"{result['total']:.2f} s | {seconds:.1f} s audio | cost {cost} | "
                        f"match {match:.2f}"
                    )

    per_second = sum(costs) / sum(audio_seconds) if costs else None
    print(
        f"\nfirst byte {min(firsts):.2f}–{max(firsts):.2f} s "
        f"(mean {sum(firsts) / len(firsts):.2f})"
    )
    if per_second:
        low, high = (per_second * s for s in INTERVIEW_SECONDS)
        print(
            f"cost ${per_second:.6f} per second of audio → "
            f"${low:.3f}–{high:.3f} per interview"
        )
    print(f"off script (Whisper match < 0.9): {len(off_script)} of {len(firsts)}")
    for line in off_script:
        print(f"  {line}")


if __name__ == "__main__":
    asyncio.run(main())
