from typing import Literal

from pydantic import BaseModel, Field

GuardCategory = Literal["ok", "off_topic", "injection", "abuse"]

# off_topic is not blocking - the interviewer must steer back to the interview itself
BLOCKED_CATEGORIES: tuple[GuardCategory, ...] = ("injection", "abuse")

# guard_error in case jev does not answer us
# leak -> canary leak - stop response
BlockReason = Literal["message", "role", "guard_error", "leak"]

CvBlockReason = Literal["injection", "not_a_cv", "guard_error"]


class CvVerdict(BaseModel):
    injection: float | None = None  # P(the text tries to instruct or manipulate an AI)
    is_cv: float | None = None  # P(the text is a CV at all)
    blocked: CvBlockReason | None = None  # None = allowed


class GuardVerdict(BaseModel):
    category: GuardCategory | None = None  # None on the first turn
    probabilities: dict[GuardCategory, float] = Field(default_factory=dict)
    role_injection: float | None = None  # P(the role field is more than a job title)
    blocked: BlockReason | None = None  # None = allowed

    # turn signals from the same Jev call (not used for blocking, see prompts/turn_hints.py)
    answered: float | None = None  # P(the message responds to the last question)
    wants_to_end: float | None = None  # P(the candidate wants to stop the interview)
