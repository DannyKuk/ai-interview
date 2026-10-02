from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware

from backend.api import config, cv, feedback, health, interview, plan, presets, voice
from backend.api.cost_cap import COST_HEADER, GUARD_COST_HEADER
from backend.config import settings
from backend.services.stt import load_model


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # load Parakeet before the first answer, not during it (~1 s; the very first start
    # downloads 631 MB). Tests use TestClient(app) without "with", so this doesn't run
    await run_in_threadpool(load_model)
    yield


app = FastAPI(title="AI Interview API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Retry-After", COST_HEADER, GUARD_COST_HEADER],
)

app.include_router(health.router)
app.include_router(interview.router)
app.include_router(config.router)
app.include_router(cv.router)
app.include_router(plan.router)
app.include_router(feedback.router)
app.include_router(presets.router)
app.include_router(voice.router)
