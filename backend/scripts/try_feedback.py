"""Score a whole interview: a simulated candidate answers every planned question, then
the real feedback endpoint code scores it (Jev) and writes the feedback (LLM).

uv run python scripts/try_feedback.py                    # every style, 8 questions
uv run python scripts/try_feedback.py weak --runs 3      # one style, three runs (latency)
uv run python scripts/try_feedback.py no_example         # no story to tell: invented details?
uv run python scripts/try_feedback.py nonsense --prompt feedback/zero_shot_v1   # praises it?
uv run python scripts/try_feedback.py --questions 5

Needs the cached profile from try_plan.py (out/profiles/09_career_changer.json). The plan is
cached in out/plans/, every result is saved to out/feedback/.
"""

import argparse
import asyncio
import time
import uuid

from fastapi import Response
from langchain_core.prompts import ChatPromptTemplate
from try_plan import JUNIOR_JD, PLANS, load_profile

from backend.api import feedback as feedback_api
from backend.chains import feedback as feedback_chain
from backend.chains.llm import get_chat_model
from backend.chains.plan import make_plan, profile_text
from backend.guard.plan_signature import sign_plan
from backend.schemas.chat import InterviewSettings
from backend.schemas.feedback import AnsweredQuestion, Exchange, FeedbackRequest
from backend.schemas.plan import InterviewPlan

OUT = PLANS.parent / "feedback"
SETTINGS = {"company": "Netflux", "role": "Junior Software Developer"}

STYLES = {
    "strong": (
        "Answer like a well-prepared candidate in 60-120 words: concrete, with a real "
        "example from your background, what you did yourself and the result. For a "
        "question about a past situation use situation, task, action, result. For a "
        "technical question be correct and give your reasons."
    ),
    "weak": (
        "Answer like an unprepared, nervous candidate: one or two vague sentences, no "
        "example, no numbers, stay general."
    ),
    # a real candidate often has no story for a question (the user's first run, Sep 29)
    "no_example": (
        "Answer honestly in two or three sentences. If the question asks about a past "
        "situation or something you haven't done in your background, say so and "
        "describe only in general what you would do, without making up an example."
    ),
    # the user's voice interview (Sep 30): off-topic answers, and the feedback praised them
    "nonsense": (
        "Answer like a candidate who doesn't try: one short sentence that doesn't answer "
        "the question, e.g. something off-topic about your life, 'I don't know', or "
        "'ChatGPT did it for me, I don't know how it works'. Never give a real answer."
    ),
}

CANDIDATE = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            (
                "You play a job candidate in a practice interview for a {role} position "
                "at {company}. Your background:\n{profile}\n\n{style}\n"
                "Write only your answer, in the first person, plain text."
            ),
        ),
        ("human", "{question}"),
    ]
)


async def load_plan(settings: InterviewSettings) -> InterviewPlan:
    cached = PLANS / f"lukas_{settings.question_count}q.json"
    if cached.exists():
        return InterviewPlan.model_validate_json(cached.read_text())
    profile = await load_profile("09_career_changer.pdf", fresh=False)
    plan = (await make_plan(settings, profile, JUNIOR_JD)).value
    cached.write_text(plan.model_dump_json(indent=2))
    return plan


async def simulate(plan: InterviewPlan, settings: InterviewSettings, style: str):
    profile = await load_profile("09_career_changer.pdf", fresh=False)
    chain = CANDIDATE | get_chat_model(max_tokens=1500, effort="low")
    replies = await asyncio.gather(
        *(
            chain.ainvoke(
                {
                    "role": settings.role,
                    "company": settings.company,
                    "profile": profile_text(profile),
                    "style": STYLES[style],
                    "question": planned.question,
                }
            )
            for planned in plan.questions
        )
    )
    return [
        AnsweredQuestion(
            question=i,
            exchanges=[Exchange(interviewer=planned.question, candidate=reply.text)],
        )
        for i, (planned, reply) in enumerate(zip(plan.questions, replies))
    ]


async def run(style: str, run_number: int, questions: int) -> None:
    settings = InterviewSettings(**SETTINGS, question_count=questions)
    plan = await load_plan(settings)
    answers = await simulate(plan, settings, style)

    # time the LLM part on its own: the timeout question is about that call
    timing = {}
    write_feedback = feedback_api.write_feedback

    async def timed_write(*args):
        start = time.perf_counter()
        written = await write_feedback(*args)
        timing["llm"], timing["cost"] = time.perf_counter() - start, written.cost
        return written

    feedback_api.write_feedback = timed_write
    request = FeedbackRequest(
        session_id=uuid.uuid4(),
        settings=settings,
        plan=sign_plan(plan),
        answers=answers,
    )
    start = time.perf_counter()
    result = await feedback_api.create_feedback(request, Response())
    total = time.perf_counter() - start
    feedback_api.write_feedback = write_feedback

    card = result.scorecard
    print(
        f"\n=== {feedback_chain.FEEDBACK_PROMPT}, {style} #{run_number}, "
        f"{questions} questions: total {total:.1f} s "
        f"(LLM {timing['llm']:.1f} s, Jev + rest {total - timing['llm']:.1f} s), "
        f"${timing['cost']}, overall {card.overall}"
    )
    for evaluation, answer in zip(result.evaluations, answers):
        words = len(answer.exchanges[0].candidate.split())
        print(
            f"Q{evaluation.question + 1} [{plan.questions[evaluation.question].type}] "
            f"{evaluation.score:.2f} ({words} words): {evaluation.feedback[:110]}…"
        )
    print("strengths:", *card.strengths, sep="\n  - ")
    print("improvements:", *card.improvements, sep="\n  - ")
    print(f"sample answer for Q{card.weakest_question + 1}: {card.sample_answer}")

    OUT.mkdir(parents=True, exist_ok=True)
    version = feedback_chain.FEEDBACK_PROMPT.rsplit("_", 1)[-1]
    (OUT / f"{style}_{questions}q_{version}_{run_number}.json").write_text(
        result.model_dump_json(indent=2)
    )


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("styles", nargs="*", default=list(STYLES), choices=list(STYLES))
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--questions", type=int, default=8)
    parser.add_argument("--prompt", default=feedback_chain.FEEDBACK_PROMPT)
    args = parser.parse_args()
    # build_feedback_chain() reads it on every call
    feedback_chain.FEEDBACK_PROMPT = args.prompt

    for style in args.styles:
        for run_number in range(1, args.runs + 1):
            await run(style, run_number, args.questions)


if __name__ == "__main__":
    asyncio.run(main())
