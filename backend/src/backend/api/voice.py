import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.concurrency import run_in_threadpool

from backend.api.cost_cap import add_cost, over_cap, report_cost
from backend.api.rate_limit import stt_rate_limit, tts_rate_limit
from backend.guard.jev import describe
from backend.schemas.voice import SpeakRequest, TranscriptResponse
from backend.services.stt import MAX_AUDIO_BYTES, SttError, transcribe
from backend.services.tts import SAMPLE_RATE, speak

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

TRANSCRIBE_FAILED = "We couldn't make out that answer. Please try again or type it."
# the browser reads the reply out with HeadTTS instead (local, free) after either one
SPEAK_OVER_BUDGET = "This interview has used up its budget for the cloud voice."
SPEAK_FAILED = "The cloud voice isn't available right now."

# raw PCM in and out, for /docs and the generated TS types
PCM_CONTENT = {
    "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
}
# the body is raw PCM
RAW_PCM_BODY = {
    "requestBody": {
        "required": True,
        "description": "Raw PCM: 16 kHz, mono, 16-bit little-endian, no header",
        "content": PCM_CONTENT,
    }
}


async def read_audio(request: Request) -> bytes:
    # stop reading once it's over the limit: transcribe() then says "too long",
    audio = bytearray()
    async for chunk in request.stream():
        audio += chunk
        if len(audio) > MAX_AUDIO_BYTES:
            break
    return bytes(audio)


@router.post(
    "/transcribe",
    dependencies=[Depends(stt_rate_limit)],
    openapi_extra=RAW_PCM_BODY,
)
async def transcribe_answer(request: Request) -> TranscriptResponse:
    audio = await read_audio(request)
    try:
        # CPU-bound: a worker thread keeps other requests going
        text = await run_in_threadpool(transcribe, audio)
    except SttError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:  # onnxruntime failure, …: only the type is logged
        logger.warning("transcribe failed: %s", type(error).__name__)
        raise HTTPException(status_code=503, detail=TRANSCRIBE_FAILED) from error
    return TranscriptResponse(text=text)


@router.post(
    "/speak",
    dependencies=[Depends(tts_rate_limit)],
    response_class=Response,
    responses={
        200: {
            "description": f"Raw PCM: {SAMPLE_RATE // 1000} kHz, mono, 16-bit, no header",
            "content": PCM_CONTENT,
        }
    },
)
async def speak_sentence(request: SpeakRequest) -> Response:
    # the text is the interviewer's reply, already guarded and canary-checked by the
    # chat. Sent back by the browser, so the cost cap + rate limit keep it from being a
    # free TTS proxy
    if over_cap(request.session_id):
        raise HTTPException(status_code=429, detail=SPEAK_OVER_BUDGET)
    try:
        audio = await speak(request.text, request.voice)
    except Exception as error:  # timeout, provider error, empty audio: no text logged
        logger.warning("tts failed: %s", describe(error))
        raise HTTPException(status_code=503, detail=SPEAK_FAILED) from error

    add_cost(request.session_id, audio.cost)
    response = Response(content=audio.value, media_type="application/octet-stream")
    report_cost(response, audio.cost)
    return response
