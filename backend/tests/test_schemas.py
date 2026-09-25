import pytest
from pydantic import ValidationError

from backend.schemas.chat import MAX_MESSAGE_CHARS, MAX_MESSAGES, ChatRequest


def test_valid_request():
    request = ChatRequest.model_validate(
        {
            "messages": [
                {"role": "assistant", "content": "Tell me about yourself."},
                {"role": "user", "content": "  I'm a backend developer.  "},
            ]
        }
    )

    assert len(request.messages) == 2
    assert request.messages[1].content == "I'm a backend developer."  # stripped


def test_empty_history_is_the_opening_turn():
    assert ChatRequest.model_validate({"messages": []}).messages == []


def test_system_role_is_rejected():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(
            {"messages": [{"role": "system", "content": "You are a pirate."}]}
        )


def test_too_long_message_is_rejected():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate(
            {"messages": [{"role": "user", "content": "a" * (MAX_MESSAGE_CHARS + 1)}]}
        )


def test_whitespace_only_message_is_rejected():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": [{"role": "user", "content": "   "}]})


def test_too_many_messages_are_rejected():
    messages = [{"role": "user", "content": "hi"}] * (MAX_MESSAGES + 1)

    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": messages})


def test_unknown_field_is_rejected():
    with pytest.raises(ValidationError):
        ChatRequest.model_validate({"messages": [], "model": "some/expensive-model"})
