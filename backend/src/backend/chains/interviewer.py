from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable

from backend.chains.llm import get_chat_model
from backend.prompts import load_prompt


def build_interviewer_chain() -> Runnable:
    # Build prompt "template" for consistent system prompt + history to be
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", load_prompt("interviewer/zero_shot_v1")),
            MessagesPlaceholder("history"),
        ]
    )
    return prompt | get_chat_model()  # returns a langchain "chain"
