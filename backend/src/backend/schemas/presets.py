from pydantic import BaseModel, ConfigDict, Field

from backend.schemas.chat import InterviewSettings
from backend.schemas.cv import CandidateProfile
from backend.schemas.plan import MAX_JD_CHARS


class Preset(BaseModel):
    # a ready-made candidate: picking one fills the whole setup page
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9-]+$")  # e.g. "anna-guugle"
    settings: InterviewSettings
    job_description: str = Field(min_length=1, max_length=MAX_JD_CHARS)
    # precomputed once by scripts/make_presets.py (guard + extract_profile), not per request
    profile: CandidateProfile
    cv_file: str
