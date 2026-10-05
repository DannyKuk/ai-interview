import re

# tech words the STT model mishears -> what the candidate said. Only mishearings we
# actually saw (STT spike, docs/decisions/speech-to-text.md; Vue and Pinia: the demo
# answers in docs/demo.md, read by HeadTTS)
# Never map a correct word ("Postgres" alone is a real name, it stays)
FIXES = {
    "postgresl": "PostgreSQL",
    "postgreskel": "PostgreSQL",
    "postgrescle": "PostgreSQL",
    "poscreskel": "PostgreSQL",
    "cube earnings": "Kubernetes",
    "q burnings": "Kubernetes",
    "add in potency": "idempotency",
    "adem potency": "idempotency",
    "to raphform": "Terraform",
    # Vue is said "view": only with its version, "view" alone is a real word
    "view 2": "Vue 2",
    "view 3": "Vue 3",
    "view3": "Vue 3",
    "penia": "Pinia",
    "pinea": "Pinia",
    "peniastores": "Pinia stores",
}

# whole words only, any case: "Postgresl," and "postgresl" both match
PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(heard) for heard in FIXES) + r")\b", re.IGNORECASE
)


def fix_transcript(text: str) -> str:
    return PATTERN.sub(lambda match: FIXES[match.group(1).lower()], text)
