from langchain_core.messages import BaseMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable

from backend.chains.llm import get_chat_model
from backend.prompts import load_prompt
from backend.prompts.interview_settings import DIFFICULTY, PERSONA
from backend.schemas.chat import InterviewSettings, Technique


def build_interviewer_chain(technique: Technique = "zero_shot") -> Runnable:
    # Build prompt "template" for consistent system prompt + history to be
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                load_prompt(f"interviewer/{technique}_v1"),
            ),  # technique translates to file-name!
            MessagesPlaceholder("history"),
        ]
    )
    return prompt | get_chat_model()  # returns a langchain "chain"


def build_interviewer_input(
    settings: InterviewSettings, history: list[BaseMessage]
) -> dict:
    # fills every {placeholder} in the prompt + the history slot
    return {
        "company": settings.company,
        "role": settings.role,
        "difficulty": DIFFICULTY[settings.difficulty],
        "persona": PERSONA[settings.persona],
        "history": history,
    }
