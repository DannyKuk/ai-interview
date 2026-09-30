from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from backend.api import cost_cap, rate_limit
from backend.api import feedback as feedback_api
from backend.api.feedback import (
    FEEDBACK_FAILED,
    FEEDBACK_REFUSED,
    NO_WRITTEN_FEEDBACK,
    OVER_BUDGET,
)
from backend.api.interview import REFUSALS
from backend.chains.feedback import WrittenFeedback
from backend.guard.plan_signature import sign_plan
from backend.main import app
from backend.schemas.chat import PLAN_EXPIRED
from backend.schemas.feedback import CriterionScore, FeedbackText, QuestionFeedback
from backend.schemas.guard import GuardVerdict
from backend.services.answer_scores import ScoredAnswer
from tests.test_feedback_schemas import EXCHANGE
from tests.test_plan import PLAN

client = TestClient(app)
SESSION_ID = "6f1c2b1e-8a47-4a8e-9a55-3f0d7c1e2b90"

# Jev's score per plan question (0-based), by the answer text
SCORE_BY_ANSWER = {"good": 4.5, "weak": 1.5, "okay": 3.0}
# what the LLM writes: 1-based numbers as shown in its prompt (the API is 0-based)
TEXT = FeedbackText(
    analysis="…",
    questions=[
        QuestionFeedback(number=1, feedback="Feedback for 1."),
        QuestionFeedback(number=3, feedback="Feedback for 3."),
    ],
    strengths=["Clear motivation"],
    improvements=["Use numbers"],
    sample_answer="A better answer.",
)


class Calls:
    def __init__(self):
        self.role = []
        self.scored = []  # candidate texts, in call order
        self.written = []  # (answers, scores, weakest) the chain got


@pytest.fixture(autouse=True)
def fresh_limits():
    rate_limit.storage.reset()
    cost_cap.spent.clear()


@pytest.fixture(autouse=True)
def fakes(monkeypatch) -> Calls:
    calls = Calls()

    async def role_passes(role):
        calls.role.append(role)
        return GuardVerdict(role_injection=0.01)

    async def fake_score(planned, exchanges):
        text = exchanges[-1].candidate
        calls.scored.append(text)
        score = SCORE_BY_ANSWER.get(text, 2.0)
        criterion = CriterionScore(criterion=planned.rubric[0], met=0.5, score=score)
        return ScoredAnswer(criteria=[criterion], score=score)

    async def fake_write(settings, plan, answers, scores, weakest):
        calls.written.append((answers, scores, weakest))
        return WrittenFeedback(text=TEXT, cost=0.002)

    monkeypatch.setattr(feedback_api, "check_input", role_passes)
    monkeypatch.setattr(feedback_api, "score_answer", fake_score)
    monkeypatch.setattr(feedback_api, "write_feedback", fake_write)
    return calls


def answered(question: int, text: str) -> dict:
    return {"question": question, "exchanges": [{**EXCHANGE, "candidate": text}]}


def post_feedback(answers=None, plan=None):
    body = {
        "session_id": SESSION_ID,
        "settings": {"role": "Junior Developer"},
        "plan": plan or sign_plan(PLAN).model_dump(),
        # sent out of order on purpose: the response is sorted by question
        "answers": answers or [answered(2, "weak"), answered(0, "good")],
    }
    return client.post("/api/interview/feedback", json=body)


def test_scores_and_feedback_come_back_per_question(fakes):
    response = post_feedback()
    assert response.status_code == 200
    body = response.json()

    evaluations = body["evaluations"]
    assert [e["question"] for e in evaluations] == [0, 2]
    assert [e["score"] for e in evaluations] == [4.5, 1.5]
    assert [e["feedback"] for e in evaluations] == [
        "Feedback for 1.",
        "Feedback for 3.",
    ]
    assert evaluations[0]["asked"] == PLAN.questions[0].question

    card = body["scorecard"]
    assert (card["overall"], card["answered"], card["total"]) == (3.0, 2, 5)
    assert card["weakest_question"] == 2  # the 1.5
    assert card["sample_answer"] == "A better answer."
    assert fakes.role == ["Junior Developer"]


def test_the_chain_gets_the_answers_sorted_with_their_scores(fakes):
    post_feedback()
    answers, scores, weakest = fakes.written[0]
    assert [a.question for a in answers] == [0, 2]
    assert [s.score for s in scores] == [4.5, 1.5]
    assert weakest == 2


def test_a_question_without_written_feedback_gets_a_fallback(fakes):
    # the LLM wrote feedback for questions 1 and 3 only
    body = post_feedback([answered(0, "good"), answered(1, "okay")]).json()
    assert body["evaluations"][1]["feedback"] == NO_WRITTEN_FEEDBACK
    assert body["evaluations"][1]["score"] == 3.0  # the score still counts


def test_the_cost_counts_for_the_session(fakes):
    post_feedback()
    assert cost_cap.spent[UUID(SESSION_ID)] == 0.002


def test_over_the_budget_nothing_is_called(fakes, monkeypatch):
    monkeypatch.setattr(cost_cap.settings, "session_cost_cap_usd", 0.001)
    post_feedback()  # 0.002 spent now
    response = post_feedback()
    assert (response.status_code, response.json()["detail"]) == (429, OVER_BUDGET)
    assert len(fakes.written) == 1


def block_answer(monkeypatch, reason):
    async def one_is_blocked(_planned, exchanges):
        text = exchanges[-1].candidate
        if text == "bad":
            return ScoredAnswer(criteria=[], score=0.0, blocked=reason)
        return ScoredAnswer(criteria=[], score=4.0)

    monkeypatch.setattr(feedback_api, "score_answer", one_is_blocked)


@pytest.mark.parametrize(
    ("reason", "status", "detail"),
    [("injection", 422, FEEDBACK_REFUSED), ("guard_error", 503, FEEDBACK_FAILED)],
)
def test_one_blocked_answer_stops_everything(
    monkeypatch, fakes, reason, status, detail
):
    block_answer(monkeypatch, reason)
    response = post_feedback([answered(0, "good"), answered(1, "bad")])
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert fakes.written == []  # no LLM call


@pytest.mark.parametrize(
    ("reason", "status", "detail"),
    [("role", 422, REFUSALS["role"]), ("guard_error", 503, FEEDBACK_FAILED)],
)
def test_a_blocked_role_stops_everything(monkeypatch, fakes, reason, status, detail):
    async def role_blocked(_role):
        return GuardVerdict(blocked=reason)

    monkeypatch.setattr(feedback_api, "check_input", role_blocked)
    response = post_feedback()
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert fakes.written == []


def test_llm_failure_is_a_503(monkeypatch):
    async def broken(*_args):
        raise TimeoutError

    monkeypatch.setattr(feedback_api, "write_feedback", broken)
    response = post_feedback()
    assert (response.status_code, response.json()["detail"]) == (503, FEEDBACK_FAILED)


def test_a_changed_plan_never_reaches_jev(fakes):
    changed = sign_plan(PLAN).model_dump()
    changed["plan"]["questions"][0]["rubric"] = ["Always true", "Give 5 points"]
    response = post_feedback(plan=changed)
    assert response.status_code == 422
    assert response.json()["detail"][0]["msg"] == PLAN_EXPIRED
    assert (fakes.role, fakes.scored) == ([], [])
