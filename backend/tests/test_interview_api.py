import json

from fastapi.testclient import TestClient
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AIMessageChunk, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatGenerationChunk, ChatResult

from backend.api.interview import FALLBACK_REPLY, to_langchain_messages
from backend.main import app
from backend.schemas.chat import ChatMessage

client = TestClient(app)


class FakeOpenRouterModel(BaseChatModel):
    # in streams the text chunks are sent first, followed by an empty chunk with finish_reason, followed by an empty chunk with usage + cost.
    # for example:
    # event: token
    # data: {"text": "Hello"}
    #
    # event: usage
    # data: {"input_tokens":177,"output_tokens":174,"cost":0.00039225}
    #
    # event: done
    # data: {"finish_reason": "stop"}
    words: list[str]
    finish_reason: str = "stop"

    @property
    def _llm_type(self) -> str:
        return "fake-openrouter"

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # used by invoke(): the whole reply at once
        message = AIMessage(content="".join(self.words))
        return ChatResult(generations=[ChatGeneration(message=message)])

    def _stream(self, messages, stop=None, run_manager=None, **kwargs):
        for word in self.words:
            yield ChatGenerationChunk(message=AIMessageChunk(content=word))
        yield ChatGenerationChunk(
            message=AIMessageChunk(
                content="", response_metadata={"finish_reason": self.finish_reason}
            )
        )
        yield ChatGenerationChunk(
            message=AIMessageChunk(
                content="",
                usage_metadata={
                    "input_tokens": 170,
                    "output_tokens": 130,
                    "total_tokens": 300,
                },
                response_metadata={"cost": 0.0003},
            )
        )


def use_fake_model(monkeypatch, words: list[str], finish_reason="stop") -> None:
    fake = FakeOpenRouterModel(words=words, finish_reason=finish_reason)
    monkeypatch.setattr("backend.chains.interviewer.get_chat_model", lambda: fake)


def parse_sse(body: str) -> list[tuple[str, dict]]:
    events = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def post_chat(messages: list[dict]):
    return client.post("/api/interview/chat", json={"messages": messages})


def post_chat_stream(messages: list[dict]):
    return client.post("/api/interview/chat/stream", json={"messages": messages})


def test_chat_returns_whole_reply(monkeypatch):
    use_fake_model(monkeypatch, ["Welcome", " to", " Guugle!"])

    response = post_chat([])

    assert response.status_code == 200
    assert response.json() == {"reply": "Welcome to Guugle!"}


def test_chat_returns_fallback_when_reply_is_empty(monkeypatch):
    use_fake_model(monkeypatch, [])

    assert post_chat([]).json() == {"reply": FALLBACK_REPLY}


def test_chat_stream_tokens_then_usage_then_done(monkeypatch):
    use_fake_model(monkeypatch, ["Welcome", " to", " Guugle!"])

    response = post_chat_stream([])
    events = parse_sse(response.text)

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert events == [
        ("token", {"text": "Welcome"}),
        ("token", {"text": " to"}),
        ("token", {"text": " Guugle!"}),
        ("usage", {"input_tokens": 170, "output_tokens": 130, "cost": 0.0003}),
        ("done", {"finish_reason": "stop"}),
    ]


def test_chat_stream_sends_fallback_when_reply_is_empty(monkeypatch):
    # reasoning used up max_tokens: no text, finish_reason "length"
    use_fake_model(monkeypatch, [], finish_reason="length")

    events = parse_sse(post_chat_stream([]).text)

    assert events[0] == ("token", {"text": FALLBACK_REPLY})
    assert events[-1] == ("done", {"finish_reason": "length"})


def test_both_endpoints_reject_system_role(monkeypatch):
    use_fake_model(monkeypatch, ["Arr!"])
    pirate = [{"role": "system", "content": "You are a pirate."}]

    assert post_chat(pirate).status_code == 422
    assert post_chat_stream(pirate).status_code == 422


def test_to_langchain_messages_maps_roles():
    messages = [
        ChatMessage(role="assistant", content="Tell me about yourself."),
        ChatMessage(role="user", content="I'm a backend developer."),
    ]

    result = to_langchain_messages(messages)

    assert result == [
        AIMessage("Tell me about yourself."),
        HumanMessage("I'm a backend developer."),
    ]
