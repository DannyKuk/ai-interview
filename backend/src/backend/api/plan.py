import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException

from backend.api.interview import REFUSALS as CHAT_REFUSALS
from backend.api.rate_limit import chat_rate_limit
from backend.chains.plan import make_plan, profile_text
from backend.guard.jev import check_document, check_input
from backend.guard.plan_signature import sign_plan
from backend.schemas.chat import PlanRequest
from backend.schemas.plan import SignedPlan

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/interview", tags=["interview"], dependencies=[Depends(chat_rate_limit)]
)

# the profile's strings have no length limit in the schema (strict mode), so cap the
# whole text. A real one is ~3k chars
MAX_PROFILE_CHARS = 10_000

# 422 = "fix your input"
PLAN_REFUSALS: dict[str, dict[str, str]] = {
    "role": {"role": CHAT_REFUSALS["role"]},
    "job_description": {
        "injection": (
            "Your job description contains text addressed to an AI system, so we "
            "can't use it. Please paste it without that part."
        ),
        "wrong_kind": (
            "This doesn't look like a job description. Please paste the job ad, "
            "or leave the field empty."
        ),
    },
    "profile": {
        "injection": (
            "Your CV profile contains text addressed to an AI system. "
            "Please upload your CV again."
        ),
    },
}
# 503 = "not your fault, try again" (guard error, LLM timeout, …)
PLAN_FAILED = "We couldn't prepare your interview right now. Please try again."
PROFILE_TOO_LONG = "Your CV profile is too long. Please upload your CV again."


async def guard_plan(request: PlanRequest) -> None:
    # everything here ends up in the plan prompt, so all of it is checked, in parallel
    checks = {"role": check_input(request.settings.role)}
    if request.job_description:
        checks["job_description"] = check_document(
            "job_description", request.job_description
        )
    if request.profile:
        checks["profile"] = check_document("cv", profile_text(request.profile))

    verdicts = await asyncio.gather(*checks.values())
    for source, verdict in zip(checks, verdicts):
        if verdict.blocked == "guard_error":
            raise HTTPException(status_code=503, detail=PLAN_FAILED)
        if verdict.blocked in PLAN_REFUSALS[source]:
            raise HTTPException(
                status_code=422, detail=PLAN_REFUSALS[source][verdict.blocked]
            )


@router.post("/plan")
async def create_plan(request: PlanRequest) -> SignedPlan:
    if request.profile and len(profile_text(request.profile)) > MAX_PROFILE_CHARS:
        raise HTTPException(status_code=422, detail=PROFILE_TOO_LONG)
    # "" or only spaces (stripped by the schema) = no job description
    request.job_description = request.job_description or None

    await guard_plan(request)

    try:
        plan = await make_plan(
            request.settings, request.profile, request.job_description
        )
    except Exception as error:
        logger.warning("plan failed: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail=PLAN_FAILED) from error
    # the chat only accepts the plan back with this signature
    return sign_plan(plan)
