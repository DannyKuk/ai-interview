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

## chat cli (guard + interviewer in the terminal)
```bash
uv run python scripts/chat_cli.py --role "Data Scientist" --technique few_shot --persona strict
```
