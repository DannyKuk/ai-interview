# Sentences that replace {difficulty} and {persona} in the interviewer prompts.
# One clear instruction per level works better than a bare word like "hard".

DIFFICULTY = {
    "easy": (
        "Ask foundational questions."
        "If the candidate gets stuck, help with a small hint."
    ),
    "medium": (
        "Ask typical interview questions and one follow-up when an answer stays vague."
    ),
    "hard": (
        "Ask in-depth questions, probe edge cases and trade-offs, and push back on weak answers."
    ),
}

PERSONA = {
    "friendly": "Warm and encouraging.",
    "neutral": "Professional and matter-of-fact.",
    "strict": "Formal and demanding. Short sentences, no small talk.",
}
