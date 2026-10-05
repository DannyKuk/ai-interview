def wrap(tag: str, text: str) -> str:
    # untrusted text between tags, < and > escaped: it can't open or close a tag
    escaped = text.replace("<", "&lt;").replace(">", "&gt;")
    return f"<{tag}>{escaped}</{tag}>"
