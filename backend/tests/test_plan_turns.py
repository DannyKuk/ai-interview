import pytest

from backend.prompts.plan_turns import (
    CHALLENGE,
    CONTRADICTION,
    DONE,
    FOLLOW_UP,
    plan_turn,
)
from backend.prompts.turn_hints import HINTS
from backend.schemas.guard import GuardVerdict
from backend.schemas.plan import MAX_EXTRA_TURNS, InterviewPlan, PlanProgress
from tests.test_plan import PLAN, QUESTION

# 3 questions with their own text, so we can see which one is asked
THREE = InterviewPlan(
    approach=PLAN.approach,
    questions=[
        QUESTION.model_copy(update={"question": f"Question {n}?"}) for n in (1, 2, 3)
    ],
)
CLEAR = GuardVerdict(answered=0.98, vague=0.05)
VAGUE = GuardVerdict(answered=0.9, vague=0.95)


def at(question: int, extra_turns: int = 0) -> PlanProgress:
    return PlanProgress(question=question, extra_turns=extra_turns)


def test_the_first_turn_asks_question_1():
    turn = plan_turn(THREE, None, GuardVerdict(), None)
    assert turn.progress == at(0)
    assert "Greet" in turn.note and "question 1 of 3" in turn.note
    assert "Question 1?" in turn.note
    assert turn.ended is None


def test_a_clear_answer_moves_to_the_next_question():
    turn = plan_turn(THREE, at(0), CLEAR, None)
    assert turn.progress == at(1)
    assert "question 2 of 3" in turn.note and "Question 2?" in turn.note


def test_a_vague_answer_gets_one_follow_up():
    turn = plan_turn(THREE, at(0), VAGUE, None)
    assert (turn.progress, turn.note) == (at(0, 1), FOLLOW_UP)


def test_the_follow_up_answer_moves_on_even_if_still_vague():
    assert plan_turn(THREE, at(0, 1), VAGUE, None).progress == at(1)


@pytest.mark.parametrize("hint", ["off_topic", "not_answered"])
def test_off_topic_or_dodged_stays_on_the_question(hint):
    turn = plan_turn(THREE, at(1), GuardVerdict(answered=0.1), hint)
    assert (turn.progress, turn.note, turn.hint) == (at(1, 1), HINTS[hint], hint)


def test_after_the_extra_turns_it_moves_on_without_the_hint():
    turn = plan_turn(THREE, at(1, MAX_EXTRA_TURNS), GuardVerdict(), "not_answered")
    assert turn.progress == at(2)
    assert "Question 3?" in turn.note
    assert turn.hint is None


def test_no_follow_up_after_steering_back():
    # already spent a turn on this question, so a vague answer moves on
    assert plan_turn(THREE, at(0, 1), VAGUE, None).progress == at(1)


def test_the_last_answer_ends_the_interview():
    turn = plan_turn(THREE, at(2), CLEAR, None)
    assert (turn.note, turn.ended) == (DONE, "completed")
    assert turn.progress == at(2)


def test_a_vague_last_answer_gets_its_follow_up_first():
    assert plan_turn(THREE, at(2), VAGUE, None).ended is None


def test_wanting_to_end_ends_anywhere():
    turn = plan_turn(THREE, at(1), CLEAR, "end")
    assert (turn.note, turn.ended, turn.progress) == (
        HINTS["end"],
        "candidate_left",
        at(1),
    )


def test_a_wrong_claim_gets_challenged():
    verdict = CLEAR.model_copy(update={"wrong_claim": 0.95})
    turn = plan_turn(THREE, at(0), verdict, None)
    assert (turn.progress, turn.note) == (at(0, 1), CHALLENGE)


def test_a_wrong_claim_at_0_82_is_challenged():
    # a real interview (Oct 2): the SQLite claim got 0.82 and slipped past 0.9
    verdict = CLEAR.model_copy(update={"wrong_claim": 0.82})
    assert plan_turn(THREE, at(0), verdict, None).note == CHALLENGE


def test_a_claim_jev_only_doubts_is_not_challenged():
    # correct but recent / niche claims reached 0.72 in the spike
    verdict = CLEAR.model_copy(update={"wrong_claim": 0.72, "unverified_claim": 0.87})
    assert plan_turn(THREE, at(0), verdict, None).progress == at(1)


def test_a_contradiction_gets_challenged():
    verdict = CLEAR.model_copy(update={"contradiction": 0.64})
    turn = plan_turn(THREE, at(0), verdict, None)
    assert (turn.progress, turn.note) == (at(0, 1), CONTRADICTION)


def test_a_contradiction_beats_a_wrong_claim_and_a_vague_answer():
    verdict = VAGUE.model_copy(update={"contradiction": 0.9, "wrong_claim": 0.95})
    assert plan_turn(THREE, at(0), verdict, None).note == CONTRADICTION


def test_a_wrong_claim_beats_a_vague_answer():
    verdict = VAGUE.model_copy(update={"wrong_claim": 0.95})
    assert plan_turn(THREE, at(0), verdict, None).note == CHALLENGE


def test_no_second_challenge_on_the_same_question():
    # the reply to a contradiction challenge still contradicts the old answer
    verdict = CLEAR.model_copy(update={"contradiction": 0.9})
    assert plan_turn(THREE, at(0, 1), verdict, None).progress == at(1)


def test_steering_back_beats_a_challenge():
    verdict = GuardVerdict(answered=0.1, wrong_claim=0.95)
    turn = plan_turn(THREE, at(0), verdict, "not_answered")
    assert turn.note == HINTS["not_answered"]


def test_no_vague_signal_counts_as_clear():
    assert plan_turn(THREE, at(0), GuardVerdict(), None).progress == at(1)


def test_a_whole_interview_ends_after_the_last_question():
    progress, turns = None, 0
    answers = [None, CLEAR, VAGUE, VAGUE, CLEAR]  # greet, q1, q2 + follow-up, q3
    for verdict in answers:
        turn = plan_turn(THREE, progress, verdict or GuardVerdict(), None)
        progress, turns = turn.progress, turns + 1
    assert (turn.ended, turns) == ("completed", 5)
