"""Make the synthetic test clips: every text in clips.json read by HeadTTS in two voices.

    uv run python gen_clips.py            # HeadTTS on :8882 (docker compose up headtts)

Writes clips/<name>_<voice>.wav as 16 kHz mono (HeadTTS gives 24 kHz; ffmpeg resamples).
"""

import base64
import json
import subprocess
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
URL = "http://localhost:8882/v1/synthesize"
VOICES = ["af_heart", "am_michael"]


def synthesize(text: str, voice: str) -> bytes:
    body = {"input": text, "voice": voice, "language": "en-us", "audioEncoding": "wav"}
    request = urllib.request.Request(
        URL, json.dumps(body).encode(), {"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return base64.b64decode(json.load(response)["audio"])


def main() -> None:
    out = HERE / "clips"
    out.mkdir(exist_ok=True)
    for name, text in json.loads((HERE / "clips.json").read_text()).items():
        for voice in VOICES:
            target = out / f"{name}_{voice}.wav"
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", "pipe:", "-ar", "16000", "-ac", "1", target],
                input=synthesize(text, voice),
                check=True,
            )
            print(target.name)


if __name__ == "__main__":
    main()
