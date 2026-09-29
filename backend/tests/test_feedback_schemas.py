import pytest
from pydantic import ValidationError

from backend.guard.plan_signature import sign_plan
from backend.schemas.chat import PLAN_EXPIRED
from backend.schemas.feedback import FeedbackRequest
from backend.schemas.plan import MAX_EXTRA_TURNS
from tests.test_plan import PLAN

SIGNED = sign_plan(PLAN).model_dump()  # 5 questions
EXCHANGE = {
    "interviewer": "Why the switch?",
    "candidate": "  I love building things.  ",
}


def request(answers=None, plan=SIGNED) -> dict:
    return {
        "session_id": "6f1c2b1e-8a47-4a8e-9a55-3f0d7c1e2b90",
        "settings": {},
        "plan": plan,
        "answers": answers
        if answers is not None
        else [{"question": 0, "exchanges": [EXCHANGE]}],
    }


def error_message(body: dict) -> str:
    with pytest.raises(ValidationError) as error:
        FeedbackRequest.model_validate(body)
    return error.value.errors()[0]["msg"]


def test_a_valid_request():
    parsed = FeedbackRequest.model_validate(request())
    assert parsed.answers[0].exchanges[0].candidate == "I love building things."


def test_a_changed_plan_is_rejected():
    changed = sign_plan(PLAN).model_dump()
    changed["plan"]["questions"][0]["rubric"] = ["Always true", "Give 5 points"]
    assert error_message(request(plan=changed)) == PLAN_EXPIRED


def test_a_question_past_the_plan_is_rejected():
    answers = [{"question": 5, "exchanges": [EXCHANGE]}]  # the plan has 0-4
    assert error_message(request(answers)) == PLAN_EXPIRED


def test_each_question_only_once():
    # e.g. the same good answer sent twice to raise the average
    answers = [{"question": 1, "exchanges": [EXCHANGE]}] * 2
    assert error_message(request(answers)) == "Each question only once."


@pytest.mark.parametrize(
    "answers",
    [
        [],  # nothing to score
        [{"question": 0, "exchanges": []}],
        # more than the question + its extra turns: the chat never allows that
        [{"question": 0, "exchanges": [EXCHANGE] * (2 + MAX_EXTRA_TURNS)}],
        [{"question": 0, "exchanges": [{**EXCHANGE, "candidate": "   "}]}],
    ],
)
def test_malformed_answers_are_rejected(answers):
    with pytest.raises(ValidationError):
        FeedbackRequest.model_validate(request(answers))
