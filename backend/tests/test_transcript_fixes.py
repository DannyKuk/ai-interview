import pytest

from backend.services.transcript_fixes import fix_transcript


@pytest.mark.parametrize(
    ("heard", "fixed"),
    [
        ("We moved from View 2 to View 3.", "We moved from Vue 2 to Vue 3."),
        ("I replaced it with Penia stores", "I replaced it with Pinia stores"),
        ("with peniastores.", "with Pinia stores."),
        ("We run Postgresl on q burnings", "We run PostgreSQL on Kubernetes"),
    ],
)
def test_misheard_tech_words_are_fixed(heard, fixed):
    assert fix_transcript(heard) == fixed


@pytest.mark.parametrize(
    "said",
    ["In my view, a view of the dashboard helps", "We had view 20 pages", "Postgres"],
)
def test_correct_words_stay(said):
    assert fix_transcript(said) == said
