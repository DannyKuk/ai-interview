from typing import Literal

from backend.config import settings
from backend.schemas.guard import GuardVerdict

HintName = Literal["end", "off_topic", "not_answered"]

HINTS: dict[HintName, str] = {
    "end": (
        "The candidate wants to end the interview. Thank them, wish them well and "
        "say goodbye in one or two sentences. Don't try to change their mind and "
        "don't ask another question."
    ),
    "off_topic": (
        "The candidate's last message is off-topic. Reply to it in a few words at "
        "most, then steer back to your last question."
    ),
    "not_answered": (
        "The candidate's reply did not address your last question. If they asked "
        "something, answer briefly, then bring them back to your question in "
        "different words."
    ),
}


def pick_hint(verdict: GuardVerdict) -> HintName | None:
    if (verdict.wants_to_end or 0.0) >= settings.end_threshold:
        return "end"
    if verdict.probabilities.get("off_topic", 0.0) >= settings.off_topic_threshold:
        return "off_topic"
    answered = verdict.answered
    if answered is not None and answered < settings.not_answered_threshold:
        return "not_answered"
    return None
