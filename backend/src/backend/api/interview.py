from fastapi import APIRouter
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from backend.chains.interviewer import build_interviewer_chain
from backend.schemas.chat import ChatMessage, ChatRequest, ChatResponse

router = APIRouter(prefix="/api/interview", tags=["interview"])


def to_langchain_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    # our "user"/"assistant" roles -> LangChain message objects
    return [
        HumanMessage(m.content) if m.role == "user" else AIMessage(m.content)
        for m in messages
    ]


@router.post("/chat")
async def chat(request: ChatRequest) -> ChatResponse:
    chain = build_interviewer_chain()
    result = await chain.ainvoke({"history": to_langchain_messages(request.messages)})
    return ChatResponse(reply=result.text)
