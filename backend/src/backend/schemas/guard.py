from typing import Literal

from pydantic import BaseModel, Field

GuardCategory = Literal["ok", "off_topic", "injection", "abuse"]

# off_topic is not blocking - the interviewer must steer back to the interview itself
BLOCKED_CATEGORIES: tuple[GuardCategory, ...] = ("injection", "abuse")

# guard_error in case jev does not answer us
# leak -> canary leak - stop response
BlockReason = Literal["message", "role", "guard_error", "leak"]

DocumentKind = Literal["cv", "job_description"]

DocumentBlockReason = Literal["injection", "wrong_kind", "guard_error"]


class DocumentVerdict(BaseModel):
    injection: float | None = None  # P(the text tries to instruct or manipulate an AI)
    is_document: float | None = None  # P(it's the kind of document we asked for)
    blocked: DocumentBlockReason | None = None  # None = allowed
    cost: float | None = None  # USD for this Jev call


class GuardVerdict(BaseModel):
    category: GuardCategory | None = None  # None on the first turn
    probabilities: dict[GuardCategory, float] = Field(default_factory=dict)
    role_injection: float | None = None  # P(the role field is more than a job title)
    blocked: BlockReason | None = None  # None = allowed
    cost: float | None = None  # USD for this Jev call

    # turn signals from the same Jev call (not used for blocking, see prompts/turn_hints.py)
    answered: float | None = None  # P(the message responds to the last question)
    vague: float | None = None  # P(the answer is too thin, worth one follow-up)
    wants_to_end: float | None = None  # P(the candidate wants to stop the interview)
    wrong_claim: float | None = None  # P(a technical claim is certainly false)
    unverified_claim: float | None = None  # P(a technical claim Jev can't confirm)
    contradiction: float | None = None  # P(it contradicts an earlier answer)
