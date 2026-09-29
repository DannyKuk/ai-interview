import pytest
from fastapi.testclient import TestClient

from backend.api import plan as plan_api
from backend.api import rate_limit
from backend.api.plan import PLAN_FAILED, PLAN_REFUSALS, PROFILE_TOO_LONG
from backend.guard.plan_signature import is_signed
from backend.main import app
from backend.schemas.guard import DocumentVerdict, GuardVerdict
from backend.schemas.plan import MAX_JD_CHARS, SignedPlan
from tests.test_plan import PLAN, PROFILE

client = TestClient(app)

JD = "We are looking for a junior Python developer to join our team."


class Calls:
    def __init__(self):
        self.guard = []  # "role", "cv", "job_description" in call order
        self.plan = []  # the arguments make_plan got


@pytest.fixture(autouse=True)
def fresh_rate_limit():
    rate_limit.storage.reset()


@pytest.fixture(autouse=True)
def fakes(monkeypatch):
    calls = Calls()

    async def role_passes(_role):
        calls.guard.append("role")
        return GuardVerdict(role_injection=0.01)

    async def document_passes(kind, _text):
        calls.guard.append(kind)
        return DocumentVerdict(injection=0.01, is_document=0.99)

    async def fake_plan(settings, profile, job_description):
        calls.plan.append((settings, profile, job_description))
        return PLAN

    monkeypatch.setattr(plan_api, "check_input", role_passes)
    monkeypatch.setattr(plan_api, "check_document", document_passes)
    monkeypatch.setattr(plan_api, "make_plan", fake_plan)
    return calls


def post_plan(**body):
    return client.post("/api/interview/plan", json=body)


def full_body():
    return {"profile": PROFILE.model_dump(), "job_description": JD}


def test_returns_the_plan_and_checks_everything(fakes):
    response = post_plan(**full_body())
    assert response.status_code == 200
    signed = SignedPlan.model_validate(response.json())
    assert signed.plan == PLAN
    assert is_signed(signed)
    assert sorted(fakes.guard) == ["cv", "job_description", "role"]
    _, profile, job_description = fakes.plan[0]
    assert (profile, job_description) == (PROFILE, JD)


@pytest.mark.parametrize("job_description", [None, "", "   "])
def test_works_without_cv_and_job_description(fakes, job_description):
    response = post_plan(job_description=job_description)
    assert response.status_code == 200
    assert fakes.guard == ["role"]  # nothing else to check
    assert fakes.plan[0][1:] == (None, None)


def block_role(monkeypatch, reason):
    async def guard_blocks(_role):
        return GuardVerdict(blocked=reason)

    monkeypatch.setattr(plan_api, "check_input", guard_blocks)


def block_document(monkeypatch, blocked_kind, reason):
    async def guard_blocks(kind, _text):
        if kind == blocked_kind:
            return DocumentVerdict(blocked=reason)
        return DocumentVerdict(injection=0.01, is_document=0.99)

    monkeypatch.setattr(plan_api, "check_document", guard_blocks)


@pytest.mark.parametrize(
    ("source", "kind", "reason"),
    [
        ("job_description", "job_description", "injection"),
        ("job_description", "job_description", "wrong_kind"),
        ("profile", "cv", "injection"),
    ],
)
def test_a_blocked_document_never_reaches_the_llm(
    monkeypatch, fakes, source, kind, reason
):
    block_document(monkeypatch, kind, reason)
    response = post_plan(**full_body())
    assert response.status_code == 422
    assert response.json()["detail"] == PLAN_REFUSALS[source][reason]
    assert fakes.plan == []


def test_a_blocked_role_never_reaches_the_llm(monkeypatch, fakes):
    block_role(monkeypatch, "role")
    response = post_plan(**full_body())
    assert (response.status_code, response.json()["detail"]) == (
        422,
        PLAN_REFUSALS["role"]["role"],
    )
    assert fakes.plan == []


@pytest.mark.parametrize("kind", ["job_description", "cv"])
def test_a_guard_error_fails_closed(monkeypatch, fakes, kind):
    block_document(monkeypatch, kind, "guard_error")
    response = post_plan(**full_body())
    assert (response.status_code, response.json()["detail"]) == (503, PLAN_FAILED)
    assert fakes.plan == []


def test_a_profile_that_is_not_a_cv_is_fine(monkeypatch, fakes):
    # our own summary: only injection blocks it (see PLAN_REFUSALS)
    block_document(monkeypatch, "cv", "wrong_kind")
    assert post_plan(**full_body()).status_code == 200


def test_the_job_description_has_a_length_limit(fakes):
    response = post_plan(job_description="x" * (MAX_JD_CHARS + 1))
    assert response.status_code == 422
    assert fakes.guard == []


def test_a_too_long_profile_is_rejected_before_the_guard(fakes):
    profile = PROFILE.model_copy(update={"headline": "x" * 10_000}).model_dump()
    response = post_plan(profile=profile)
    assert (response.status_code, response.json()["detail"]) == (422, PROFILE_TOO_LONG)
    assert fakes.guard == []


def test_llm_failure_is_a_503(monkeypatch):
    async def broken_plan(*_args):
        raise TimeoutError

    monkeypatch.setattr(plan_api, "make_plan", broken_plan)
    response = post_plan(**full_body())
    assert (response.status_code, response.json()["detail"]) == (503, PLAN_FAILED)
