import pytest
from fastapi.testclient import TestClient

from backend.api import cv, rate_limit
from backend.api.cv import CV_REFUSALS, PROFILE_FAILED
from backend.main import app
from backend.schemas.guard import DocumentVerdict
from tests.test_cv_profile import PROFILE
from tests.test_cv_reader import make_pdf

client = TestClient(app)


def upload(data: bytes, filename: str = "cv.pdf"):
    return client.post(
        "/api/cv/parse", files={"file": (filename, data, "application/pdf")}
    )


class Calls:
    profile = 0


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    rate_limit.storage.reset()


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    calls = Calls()

    async def guard_passes(_kind, _text):
        return DocumentVerdict(injection=0.01, is_document=0.99)

    async def fake_profile(_text):
        calls.profile += 1
        return PROFILE

    monkeypatch.setattr(cv, "check_document", guard_passes)
    monkeypatch.setattr(cv, "extract_profile", fake_profile)
    return calls


def block_with(monkeypatch, reason):
    async def guard_blocks(_kind, _text):
        return DocumentVerdict(blocked=reason)

    monkeypatch.setattr(cv, "check_document", guard_blocks)


def test_returns_the_profile():
    response = upload(make_pdf("Anna Berg, backend engineer"))
    assert response.status_code == 200
    assert response.json() == PROFILE.model_dump()


def test_the_file_is_checked_by_content_not_name():
    response = upload(b"just some text", filename="cv.pdf")
    assert response.status_code == 422
    assert "doesn't look like a PDF" in response.json()["detail"]


def test_a_scan_gets_the_reader_message():
    response = upload(make_pdf(""))
    assert response.status_code == 422
    assert "Is it a scan?" in response.json()["detail"]


@pytest.mark.parametrize("reason", ["injection", "wrong_kind", "guard_error"])
def test_a_blocked_cv_never_reaches_the_llm(monkeypatch, fakes, reason):
    block_with(monkeypatch, reason)
    response = upload(make_pdf("Anna Berg"))

    status_code, detail = CV_REFUSALS[reason]
    assert (response.status_code, response.json()["detail"]) == (status_code, detail)
    assert fakes.profile == 0


def test_llm_failure_is_a_503(monkeypatch):
    async def broken_profile(_text):
        raise TimeoutError

    monkeypatch.setattr(cv, "extract_profile", broken_profile)
    response = upload(make_pdf("Anna Berg"))
    assert (response.status_code, response.json()["detail"]) == (503, PROFILE_FAILED)


def test_cv_uploads_have_their_own_rate_limit(monkeypatch):
    monkeypatch.setattr(rate_limit.settings, "cv_rate_limit", "2/minute")
    pdf = make_pdf("Anna Berg")
    assert [upload(pdf).status_code for _ in range(3)] == [200, 200, 429]
    # the chat budget is separate: still free
    assert rate_limit.limiter.test(rate_limit.parse("1/minute"), "chat", "testclient")
