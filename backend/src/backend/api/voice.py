import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool

from backend.api.rate_limit import stt_rate_limit
from backend.schemas.voice import TranscriptResponse
from backend.services.stt import MAX_AUDIO_BYTES, SttError, transcribe

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/voice", tags=["voice"])

TRANSCRIBE_FAILED = "We couldn't make out that answer. Please try again or type it."

# the body is raw PCM
RAW_PCM_BODY = {
    "requestBody": {
        "required": True,
        "description": "Raw PCM: 16 kHz, mono, 16-bit little-endian, no header",
        "content": {
            "application/octet-stream": {
                "schema": {"type": "string", "format": "binary"}
            }
        },
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
