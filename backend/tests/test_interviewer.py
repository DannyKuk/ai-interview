from langchain_core.language_models.fake_chat_models import FakeListChatModel
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from backend.chains.interviewer import build_interviewer_chain


def test_prompt_puts_system_prompt_before_history():
    history = [
        AIMessage("Tell me about yourself."),
        HumanMessage("I'm a backend developer."),
    ]

    # .first is the template step, so no model is called here
    prompt = build_interviewer_chain().first
    messages = prompt.invoke({"history": history}).to_messages()

    assert isinstance(messages[0], SystemMessage)
    assert "Guugle" in messages[0].content
    assert messages[1:] == history


def test_chain_returns_model_reply(monkeypatch):
    fake = FakeListChatModel(responses=["Welcome! Tell me about yourself."])
    # Patch the name inside interviewer.py, because that's the one the chain uses
    monkeypatch.setattr("backend.chains.interviewer.get_chat_model", lambda: fake)

    reply = build_interviewer_chain().invoke({"history": []})

    assert reply.text == "Welcome! Tell me about yourself."
