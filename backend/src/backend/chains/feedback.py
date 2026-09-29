import logging
from dataclasses import dataclass

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from backend.chains.llm import get_chat_model
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.schemas.chat import InterviewSettings
from backend.schemas.feedback import AnsweredQuestion, FeedbackText
from backend.schemas.plan import InterviewPlan
from backend.services.answer_scores import ScoredAnswer

logger = logging.getLogger(__name__)


def build_feedback_chain() -> Runnable:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", load_prompt("feedback/zero_shot_v1")),
            ("human", "{interview}"),
        ]
    )
    # include_raw: the raw message carries the cost, the session's cost cap counts it.
    llm = get_chat_model(max_tokens=6000, effort="low").with_structured_output(
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
    for exchange in answer.exchanges:
        lines.append(wrap("interviewer", exchange.interviewer))
        lines.append(wrap("candidate_message", exchange.candidate))
    return "\n".join(lines)


@dataclass
class WrittenFeedback:
    text: FeedbackText
    cost: float | None  # USD, from OpenRouter's usage


async def write_feedback(
        settings: InterviewSettings,
        plan: InterviewPlan,
        answers: list[AnsweredQuestion],
        scores: list[ScoredAnswer],
        weakest: int,
) -> WrittenFeedback:
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

    if result["parsing_error"] or result["parsed"] is None:
        raise ValueError("feedback reply didn't parse")

    text: FeedbackText = result["parsed"]
    shown = {answer.question + 1 for answer in answers}
    written = {entry.number for entry in text.questions}
    
    if written != shown:
        logger.warning("feedback for %s, asked for %s", sorted(written), sorted(shown))

    return WrittenFeedback(text=text, cost=result["raw"].response_metadata.get("cost"))
