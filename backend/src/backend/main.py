from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import health, interview
from backend.config import settings

app = FastAPI(title="AI Interview API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(health.router)
app.include_router(interview.router)
