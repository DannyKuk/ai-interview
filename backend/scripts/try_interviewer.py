from langchain_core.messages import AIMessage, HumanMessage

from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.schemas.chat import InterviewSettings


def run(label: str, history: list) -> None:
    chain = build_interviewer_chain()
    response = chain.invoke(build_interviewer_input(InterviewSettings(), history))

    print(f"--- {label} ({len(history)} messages in history) ---")
    print("reply:", repr(response.text))
    print("usage:", response.usage_metadata)
    print("finish:", response.response_metadata.get("finish_reason"))
    print()


if __name__ == "__main__":
    run("opening", [])  # run an opening prompt

    # Follow-up prompt
    run(
        "follow-up",
        [
            AIMessage("Hi, welcome to Guugle! Can you tell me a bit about yourself?"),
            HumanMessage(
                "Sure, I'm a backend developer with five years of Python. "
                "Lately I've been building APIs with FastAPI."
            ),
        ],
    )
