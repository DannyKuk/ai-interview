from functools import cache

import numpy as np
import onnx_asr
import onnxruntime as ort
from onnx_asr.adapters import TextResultsAsrAdapter

from backend.config import settings
from backend.services.transcript_fixes import fix_transcript

# the browser sends raw PCM: 16 kHz, mono, 16-bit little-endian. No file, no header
SAMPLE_RATE = 16_000
BYTES_PER_SAMPLE = 2
MAX_AUDIO_SECONDS = 180  # ~450 spoken words, well under the chat's 4000 characters
MAX_AUDIO_BYTES = MAX_AUDIO_SECONDS * SAMPLE_RATE * BYTES_PER_SAMPLE
# shorter clips break the model (1 sample: IndexError, 10 ms: "<unk><unk>…")
MIN_AUDIO_SAMPLES = SAMPLE_RATE // 4

# on silence Parakeet makes words up ("Yeah.", "Mm-hmm."), so a clip where no 30 ms
# frame gets louder than this counts as "nothing said". A real voice peaks ~-12 dBFS
SILENCE_DBFS = -40.0
FRAME_SAMPLES = SAMPLE_RATE * 30 // 1000


class SttError(ValueError):
    """The audio can't be used. The message is safe to show to the candidate."""


@cache
def load_model() -> TextResultsAsrAdapter:
    # loaded once (~1 s from the cache, the first start downloads 631 MB), then kept:
    # it holds ~1.7-1.9 GB of RAM
    options = ort.SessionOptions()
    options.intra_op_num_threads = settings.stt_threads
    return onnx_asr.load_model(
        settings.stt_model,
        quantization="int8",
        # on a Mac onnxruntime would pick CoreML, which Docker doesn't have
        providers=["CPUExecutionProvider"],
        sess_options=options,
    )


def is_silent(audio: np.ndarray) -> bool:
    frames = audio[: len(audio) // FRAME_SAMPLES * FRAME_SAMPLES]
    frame_rms = np.sqrt(np.mean(frames.reshape(-1, FRAME_SAMPLES) ** 2, axis=1))
    return bool(frame_rms.max() < 10 ** (SILENCE_DBFS / 20))


def transcribe(pcm: bytes) -> str:
    # the voice stays in memory: never written to disk, never logged. "" = nothing said
    if len(pcm) > MAX_AUDIO_BYTES:
        raise SttError(
            f"That answer is too long to transcribe. Please keep it under "
            f"{MAX_AUDIO_SECONDS // 60} minutes."
        )
    if len(pcm) % BYTES_PER_SAMPLE:
        raise SttError("We couldn't read that recording. Please try again.")

    audio = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
    if len(audio) < MIN_AUDIO_SAMPLES or is_silent(audio):
        return ""

    # CPU-bound (~0.3 s for 15 s): call it from a worker thread, not the event loop
    text = load_model().recognize(audio, sample_rate=SAMPLE_RATE)
    return fix_transcript(text.strip())
