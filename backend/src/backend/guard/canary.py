import secrets


def new_canary() -> str:
    # create a new secret for every requests system prompt - if the model is leaking it, our system prompt has been leaked and we must stop the respnse.
    return secrets.token_hex(8)


def leaked(text: str, canary: str) -> bool:
    return canary in text.lower()
