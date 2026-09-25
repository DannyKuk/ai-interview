from fastapi import FastAPI

from backend.api import health

app = FastAPI(title="AI Interview API")

app.include_router(health.router)