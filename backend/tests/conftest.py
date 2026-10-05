import os

# tests never call OpenRouter: a placeholder key, so they also run without a .env
os.environ.setdefault("OPENROUTER_API_KEY", "sk-or-v1-test")
