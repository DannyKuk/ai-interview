import logging
import re
from datetime import UTC, datetime

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from backend.chains.llm import Priced, get_chat_model, priced
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.schemas.cv import CandidateProfile

logger = logging.getLogger(__name__)

# control characters (except newline / tab) = a broken escape in the model's JSON
CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f]")


def this_month() -> str:
    # "September 2026": what "present" in a CV means
    return datetime.now(UTC).strftime("%B %Y")


def build_profile_chain() -> Runnable:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", load_prompt("cv_profile/zero_shot_v1")),
            ("human", "{cv}"),
        ]
    )
    # strict: the API forces the reply into CandidateProfile's schema, so it always parses.
    # max_tokens includes the reasoning tokens, the JSON itself is ~500.
    # include_raw: the raw message carries the cost (the dev panel's cost breakdown).
    # Not minimal: it counted the years 1-3 short on 11 of 12 sample CVs (Oct 2)
    llm = get_chat_model(max_tokens=3000, effort="low").with_structured_output(
        CandidateProfile, method="function_calling", strict=True, include_raw=True
    )
    return prompt | llm


async def extract_profile(cv_text: str) -> Priced[CandidateProfile]:
    # the CV is untrusted: escaped and in <cv> tags, declared as data in the prompt.
    # today: the model doesn't know the date, so "2020 – present" came out 1-2 years short
    result = await build_profile_chain().ainvoke(
        {"cv": wrap("cv", cv_text), "today": this_month()}
    )
    profile = priced(result, "cv profile")
    if has_control_chars(profile.value.model_dump()):
        # safety net for the json_schema bug above. Only the fact is logged, no CV data
        logger.warning("cv profile contains control characters")
    return profile


def has_control_chars(value) -> bool:
    # walks the dumped profile: the JSON string would show them as "\u0002" text instead
    if isinstance(value, str):
        return bool(CONTROL_CHARS.search(value))
    if isinstance(value, dict):
        return any(has_control_chars(v) for v in value.values())
    if isinstance(value, list):
        return any(has_control_chars(v) for v in value)
    return False
