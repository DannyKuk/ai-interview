import numpy as np
import pytest

from backend.services import stt
from backend.services.stt import MAX_AUDIO_BYTES, SAMPLE_RATE, SttError, transcribe


class FakeModel:
    # stands in for Parakeet: the tests never load (or download) the real model
    def __init__(self, text: str = "I moved us to postgresl"):
        self.text = text
        self.calls: list[np.ndarray] = []

    def recognize(self, audio: np.ndarray, sample_rate: int) -> str:
        assert sample_rate == SAMPLE_RATE
        self.calls.append(audio)
        return self.text


@pytest.fixture
def model(monkeypatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(stt, "load_model", lambda: fake)
    return fake


def tone(seconds: float, dbfs: float) -> np.ndarray:
    # a 220 Hz sine at that loudness (RMS), as float samples in -1..1
    t = np.arange(int(seconds * SAMPLE_RATE)) / SAMPLE_RATE
    return np.sqrt(2) * 10 ** (dbfs / 20) * np.sin(2 * np.pi * 220 * t)


def pcm(*parts: np.ndarray) -> bytes:
    # what the browser sends: 16-bit little-endian samples, no header
    return (np.concatenate(parts) * 32767).astype("<i2").tobytes()


def test_speech_goes_to_the_model_and_through_the_fix_list(model):
    assert transcribe(pcm(tone(2, -20))) == "I moved us to PostgreSQL"
    assert len(model.calls[0]) == 2 * SAMPLE_RATE


@pytest.mark.parametrize(
    "audio",
    [
        pcm(tone(3, -100)),  # silence
        pcm(np.random.default_rng(0).normal(0, 10 ** (-50 / 20), 3 * SAMPLE_RATE)),
        pcm(tone(0.2, -20)),  # loud but shorter than 0.25 s
        b"",
    ],
    ids=["silence", "mic_hiss", "too_short", "empty"],
)
def test_nothing_said_skips_the_model(model, audio):
    # on silence Parakeet makes words up ("Yeah.", "Mm-hmm."): that must not become an answer
    assert transcribe(audio) == ""
    assert model.calls == []


@pytest.mark.parametrize(
    "audio",
    [
        pcm(tone(2, -35)),  # a quiet voice, still above -40 dBFS
        pcm(tone(20, -100), tone(0.1, -20)),  # a long pause, then one short word
    ],
    ids=["quiet_voice", "long_pause_then_a_word"],
)
def test_the_silence_check_lets_quiet_or_short_speech_through(model, audio):
    # the loudest 30 ms counts, not the average over the whole clip
    transcribe(audio)
    assert len(model.calls) == 1


def test_refuses_audio_over_the_maximum(model):
    with pytest.raises(SttError, match="too long"):
        transcribe(bytes(MAX_AUDIO_BYTES + 2))
    assert model.calls == []


def test_refuses_half_a_sample(model):
    # 16-bit samples = an even number of bytes
    with pytest.raises(SttError, match="couldn't read"):
        transcribe(bytes(SAMPLE_RATE + 1))
