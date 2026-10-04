import asyncio
import time

import httpx
import pytest

from backend.chains.llm import get_chat_model
from backend.config import settings


def test_a_hanging_model_call_fails_after_its_own_timeout(monkeypatch):
    # the SDK's own retries would keep a hanging call going for minutes
    async def never_answer(reader, writer):
        await asyncio.sleep(60)

    async def call_a_hanging_server():
        server = await asyncio.start_server(never_answer, "127.0.0.1", 0)
        port = server.sockets[0].getsockname()[1]
        monkeypatch.setattr(
            settings, "openrouter_api_base", f"http://127.0.0.1:{port}/api/v1"
        )
        # wait_for: if it retries, the test fails after 5 s instead of hanging
        await asyncio.wait_for(get_chat_model(timeout_ms=200).ainvoke("hi"), 5)

    start = time.monotonic()
    with pytest.raises(httpx.TimeoutException):
        asyncio.run(call_a_hanging_server())
    assert time.monotonic() - start < 2
