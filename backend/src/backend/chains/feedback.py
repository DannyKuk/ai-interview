import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from backend.chains.llm import Priced, get_chat_model, priced
from backend.config import settings as app_settings
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.schemas.chat import InterviewSettings
from backend.schemas.feedback import AnsweredQuestion, FeedbackText
from backend.schemas.plan import InterviewPlan
from backend.services.answer_scores import ScoredAnswer

logger = logging.getLogger(__name__)

# v2: no made-up praise for bad answers, tone by score. v1 stays for the comparison
# (scripts/try_feedback.py --prompt feedback/zero_shot_v1)
FEEDBACK_PROMPT = "feedback/zero_shot_v2"


def build_feedback_chain() -> Runnable:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", load_prompt(FEEDBACK_PROMPT)),
            ("human", "{interview}"),
        ]
    )
    # include_raw: the raw message carries the cost, the session's cost cap counts it.
    llm = get_chat_model(
        max_tokens=6000, effort="low", timeout_ms=app_settings.feedback_timeout_ms
    ).with_structured_output(
        FeedbackText, method="function_calling", strict=True, include_raw=True
    )
    return prompt | llm


def format_question(
    plan: InterviewPlan, answer: AnsweredQuestion, scored: ScoredAnswer
) -> str:
    # our own texts (plan, scores) as they are; everything from the browser in tags
    planned = plan.questions[answer.question]
    lines = [
        (
            f"Question {answer.question + 1} ({planned.type}, topic: {planned.topic}), "
            f"score {scored.score:.1f} of 5"
        ),
        f"Planned question: {planned.question}",
        "Criteria and scores:",
        *[f"- {c.criterion}: {c.score:.1f}" for c in scored.criteria],
    ]
    if scored.wrong_claim:
        # Jev can't say which claim it means, the LLM has to find it
        lines.append(
            "A technical claim here is clearly wrong: name it in one sentence and say "
            "what is correct. If the candidate corrected it later, say so."
        )
    if scored.contradiction:
        # "name both statements" alone: 0 of 3 did, two praised the honesty instead.
        # Starting the feedback with it: 3 of 3 (Oct 2)
        lines.append(
            "Contradiction: something in this answer can't be true together with an "
            "answer to an earlier question. Start the feedback for this question with "
            "one sentence that names both: what the candidate said earlier and what "
            "they said here. If they cleared it up later, say so."
        )
    if scored.unverified:
        # else the feedback may call a correct but recent claim wrong
        lines.append(
            "Some technical claims here are too new or niche to check: don't call "
            "them right or wrong."
        )
    for exchange in answer.exchanges:
        lines.append(wrap("interviewer", exchange.interviewer))
        lines.append(wrap("candidate_message", exchange.candidate))
    return "\n".join(lines)


async def write_feedback(
    settings: InterviewSettings,
    plan: InterviewPlan,
    answers: list[AnsweredQuestion],
    scores: list[ScoredAnswer],
    weakest: int,
) -> Priced[FeedbackText]:
    # scores[i] belongs to answers[i]. weakest: the plan index the sample answer is for
    interview = "\n\n".join(
        format_question(plan, answer, scored)
        for answer, scored in zip(answers, scores, strict=True)
    )

    result = await build_feedback_chain().ainvoke(
        {
            "company": settings.company,
            "role": wrap("role", settings.role),
            "weakest": weakest + 1,
            "interview": interview,
        }
    )

    written = priced(result, "feedback")
    shown = {answer.question + 1 for answer in answers}
    numbers = {entry.number for entry in written.value.questions}

    if numbers != shown:
        logger.warning("feedback for %s, asked for %s", sorted(numbers), sorted(shown))

    return written
