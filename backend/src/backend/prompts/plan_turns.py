from dataclasses import dataclass

from backend.config import settings
from backend.prompts.turn_hints import HINTS, HintName
from backend.schemas.chat import EndReason
from backend.schemas.guard import GuardVerdict
from backend.schemas.plan import MAX_EXTRA_TURNS, InterviewPlan, PlanProgress

# notes for the interviewer when there's a plan
FIRST = (
    "Greet the candidate, then ask question 1 of {total} in your own words: {question}"
)
NEXT = (
    "React to the answer in one short sentence, then ask question {number} of "
    "{total} in your own words: {question}"
)
FOLLOW_UP = (
    "The answer stayed vague. Don't move on yet: ask one specific follow-up about it, "
    "for example for a concrete example or what the candidate did themselves."
)
DONE = (
    "That was the last question. Thank the candidate, tell them the interview is "
    "over and that their feedback comes next. Don't ask another question."
)


@dataclass
class PlanTurn:
    progress: PlanProgress
    note: str
    hint: HintName | None = None
    ended: EndReason | None = None


def ask(plan: InterviewPlan, index: int, template: str) -> PlanTurn:
    planned = plan.questions[index]
    note = template.format(
        number=index + 1,
        total=len(plan.questions),
        question=f"{planned.question} (topic: {planned.topic})",
    )
    return PlanTurn(progress=PlanProgress(question=index), note=note)


def plan_turn(
        plan: InterviewPlan,
        progress: PlanProgress | None,
        verdict: GuardVerdict,
        hint: HintName | None,
) -> PlanTurn:
    # progress None = no candidate message yet
    if progress is None:
        return ask(plan, 0, FIRST)
    if hint == "end":
        return PlanTurn(progress, HINTS["end"], hint, ended="candidate_left")

    extra_turns = progress.extra_turns
    stay = progress.model_copy(update={"extra_turns": extra_turns + 1})

    # off-topic or dodged: steer back, but don't get stuck on one question
    if hint in ("off_topic", "not_answered") and extra_turns < MAX_EXTRA_TURNS:
        return PlanTurn(stay, HINTS[hint], hint)

    # one follow-up, and only if we haven't already spent a turn on this question
    vague = (verdict.vague or 0.0) >= settings.follow_up_threshold

    if vague and extra_turns == 0:
        return PlanTurn(stay, FOLLOW_UP)

    next_question = progress.question + 1
    if next_question >= len(plan.questions):
        return PlanTurn(progress, DONE, ended="completed")

    return ask(plan, next_question, NEXT)
