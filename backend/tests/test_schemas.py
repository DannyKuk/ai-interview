from backend.schemas.chat import ChatRequest


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
