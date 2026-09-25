## uvicorn
```bash
uv run uvicorn backend.main:app --reload --port 8000 --app-dir src
```

## ruff
```bash
uv run ruff check --fix . && uv run ruff format .
```

## pytest
```bash
uv run pytest -v
```