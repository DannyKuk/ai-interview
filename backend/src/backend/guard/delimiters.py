def wrap(tag: str, text: str) -> str:
    # untrusted text between tags and delete user input tags
    escaped = text.replace("<", "&lt;").replace(">", "&gt;")
    return f"<{tag}>{escaped}</{tag}>"
