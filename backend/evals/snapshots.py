"""Fixed interview snapshots for the prompt comparison.

A snapshot is a conversation that stops right after the candidate's answer. Every
interviewer prompt gets exactly the same one and writes the next reply, so the
differences between the replies come from the prompt alone. `good_reply` says what a
good next reply does.

"""

from dataclasses import dataclass, field

from backend.schemas.chat import ChatMessage, InterviewSettings
from backend.schemas.plan import InterviewPlan, PlanProgress

SETTINGS = InterviewSettings(
    company="Netflux", role="Junior Software Developer", question_count=3
)
# the hard cases: "push back on weak answers" is in the hard difficulty line
HARD = SETTINGS.model_copy(update={"difficulty": "hard"})

# inline, not from scripts/out/ (git-ignored)
PLAN = InterviewPlan.model_validate(
    {
        "approach": (
            "Career changer: focus on transferable skills, recent Flask project and "
            "readiness for junior Python fintech role."
        ),
        "questions": [
            {
                "type": "motivation",
                "topic": "career transition to software development",
                "question": (
                    "Why do you want to move from head baker to junior software "
                    "developer, and what kept you motivated during self-study?"
                ),
                "why": (
                    "Assesses genuine motivation for career change and persistence "
                    "learning software."
                ),
                "rubric": [
                    "Explains clear reasons for switching to software",
                    "Describes specific learning activities sustained over time",
                    "Links past responsibilities to software career motivation",
                ],
            },
            {
                "type": "technical",
                "topic": "Bakery stock tracker (Flask)",
                "question": (
                    "What specific problem did your bakery stock tracker web app solve "
                    "and what was your role in building and deploying it?"
                ),
                "why": (
                    "Connects the candidate's Flask project to the job's Python "
                    "service work and deployment experience requirement."
                ),
                "rubric": [
                    "Describes the precise problem the app addressed",
                    "States their personal responsibilities in the project",
                    "Names at least one technology or deployment step used",
                ],
            },
            {
                "type": "behavioural",
                "topic": "teamwork, code review and testing",
                "question": (
                    "How would you approach reviewing a teammate's Python pull request "
                    "that touches payment-related code, given limited experience?"
                ),
                "why": (
                    "Evaluates collaboration, caution with fintech-sensitive code, and "
                    "awareness of testing/Git practices."
                ),
                "rubric": [
                    "Explains steps they'd take when reviewing a PR",
                    "Mentions running or requesting tests and checking edge cases",
                    "Acknowledges when to ask senior help or escalate concerns",
                ],
            },
        ],
    }
)


@dataclass(frozen=True)
class Snapshot:
    name: str
    messages: list[ChatMessage]
    progress: PlanProgress | None  # None = the interview starts
    good_reply: str
    settings: InterviewSettings = field(default_factory=lambda: SETTINGS)

    def __post_init__(self):
        if self.messages and self.messages[-1].role != "user":
            raise ValueError(f"{self.name}: must end with the candidate's answer")
        if (self.progress is None) != (not self.messages):
            raise ValueError(f"{self.name}: progress None only for the opening")
        if self.progress and self.progress.question >= len(PLAN.questions):
            raise ValueError(f"{self.name}: question past the plan")


def interviewer(text: str) -> ChatMessage:
    return ChatMessage(role="assistant", content=text)


def candidate(text: str) -> ChatMessage:
    return ChatMessage(role="user", content=text)


# the conversation up to each planned question, shared by the snapshots below
Q1 = interviewer(
    "Hi, and welcome to Netflux! Thanks for taking the time today. Let's start with "
    "your story: why do you want to move from head baker to junior software "
    "developer, and what kept you motivated during self-study?"
)
A1 = candidate(
    "At the bakery I kept running into the same problem: we never knew how much "
    "flour and butter we had, so we over-ordered. I taught myself Python with the "
    "University of Michigan course, about ten hours a week for eight months, and "
    "built a small Flask app to track our stock. Seeing people use something I built "
    "is what kept me going."
)
Q2 = interviewer(
    "That's a clear reason, and a real problem to solve. Let's talk about that app: "
    "what specific problem did your bakery stock tracker solve, and what was your "
    "role in building and deploying it?"
)
A2 = candidate(
    "It replaced our paper stock list. I built all of it myself: a Flask backend with "
    "SQLite, a simple form for the morning counts, and I deployed it on a Raspberry "
    "Pi in the back office. Flour waste went down by about 18% in three months."
)
Q3 = interviewer(
    "Thanks, that's concrete. Last question: how would you approach reviewing a "
    "teammate's Python pull request that touches payment-related code, given your "
    "limited experience?"
)

SNAPSHOTS = [
    Snapshot(
        name="opening",
        messages=[],
        progress=None,
        good_reply=(
            "Greets the candidate briefly and asks the first planned question: why "
            "they want to move from head baker to software development"
        ),
    ),
    Snapshot(
        name="strong",
        messages=[Q1, A1],
        progress=PlanProgress(question=0),
        good_reply=(
            "Acknowledges the answer in a few words, then asks one follow-up that goes "
            "deeper into what the candidate said, or moves on to the next planned "
            "question about the bakery stock tracker"
        ),
    ),
    Snapshot(
        name="vague",
        messages=[
            Q1,
            A1,
            Q2,
            candidate("I built some app for the bakery, it was fine."),
        ],
        progress=PlanProgress(question=1),
        good_reply=(
            "Asks for specifics about the stock tracker: what problem it solved or "
            "what the candidate built or deployed themselves"
        ),
    ),
    Snapshot(
        name="dont_know",
        messages=[
            Q1,
            A1,
            Q2,
            candidate(
                "Honestly, ChatGPT wrote most of it. I don't really know how it works."
            ),
        ],
        progress=PlanProgress(question=1),
        # not "doesn't praise it": the judge's praises_miss asks that for every reply
        good_reply=(
            "Stays friendly and asks what the candidate did or understood themselves, "
            "or moves on"
        ),
    ),
    Snapshot(
        name="off_topic",
        messages=[
            Q1,
            A1,
            Q2,
            A2,
            Q3,
            candidate(
                "Speaking of payments, I paid way too much for my car repair this week."
            ),
        ],
        progress=PlanProgress(question=2),
        good_reply=(
            "Steers back politely to how the candidate would review a payment-related "
            "pull request, without going into the car repair"
        ),
    ),
    # the interview has no Q&A at the end: deferring "to the end" would be a false
    # promise, and answering made up the team (all 5 prompts, Sep 30)
    Snapshot(
        name="candidate_question",
        messages=[
            Q1,
            candidate(
                "Before I answer: what does the team actually work on at Netflux?"
            ),
        ],
        progress=PlanProgress(question=0),
        good_reply=(
            "Doesn't answer with details about the team, politely keeps the focus on "
            "the candidate instead, then comes back to why they want to move into "
            "software development"
        ),
    ),
    # the hard cases (Sep 30, after the settings experiment): each needs a step of
    # thinking about the content, which effort minimal might skip
    Snapshot(
        name="wrong_claim",
        messages=[
            Q1,
            A1,
            Q2,
            candidate(
                "It replaced our paper stock list. I built it in Flask with SQLite, and "
                "because SQLite handles any number of simultaneous writes without "
                "locking, all five bakers could save their counts at the same time, so "
                "I never had to think about concurrency."
            ),
        ],
        progress=PlanProgress(question=1),
        good_reply=(
            "Questions or corrects the claim that SQLite handles any number of "
            "simultaneous writes without locking, for example asks how they handled "
            "write locking, instead of accepting it"
        ),
        settings=HARD,
    ),
    Snapshot(
        name="buzzwords",
        messages=[
            Q1,
            A1,
            Q2,
            candidate(
                "I leveraged a cloud-native microservices architecture with Kubernetes "
                "and AI to create a scalable, data-driven synergy for the bakery's stock."
            ),
        ],
        progress=PlanProgress(question=1),
        good_reply=(
            "Asks what the candidate concretely built themselves, or why one bakery's "
            "stock list needed microservices, Kubernetes or AI, instead of accepting "
            "the buzzwords"
        ),
        settings=HARD,
    ),
    Snapshot(
        name="contradiction",
        messages=[
            Q1,
            A1,
            Q2,
            candidate(
                "Honestly, I've never written any Python myself. A friend built the "
                "whole tracker, I only used it at the bakery."
            ),
        ],
        progress=PlanProgress(question=1),
        good_reply=(
            "Notices that this contradicts the candidate's earlier answer that they "
            "taught themselves Python and built the Flask app, and asks about it"
        ),
        settings=HARD,
    ),
]
