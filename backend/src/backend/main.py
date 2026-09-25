from fastapi import FastAPI

from backend.api import health, interview

app = FastAPI(title="AI Interview API")

app.include_router(health.router)
app.include_router(interview.router)
