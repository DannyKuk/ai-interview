import math
import time
from collections.abc import Callable

from fastapi import HTTPException, Request
from limits import parse
from limits.storage import MemoryStorage
from limits.strategies import MovingWindowRateLimiter

from backend.config import settings

# in memory - resets when the backend restarts, fine for a local app
storage = MemoryStorage()
limiter = MovingWindowRateLimiter(storage)

RATE_LIMITED = "We're going a bit fast. Let's take a short breather and try again."


def rate_limit_for(name: str, get_limit: Callable[[], str]) -> Callable:
    # one budget per name and IP. get_limit is read on every request (tests change it)
    def rate_limit(request: Request) -> None:
        # FastAPI dependency: runs before the endpoint, also before a stream starts
        limit = parse(get_limit())
        ip = request.client.host if request.client else "unknown"
        if not limiter.hit(limit, name, ip):
            reset_time = limiter.get_window_stats(limit, name, ip).reset_time
            raise HTTPException(
                status_code=429,
                detail=RATE_LIMITED,
                headers={"Retry-After": str(math.ceil(reset_time - time.time()))},
            )

    return rate_limit


chat_rate_limit = rate_limit_for("chat", lambda: settings.chat_rate_limit)
cv_rate_limit = rate_limit_for("cv", lambda: settings.cv_rate_limit)
stt_rate_limit = rate_limit_for("stt", lambda: settings.stt_rate_limit)
