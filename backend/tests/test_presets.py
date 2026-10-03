from pathlib import Path
from typing import get_args

from fastapi.testclient import TestClient

from backend.main import app
from backend.schemas.chat import INTERVIEWERS, Company
from backend.services.presets import load_presets

PUBLIC = Path(__file__).parents[2] / "frontend" / "public"


def test_the_presets_file_loads_and_validates():
    # the committed JSON still fits the schemas (Preset, CandidateProfile, settings)
    presets = load_presets()
    assert len({preset.id for preset in presets}) == len(presets) == 8


def test_one_preset_per_company():
    companies = [preset.settings.company for preset in load_presets()]
    assert sorted(companies) == sorted(get_args(Company))


def test_one_interviewer_per_company():
    assert sorted(INTERVIEWERS) == sorted(get_args(Company))
    names = {interviewer.name for interviewer in INTERVIEWERS.values()}
    assert len(names) == len(INTERVIEWERS)


def test_every_preset_cv_is_in_the_frontend():
    for preset in load_presets():
        assert (PUBLIC / preset.cv_file.lstrip("/")).is_file(), preset.cv_file


def test_the_endpoint_returns_the_presets():
    response = TestClient(app).get("/api/presets")
    assert response.status_code == 200
    assert [p["id"] for p in response.json()] == [p.id for p in load_presets()]
