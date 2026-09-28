from uuid import UUID

from backend.config import settings

# USD spent per interview session. In memory like the rate limit: resets on restart
spent: dict[UUID, float] = {}

OUT_OF_TIME = (
    "We're out of time for today. Thank you for your answers, "
    "that's where we'll wrap up."
)


def over_cap(session_id: UUID) -> bool:
    # checked before a turn, so the last turn can go a little over the cap
    return spent.get(session_id, 0.0) >= settings.session_cost_cap_usd


def add_cost(session_id: UUID, cost: float | None) -> None:
    # cost is OpenRouter's billed amount (response_metadata["cost"]), None if missing
    if cost:
        spent[session_id] = spent.get(session_id, 0.0) + cost
