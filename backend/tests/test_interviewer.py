from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.prompts.interview_settings import DIFFICULTY, PERSONA
from backend.schemas.chat import InterviewSettings


def render_system_prompt(settings: InterviewSettings) -> str:
    prompt = (
        build_interviewer_chain().first
    )  # .first gives us only the prompt, not the model!
    messages = prompt.invoke(build_interviewer_input(settings, [])).to_messages()
    return messages[0].content


def test_prompt_puts_system_prompt_before_history():
    history = [
        AIMessage("Tell me about yourself."),
        HumanMessage("I'm a backend developer."),
    ]

    # .first is the template step, so no model is called here
    prompt = build_interviewer_chain().first
    chain_input = build_interviewer_input(InterviewSettings(), history)
    messages = prompt.invoke(chain_input).to_messages()

    assert isinstance(messages[0], SystemMessage)
    assert messages[1:] == history


def test_settings_are_filled_into_the_prompt():
    settings = InterviewSettings(
        company="Netflux", role="Data Analyst", difficulty="hard", persona="strict"
    )

    system_prompt = render_system_prompt(settings)

    assert "Netflux" in system_prompt
    assert "Data Analyst" in system_prompt
    assert DIFFICULTY["hard"] in system_prompt
    assert PERSONA["strict"] in system_prompt


def test_every_placeholder_is_filled():
    # a forgotten {placeholder} would reach the model as literal text
    system_prompt = render_system_prompt(InterviewSettings())

    assert "{" not in system_prompt
    assert "}" not in system_prompt


def test_chain_returns_model_reply(monkeypatch):
    fake = FakeListChatModel(responses=["Welcome! Tell me about yourself."])
    # Patch the name inside interviewer.py, because that's the one the chain uses
    monkeypatch.setattr("backend.chains.interviewer.get_chat_model", lambda: fake)

    chain_input = build_interviewer_input(InterviewSettings(), [])
    reply = build_interviewer_chain().invoke(chain_input)

    assert reply.text == "Welcome! Tell me about yourself."
