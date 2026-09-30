from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.api import cost_cap, rate_limit, voice
from backend.api.voice import SPEAK_FAILED, SPEAK_OVER_BUDGET, TRANSCRIBE_FAILED
from backend.chains.llm import Priced
from backend.config import settings
from backend.main import app
from backend.schemas.voice import MAX_SPEAK_CHARS
from backend.services import stt
from backend.services.stt import MAX_AUDIO_BYTES
from tests.test_stt import FakeModel, pcm, tone

client = TestClient(app)


def send(audio: bytes):
    return client.post(
        "/api/voice/transcribe",
        content=audio,
        headers={"Content-Type": "application/octet-stream"},
    )


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    rate_limit.storage.reset()


@pytest.fixture
def model(monkeypatch) -> FakeModel:
    fake = FakeModel()
    monkeypatch.setattr(stt, "load_model", lambda: fake)
    return fake


def test_returns_the_fixed_transcript(model):
    response = send(pcm(tone(2, -20)))
    assert response.status_code == 200
    assert response.json() == {"text": "I moved us to PostgreSQL"}


def test_silence_is_an_empty_transcript_not_an_error(model):
    assert send(pcm(tone(2, -100))).json() == {"text": ""}
    assert model.calls == []


def test_too_long_answer_gets_a_message_for_the_candidate(model):
    response = send(bytes(MAX_AUDIO_BYTES + 32_000))
    assert response.status_code == 422
    assert "too long" in response.json()["detail"]
    assert model.calls == []


def test_model_failure_is_a_503_and_logs_no_audio(monkeypatch, caplog):
    class BrokenModel:
        def recognize(self, audio, sample_rate):
            raise RuntimeError("onnxruntime exploded")

    monkeypatch.setattr(stt, "load_model", lambda: BrokenModel())
    response = send(pcm(tone(2, -20)))
    assert response.status_code == 503
    assert response.json() == {"detail": TRANSCRIBE_FAILED}
    assert "RuntimeError" in caplog.text
    assert "exploded" not in caplog.text  # only the error type is logged


class FakeTts:
    def __init__(self, error: Exception | None = None):
        self.error = error
        self.calls: list[tuple[str, str]] = []

    async def __call__(self, text: str, voice: str) -> Priced[bytes]:
        self.calls.append((text, voice))
        if self.error:
            raise self.error
        return Priced(value=b"\x01\x00" * 24_000, cost=0.00015)


@pytest.fixture
def tts(monkeypatch) -> FakeTts:
    fake = FakeTts()
    monkeypatch.setattr(voice, "speak", fake)
    return fake


def speak(text="Tell me about yourself.", voice_name="Kore", session_id=None):
    session_id = session_id or uuid4()
    return client.post(
        "/api/voice/speak",
        json={"text": text, "voice": voice_name, "session_id": str(session_id)},
    )


def test_speak_returns_the_audio_and_counts_its_cost(tts):
    session_id = uuid4()
    response = speak(session_id=session_id)
    assert response.status_code == 200
    assert response.content == b"\x01\x00" * 24_000
    assert response.headers["X-Cost"] == "0.00015"
    assert cost_cap.spent[session_id] == pytest.approx(0.00015)
    assert tts.calls == [("Tell me about yourself.", "Kore")]


def test_speak_over_the_cost_cap_makes_no_call(tts):
    session_id = uuid4()
    cost_cap.spent[session_id] = settings.session_cost_cap_usd
    response = speak(session_id=session_id)
    assert response.status_code == 429
    assert response.json() == {"detail": SPEAK_OVER_BUDGET}
    assert tts.calls == []


def test_speak_failure_is_a_503_and_logs_no_text(monkeypatch, caplog):
    monkeypatch.setattr(voice, "speak", FakeTts(error=TimeoutError("slow")))
    response = speak(text="My secret project")
    assert response.status_code == 503
    assert response.json() == {"detail": SPEAK_FAILED}
    assert "TimeoutError" in caplog.text
    assert "secret" not in caplog.text


@pytest.mark.parametrize(
    "text, voice_name",
    [
        ("Hello.", "Puck"),  # not one of our voices
        ("x" * (MAX_SPEAK_CHARS + 1), "Kore"),
        ("   ", "Kore"),
    ],
    ids=["unknown_voice", "too_long", "blank"],
)
def test_speak_refuses_bad_requests_before_any_call(tts, text, voice_name):
    assert speak(text=text, voice_name=voice_name).status_code == 422
    assert tts.calls == []
