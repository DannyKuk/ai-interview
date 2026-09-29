from fastapi import APIRouter

from backend.schemas.presets import Preset
from backend.services.presets import load_presets

router = APIRouter(prefix="/api", tags=["config"])


@router.get("/presets")
def get_presets() -> list[Preset]:
    return load_presets()
