import logging

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import Runnable

from backend.chains.llm import Priced, get_chat_model, priced
from backend.guard.delimiters import wrap
from backend.prompts import load_prompt
from backend.prompts.interview_settings import PLAN_DIFFICULTY
from backend.schemas.chat import Effort, InterviewSettings
from backend.schemas.cv import CandidateProfile
from backend.schemas.plan import InterviewPlan

logger = logging.getLogger(__name__)


# not minimal: ~2 s faster and fine in 6 runs, too few to trust it with the rubric (Oct 2)
def build_plan_chain(effort: Effort = "low") -> Runnable:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", load_prompt("plan")),
            ("human", "{documents}"),
        ]
    )
    # the JSON for 8 questions is ~1500 tokens, the rest is room for reasoning.
    # include_raw: the raw message carries the cost (the dev panel's cost breakdown)
    llm = get_chat_model(max_tokens=6000, effort=effort).with_structured_output(
        InterviewPlan, method="function_calling", strict=True, include_raw=True
    )
    return prompt | llm


def profile_text(profile: CandidateProfile) -> str:
    return profile.model_dump_json(indent=2)


def format_documents(
    profile: CandidateProfile | None, job_description: str | None
) -> str:
    parts = [
        wrap("cv_profile", profile_text(profile))
        if profile
        else "No CV profile given.",
        wrap("job_description", job_description)
        if job_description
        else "No job description given.",
    ]
    return "\n\n".join(parts)


async def make_plan(
    settings: InterviewSettings,
    profile: CandidateProfile | None = None,
    job_description: str | None = None,
    effort: Effort = "low",
) -> Priced[InterviewPlan]:
    result = await build_plan_chain(effort).ainvoke(
        {
            "company": settings.company,
            "role": wrap("role", settings.role),
            "difficulty": PLAN_DIFFICULTY[settings.difficulty],
            "question_count": settings.question_count,
            "documents": format_documents(profile, job_description),
        }
    )
    planned = priced(result, "plan")
    plan: InterviewPlan = planned.value
    # the schema allows 3-8 questions, the exact count is only asked for in the prompt
    if len(plan.questions) != settings.question_count:
        logger.warning(
            "plan has %d questions, asked for %d",
            len(plan.questions),
            settings.question_count,
        )
    planned.value = plan.model_copy(
        update={"questions": plan.questions[: settings.question_count]}
    )
    return planned
