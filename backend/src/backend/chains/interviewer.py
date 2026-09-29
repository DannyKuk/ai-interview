from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable

from backend.chains.llm import get_chat_model
from backend.guard.canary import new_canary
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.prompts.interview_settings import DIFFICULTY, PERSONA
from backend.schemas.chat import InterviewSettings, ModelSettings, Technique


def build_interviewer_chain(
        technique: Technique = "zero_shot",
        model_settings: ModelSettings | None = None,
        with_plan: bool = False,
) -> Runnable:
    parts = [
        load_prompt("interviewer/canary_v1"),  # stop before leaking system prompt
        load_prompt(f"interviewer/{technique}_v1"),  # technique = file name
        # the plan's rules, only when there is one: the per-turn note says what to ask
        load_prompt("interviewer/plan_v1") if with_plan else None,
        load_prompt("interviewer/security_v1"),
    ]
    # Build prompt "template" for consistent system prompt + history to be
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", "\n\n".join(part for part in parts if part)),
            MessagesPlaceholder("history"),
            MessagesPlaceholder("note"),
        ]
    )
    model_settings = model_settings or ModelSettings()
    llm = get_chat_model(
        model=model_settings.model,
        max_tokens=model_settings.max_tokens,
        effort=model_settings.reasoning_effort,
    )
    return prompt | llm  # returns a langchain "chain"


def build_interviewer_input(
        settings: InterviewSettings,
        history: list[BaseMessage],
        note: str | None = None,
        approach: str | None = None,
) -> dict:
    # fills every {placeholder} in the prompt + the history slot.
    # Candidate text is wrapped in tags, so the model sees it as data (see security_v1.md).
    # note: what to do this turn (a turn hint or the plan's next step)
    chain_input = {
        "company": settings.company,
        "role": wrap("role", settings.role),
        "difficulty": DIFFICULTY[settings.difficulty],
        "persona": PERSONA[settings.persona],
        "history": [wrap_candidate(m) for m in history],
        "canary": new_canary(),  # new per request
        "note": [SystemMessage(f"Note for this turn: {note}")] if note else [],
    }
    if approach:  # only with a plan
        chain_input["approach"] = approach
    return chain_input


def wrap_candidate(message: BaseMessage) -> BaseMessage:
    # only the human message will be wrapped
    if isinstance(message, HumanMessage):
        return HumanMessage(wrap("candidate_message", message.content))
    return message
