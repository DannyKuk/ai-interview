import pytest

from backend.prompts.turn_hints import pick_hint
from backend.schemas.guard import GuardVerdict


@pytest.mark.parametrize(
    ("verdict", "hint"),
    [
        # first turn: no signals at all
        (GuardVerdict(), None),
        (GuardVerdict(answered=0.97, wants_to_end=0.01), None),
        (GuardVerdict(answered=0.11, wants_to_end=0.97), "end"),
        # just under the end threshold: no hint, the interviewer decides itself
        (GuardVerdict(answered=0.9, wants_to_end=0.6), None),
        (GuardVerdict(probabilities={"off_topic": 1.0}, answered=0.02), "off_topic"),
        (GuardVerdict(answered=0.04, wants_to_end=0.02), "not_answered"),
        # unsure whether it was answered: no hint
        (GuardVerdict(answered=0.5), None),
        # ending beats everything else
        (
            GuardVerdict(
                probabilities={"off_topic": 1.0}, answered=0.0, wants_to_end=0.9
            ),
            "end",
        ),
    ],
)
def test_pick_hint(verdict, hint):
    assert pick_hint(verdict) == hint
