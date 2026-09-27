from typing import Literal

from pydantic import BaseModel, Field

GuardCategory = Literal["ok", "off_topic", "injection", "abuse"]

# off_topic is not blocking - the interviewer must steer back to the interview itself
BLOCKED_CATEGORIES: tuple[GuardCategory, ...] = ("injection", "abuse")

# guard_error in case jev does not answer us
# leak -> canary leak - stop response
BlockReason = Literal["message", "role", "guard_error", "leak"]


class GuardVerdict(BaseModel):
    category: GuardCategory | None = None  # None on the first turn
    probabilities: dict[GuardCategory, float] = Field(default_factory=dict)
    role_injection: float | None = None  # P(the role field is more than a job title)
    blocked: BlockReason | None = None  # None = allowed
