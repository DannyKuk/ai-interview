import pytest
from fastapi.testclient import TestClient

from backend.api import rate_limit
from backend.api.voice import TRANSCRIBE_FAILED
from backend.main import app
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
