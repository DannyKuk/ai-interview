from collections.abc import AsyncIterator
from contextlib import aclosing
from dataclasses import dataclass

from fastapi import APIRouter, Depends
from fastapi.sse import EventSourceResponse, ServerSentEvent
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from langchain_core.runnables import Runnable

from backend.api.cost_cap import OUT_OF_TIME, add_cost, over_cap
from backend.api.rate_limit import chat_rate_limit
from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.guard.canary import leaked
from backend.guard.jev import check_input
from backend.prompts.turn_hints import HintName, pick_hint
from backend.schemas.chat import (
    ChatMessage,
    ChatRequest,
    ChatResponse,
    EndReason,
    Usage,
)
from backend.schemas.guard import BlockReason, GuardVerdict

# Add rate_limit to the APIRouter
router = APIRouter(
    prefix="/api/interview", tags=["interview"], dependencies=[Depends(chat_rate_limit)]
)

# sent when the model returns no text (e.g. reasoning used up max_tokens)
FALLBACK_REPLY = "Sorry, I lost my train of thought. Could you say that again?"

# fallbacks if the message has been blocked by the guard
REFUSALS: dict[BlockReason, str] = {
    "message": "Let's keep this about the interview. Could you rephrase that?",
    "role": "Before we start: please enter just the job title you're applying for.",
    "guard_error": "Sorry, I didn't quite catch that. Could you say it again?",
    "leak": "Let's keep this about the interview. Where were we?",
}


def to_langchain_messages(messages: list[ChatMessage]) -> list[BaseMessage]:
    # our "user"/"assistant" roles -> LangChain message objects
    return [
        HumanMessage(m.content) if m.role == "user" else AIMessage(m.content)
        for m in messages
    ]


def blocked_events(reason: BlockReason) -> list[ServerSentEvent]:
    # the frontend replaces anything streamed so far with the refusal
    return [
        ServerSentEvent(
            event="blocked", data={"reason": reason, "reply": REFUSALS[reason]}
        ),
        ServerSentEvent(event="done", data={"finish_reason": "blocked"}),
    ]


async def guard_chat(request: ChatRequest) -> GuardVerdict:
    messages = request.messages
    newest = messages[-1] if messages and messages[-1].role == "user" else None
    last_question = next(
        (
            message.content
            for message in reversed(messages)
            if message.role == "assistant"
        ),
        None,
    )
    return await check_input(
        request.settings.role, last_question, newest.content if newest else None
    )


@dataclass
class PreparedChat:
    verdict: GuardVerdict
    hint: HintName | None
    ended: EndReason | None
    chain: Runnable
    chain_input: dict
    over_cap: bool = False


async def prepare_chat(request: ChatRequest) -> PreparedChat:
    if over_cap(request.session_id):
        return PreparedChat(
            verdict=GuardVerdict(),
            hint=None,
            ended="limit_reached",
            chain=build_interviewer_chain(
                request.system_prompt, request.model_settings
            ),
            chain_input={},
            over_cap=True,
        )

    verdict = await guard_chat(request)
    hint = pick_hint(verdict)
    chain = build_interviewer_chain(request.system_prompt, request.model_settings)
    chain_input = build_interviewer_input(
        request.settings, to_langchain_messages(request.messages), hint
    )
    return PreparedChat(
        verdict=verdict,
        hint=hint,
        ended="candidate_left" if hint == "end" else None,
        chain=chain,
        chain_input=chain_input,
    )


@router.post("/chat")
async def chat(request: ChatRequest) -> ChatResponse:
    # whole reply at once, as JSON (easy to try in /docs)
    turn = await prepare_chat(request)
    if turn.over_cap:
        return ChatResponse(reply=OUT_OF_TIME, ended=turn.ended)
    if turn.verdict.blocked:
        reason = turn.verdict.blocked
        return ChatResponse(reply=REFUSALS[reason], blocked=reason)

    result = await turn.chain.ainvoke(turn.chain_input)
    add_cost(request.session_id, result.response_metadata.get("cost"))
    if leaked(result.text, turn.chain_input["canary"]):
        return ChatResponse(reply=REFUSALS["leak"], blocked="leak")
    return ChatResponse(
        reply=result.text or FALLBACK_REPLY, hint=turn.hint, ended=turn.ended
    )


@router.post("/chat/stream", response_class=EventSourceResponse)
async def chat_stream(request: ChatRequest) -> AsyncIterator[ServerSentEvent]:
    turn = await prepare_chat(request)
    if turn.over_cap:
        # same shape as a normal goodbye turn, so the frontend closes the call
        yield ServerSentEvent(event="meta", data={"hint": None, "ended": turn.ended})
        yield ServerSentEvent(event="token", data={"text": OUT_OF_TIME})
        yield ServerSentEvent(event="done", data={"finish_reason": "limit_reached"})
        return
    if turn.verdict.blocked:
        # show refusal instead of streamed reply
        for event in blocked_events(turn.verdict.blocked):
            yield event
        return

    yield ServerSentEvent(event="meta", data={"hint": turn.hint, "ended": turn.ended})

    reply = ""
    finish_reason = None
    usage = Usage()

    # answer comes in small chunks. aclosing - stop the model (and its cost) on return
    async with aclosing(turn.chain.astream(turn.chain_input)) as stream:
        async for chunk in stream:
            if chunk.text:
                reply += chunk.text
                # check everything so far: the canary is split over several chunks
                if leaked(reply, turn.chain_input["canary"]):
                    for event in blocked_events("leak"):
                        yield event
                    return
                yield ServerSentEvent(event="token", data={"text": chunk.text})
            if "finish_reason" in chunk.response_metadata:
                finish_reason = chunk.response_metadata["finish_reason"]
            if chunk.usage_metadata:
                usage.input_tokens = chunk.usage_metadata["input_tokens"]
                usage.output_tokens = chunk.usage_metadata["output_tokens"]
                usage.cost = chunk.response_metadata.get("cost")

    add_cost(request.session_id, usage.cost)

    if not reply:
        yield ServerSentEvent(event="token", data={"text": FALLBACK_REPLY})

    yield ServerSentEvent(event="usage", data=usage)
    yield ServerSentEvent(event="done", data={"finish_reason": finish_reason})
