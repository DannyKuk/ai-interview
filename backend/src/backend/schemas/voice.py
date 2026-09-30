from pydantic import BaseModel


class TranscriptResponse(BaseModel):
    text: str  # "" = nothing said (silence or too short)
