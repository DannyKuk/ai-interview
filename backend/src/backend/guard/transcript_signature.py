import hashlib
import hmac
import json
from collections.abc import Sequence
from typing import TYPE_CHECKING
from uuid import UUID

from backend.config import settings

if TYPE_CHECKING:
    from backend.schemas.chat import ChatMessage


def sign_transcript(session_id: UUID | str, messages: Sequence[ChatMessage]) -> str:
    lines = [[message.role, message.content.strip()] for message in messages]
    payload = "transcript:" + json.dumps([str(session_id), lines])
    key = settings.plan_signing_key.get_secret_value().encode()
    return hmac.new(key, payload.encode(), hashlib.sha256).hexdigest()


def is_signed_transcript(
    session_id: UUID, messages: Sequence[ChatMessage], signature: str | None
) -> bool:
    if not messages:
        return True  # the first turn: nothing answered yet
    if signature is None:
        return False
    return hmac.compare_digest(sign_transcript(session_id, messages), signature)
