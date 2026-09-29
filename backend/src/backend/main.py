from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import config, cv, health, interview, plan
from backend.config import settings

app = FastAPI(title="AI Interview API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["Retry-After"],  # Reach it to the browser
)

app.include_router(health.router)
app.include_router(interview.router)
app.include_router(config.router)
app.include_router(cv.router)
app.include_router(plan.router)
