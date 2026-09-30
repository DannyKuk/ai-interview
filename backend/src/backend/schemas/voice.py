from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# one female, one male: the same pair as HeadTTS (af_heart, am_michael), so the TTS
# switch changes the sound quality, not the interviewer. Both tested in the spike
Voice = Literal["Kore", "Charon"]

MAX_SPEAK_CHARS = 1000  # one or two sentences of a reply (~1 minute of speech)


class TranscriptResponse(BaseModel):
    text: str  # "" = nothing said (silence or too short)


class SpeakRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    text: str = Field(min_length=1, max_length=MAX_SPEAK_CHARS)
    voice: Voice
    session_id: UUID  # the audio's cost counts toward this interview's cost cap
