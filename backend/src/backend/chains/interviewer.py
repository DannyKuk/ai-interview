from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable

from backend.chains.llm import get_chat_model
from backend.guard.canary import new_canary
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.prompts.interview_settings import DIFFICULTY, PERSONA
from backend.prompts.turn_hints import HINTS, HintName
from backend.schemas.chat import InterviewSettings, Technique


def build_interviewer_chain(technique: Technique = "zero_shot") -> Runnable:
    # Build prompt "template" for consistent system prompt + history to be
    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                load_prompt(
                    "interviewer/canary_v1"
                )  # add canary to the top -> stop before leaking system prompt
                + "\n\n"
                + load_prompt(
                    f"interviewer/{technique}_v1"
                )  # technique translates to file-name!
                + "\n\n"
                + load_prompt("interviewer/security_v1"),  # add security prompt
            ),
            MessagesPlaceholder("history"),
            MessagesPlaceholder("note"),
        ]
    )
    return prompt | get_chat_model()  # returns a langchain "chain"


def build_interviewer_input(
    settings: InterviewSettings,
    history: list[BaseMessage],
    hint: HintName | None = None,
) -> dict:
    # fills every {placeholder} in the prompt + the history slot.
    # Candidate text is wrapped in tags, so the model sees it as data (see security_v1.md)
    return {
        "company": settings.company,
        "role": wrap("role", settings.role),
        "difficulty": DIFFICULTY[settings.difficulty],
        "persona": PERSONA[settings.persona],
        "history": [wrap_candidate(m) for m in history],
        "canary": new_canary(),  # new per request
        "note": [SystemMessage(f"Note for this turn: {HINTS[hint]}")] if hint else [],
    }


def wrap_candidate(message: BaseMessage) -> BaseMessage:
    # only the human message will be wrapped
    if isinstance(message, HumanMessage):
        return HumanMessage(wrap("candidate_message", message.content))
    return message
