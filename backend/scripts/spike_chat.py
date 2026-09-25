from backend.chains.llm import get_chat_model

PROMPT = "You are a job interviewer. Greet the candidate in one sentence."


def run(label: str, max_tokens: int, effort: str) -> None:
    llm = get_chat_model(max_tokens=max_tokens, effort=effort)

    response = llm.invoke(PROMPT)

    print(f"--- {label} (max_tokens={max_tokens}, effort={effort}) ---")
    print("reply:", repr(response.text))
    print("usage:", response.usage_metadata)
    print("meta:", response.response_metadata)
    print()


if __name__ == "__main__":
    # 1. Normal settings for an interviewer turn: should reply fine
    run("normal", max_tokens=1000, effort="low")

    # 2. Too few tokens with high effort: reasoning uses up the budget,
    #    so expect an empty (or cut-off) reply
    run("starved", max_tokens=50, effort="high")
