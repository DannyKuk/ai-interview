"""Interactive terminal chat: see what the Jev guard and the interviewer do on every turn.

Calls the guard and the interviewer chain directly (no server needed).

    uv run python scripts/chat_cli.py
    uv run python scripts/chat_cli.py --role "Data Scientist" --technique few_shot --persona strict
    uv run python scripts/chat_cli.py --model openai/gpt-5-nano --effort minimal --max-tokens 600

Commands while chatting:
    /guard <text>   only ask the guard (cheap, nothing goes to the interviewer)
    /reset          start the interview again
    /quit           exit (or Ctrl+D)
"""

import argparse
import asyncio
import time
from typing import get_args

from pydantic import ValidationError

from backend.api.interview import FALLBACK_REPLY, to_langchain_messages
from backend.chains.interviewer import build_interviewer_chain, build_interviewer_input
from backend.config import settings as app_settings
from backend.guard.canary import leaked
from backend.guard.jev import check_input
from backend.prompts.turn_hints import HintName, pick_hint
from backend.schemas.chat import (
    ChatMessage,
    Effort,
    InterviewSettings,
    ModelSettings,
    Technique,
)
from backend.schemas.guard import GuardVerdict

DIM, RED, GREEN, CYAN, RESET = "\033[2m", "\033[31m", "\033[32m", "\033[36m", "\033[0m"


def choices(field: str) -> tuple[str, ...]:
    # the allowed values of a Literal field, e.g. ("easy", "medium", "hard")
    return get_args(InterviewSettings.model_fields[field].annotation)


def print_verdict(verdict: GuardVerdict, seconds: float) -> None:
    color = RED if verdict.blocked else GREEN
    status = f"BLOCKED ({verdict.blocked})" if verdict.blocked else "allowed"
    probabilities = ", ".join(
        f"{name} {p:.2f}"
        for name, p in sorted(verdict.probabilities.items(), key=lambda x: -x[1])
    )
    print(
        f"{DIM}  guard {seconds:.2f}s | role_injection {verdict.role_injection} | "
        f"{probabilities or 'no message'} | {RESET}{color}{status}{RESET}"
    )
    if verdict.answered is not None or verdict.wants_to_end is not None:
        hint = pick_hint(verdict)
        print(
            f"{DIM}  signals | answered {verdict.answered} | vague {verdict.vague} | "
            f"wants_to_end {verdict.wants_to_end} | hint {hint}{RESET}"
        )


async def interviewer_turn(
    chain,
    settings: InterviewSettings,
    history: list[ChatMessage],
    hint: HintName | None = None,
) -> str:
    # stream the reply to the terminal, then show usage + cost
    chain_input = build_interviewer_input(
        settings, to_langchain_messages(history), hint
    )
    start = time.perf_counter()
    first_token = None
    reply, usage, cost, finish = "", None, None, None

    print(f"{CYAN}interviewer>{RESET} ", end="", flush=True)
    async for chunk in chain.astream(chain_input):
        if chunk.text:
            first_token = first_token or time.perf_counter() - start
            reply += chunk.text
            print(chunk.text, end="", flush=True)
        finish = chunk.response_metadata.get("finish_reason", finish)
        if chunk.usage_metadata:
            usage = chunk.usage_metadata
            cost = chunk.response_metadata.get("cost")

    if not reply:
        reply = FALLBACK_REPLY
        print(f"{RED}{reply}{RESET}", end="")
    print()
    if leaked(reply, chain_input["canary"]):
        # the test script can show it - helps with debugging
        print(f"{RED}  CANARY LEAKED: the API would block this reply{RESET}")

    tokens = (
        f"in {usage['input_tokens']} / out {usage['output_tokens']}" if usage else "?"
    )
    print(
        f"{DIM}  llm first token {first_token or 0:.2f}s, total "
        f"{time.perf_counter() - start:.2f}s | {tokens} | cost ${cost} | "
        f"finish {finish}{RESET}"
    )
    return reply


async def start_interview(
    chain, settings: InterviewSettings
) -> list[ChatMessage] | None:
    # the role goes into the system prompt, so it's checked before the first turn
    start = time.perf_counter()
    verdict = await check_input(settings.role)
    print_verdict(verdict, time.perf_counter() - start)
    if verdict.blocked:
        return None

    history: list[ChatMessage] = []
    reply = await interviewer_turn(chain, settings, history)
    history.append(ChatMessage(role="assistant", content=reply))
    return history


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--company", choices=choices("company"), default="Guugle")
    parser.add_argument("--role", default="Software Engineer")
    parser.add_argument("--difficulty", choices=choices("difficulty"), default="medium")
    parser.add_argument("--persona", choices=choices("persona"), default="friendly")
    parser.add_argument("--technique", choices=get_args(Technique), default="zero_shot")
    parser.add_argument("--model", choices=app_settings.allowed_models)
    parser.add_argument("--effort", choices=get_args(Effort), default="low")
    parser.add_argument("--max-tokens", type=int, default=1000)
    args = parser.parse_args()

    try:
        settings = InterviewSettings(
            company=args.company,
            role=args.role,
            difficulty=args.difficulty,
            persona=args.persona,
        )
        model_settings = ModelSettings(
            model=args.model,
            reasoning_effort=args.effort,
            max_tokens=args.max_tokens,
        )
    except ValidationError as error:
        # same schema checks as the API (e.g. role pattern / length)
        print(f"{RED}invalid settings:{RESET} {error}")
        return

    print(
        f"{DIM}{settings.model_dump()} | technique {args.technique} | "
        f"{model_settings.model_dump()}{RESET}\n"
    )
    chain = build_interviewer_chain(args.technique, model_settings)
    history = await start_interview(chain, settings)
    if history is None:
        print(f"{RED}role blocked, try another --role{RESET}")
        return

    while True:
        try:
            text = (await asyncio.to_thread(input, "\nyou> ")).strip()
        except EOFError, KeyboardInterrupt:
            break
        if not text:
            continue
        if text == "/quit":
            break
        if text == "/reset":
            print()
            history = await start_interview(chain, settings) or []
            continue

        guard_only = text.startswith("/guard ")
        if guard_only:
            text = text.removeprefix("/guard ").strip()

        try:
            message = ChatMessage(role="user", content=text)
        except ValidationError as error:
            print(f"{RED}invalid message:{RESET} {error.errors()[0]['msg']}")
            continue

        last_question = next(
            (m.content for m in reversed(history) if m.role == "assistant"), None
        )
        start = time.perf_counter()
        verdict = await check_input(settings.role, last_question, message.content)
        print_verdict(verdict, time.perf_counter() - start)

        # blocked messages are not added to the history (what the API will do in 10b)
        if guard_only or verdict.blocked:
            continue

        history.append(message)
        hint = pick_hint(verdict)
        reply = await interviewer_turn(chain, settings, history, hint)
        history.append(ChatMessage(role="assistant", content=reply))

        if hint == "end":
            # the API sends ended="candidate_left"
            print(f"\n{DIM}  interviewer has left the meeting{RESET}")
            break


if __name__ == "__main__":
    asyncio.run(main())
