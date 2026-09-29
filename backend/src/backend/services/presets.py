from functools import cache
from pathlib import Path

from pydantic import TypeAdapter

from backend.schemas.presets import Preset

# written by scripts/make_presets.py, shipped inside the package
PRESETS_FILE = Path(__file__).parents[1] / "data" / "presets.json"


@cache
def load_presets() -> list[Preset]:
    # read + validated once: a broken file fails on the first request (and in the tests)
    return TypeAdapter(list[Preset]).validate_json(PRESETS_FILE.read_bytes())
