# syntax=docker/dockerfile:1

FROM ghcr.io/astral-sh/uv:0.12.17-python3.14-trixie-slim AS build

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0

WORKDIR /app

# dependencies first: this layer stays cached until uv.lock changes
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --locked --no-dev --no-install-project

# then the app itself, as a normal (non-editable) package: the runtime needs no source
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-editable


FROM python:3.14-slim-trixie

RUN groupadd --system app && useradd --system --gid app app

COPY --from=build --chown=app:app /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1

USER app
EXPOSE 8000

# settings come from environment variables (compose passes the root .env)
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
