import logging

from fastapi import APIRouter, Depends, HTTPException, Response, UploadFile
from fastapi.concurrency import run_in_threadpool

from backend.api.cost_cap import report_cost
from backend.api.rate_limit import cv_rate_limit
from backend.chains.cv_profile import extract_profile
from backend.guard.jev import check_document
from backend.schemas.cv import CandidateProfile
from backend.schemas.guard import DocumentBlockReason
from backend.services.cv_reader import MAX_CV_BYTES, CvError, read_cv

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cv", tags=["cv"], dependencies=[Depends(cv_rate_limit)])

# 422 = "fix your file", 503 = "not your fault, try again"
CV_REFUSALS: dict[DocumentBlockReason, tuple[int, str]] = {
    "injection": (
        422,
        (
            "Your CV contains text addressed to an AI system, so we can't use it. "
            "Please upload a version without it."
        ),
    ),
    "wrong_kind": (422, "This doesn't look like a CV. Please upload your CV as a PDF."),
    "guard_error": (503, "We couldn't check your CV right now. Please try again."),
}
PROFILE_FAILED = "We couldn't read your CV right now. Please try again."


@router.post("/parse")
async def parse_cv(file: UploadFile, response: Response) -> CandidateProfile:
    # Starlette keeps uploads up to 1 MB in memory, bigger ones in a temp file that is
    # deleted after the request (the app only runs on the user's machine)
    data = await file.read(MAX_CV_BYTES + 1)  # one byte over is enough to say "too big"

    try:
        # pypdf is slow, a worker thread keeps other requests going
        text = await run_in_threadpool(read_cv, data)
    except CvError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error

    verdict = await check_document("cv", text)
    if verdict.blocked:
        status_code, detail = CV_REFUSALS[verdict.blocked]
        raise HTTPException(status_code=status_code, detail=detail)

    try:
        profile = await extract_profile(text)
    except Exception as error:  # timeout, provider error, …
        logger.warning("cv profile failed: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail=PROFILE_FAILED) from error
    report_cost(response, profile.cost)
    return profile.value
