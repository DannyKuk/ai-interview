# Feedback evals

> **Answer:** the feedback report uses **one zero-shot prompt** on gpt-5-mini at reasoning effort **`low`**.
> - **It's honest where it matters most:** no made-up praise for a nonsense interview (0 of 3 runs), and no invented story when the candidate had none (0 of 15).
> - **One known limit:** when an answer was *vague*, the sample answer fills in specifics the candidate never said (9–10 of 10 runs). No prompt technique, rewrite or higher effort fixed that, so the results page tells the candidate to treat the sample answer as a template.

## What the feedback is

After the interview, one LLM call fills a large strict schema:
- feedback for each question
- strengths
- improvements
- a **sample answer** for the weakest question, rewritten "as the candidate"

The scores themselves come from Jev (one yes/no probability per rubric criterion), not from the LLM. The LLM only writes the text.

## How we measure

- **4 frozen interviews** (`backend/evals/feedback_interviews.json`): the same candidate (Lukas, a head baker becoming a developer), 8 questions, simulated once.
  - **strong:** full stories
  - **weak:** vague answers
  - **no example:** "I haven't done that yet"
  - **nonsense**
- **Same input for every prompt:** Jev scores each interview once, so every prompt gets the same scores and the same weakest question. Only the prompt changes.
- **Counted by hand:** does the weak interview's sample answer state a bug or fix the candidate never said? Does the nonsense interview get made-up strengths? An LLM judge was tried first and couldn't tell a `[placeholder]` from an invented detail.

The failure, in one example:

> **Lukas said:** "I ran into a problem getting the app to handle user input correctly … I figured it out by re-reading the docs, trying a few different approaches, and asking for help."
>
> **Sample answer:** "Form values for ingredient quantities were being saved as empty strings, causing incorrect inventory counts. I added explicit type conversion and server-side validation …"

A candidate who practises that story can't answer the first follow-up question in a real interview.

## 1. Does the prompting technique matter?

Round 1 tested the app's prompt plus 4 techniques built on it. Round 2 tested a rewrite following OpenAI's GPT-5 prompting guide, with the 4 techniques rebuilt on it. Weak interview: 10 runs; nonsense: 3.

| Technique | Invented details (weak) round 1 → 2 ↓ | Made-up praise (nonsense) round 1 → 2 ↓ | Median s, round 2 |
|---|---|---|---|
| **zero-shot (the app)** | 10/10 → 9/10 | **0/3** → 2/3 | 10.8 |
| few-shot | 10/10 → 10/10 | 1/3 → 1/3 | 12.6 |
| persona | 10/10 → 10/10 | 1/3 → 2/3 | 10.4 |
| chain-of-thought | 8/10 → **5/10** | 1/3 → 0/3 | 13.4 |
| self-critique | **5/10** → 6/10 | 2/3 → 0/3 | 14.2 |

**What it shows**
- **The technique matters more here than for the [interviewer](interviewer.md)** (0 to 5 clean runs out of 10), but **none fixes it.** The best technique still invents in half the runs.
- **Why:** the `analysis` field correctly decides "no details given → use placeholders". Then the same output tells the candidate three times to "name the exact bug and the concrete fix", and the sample answer (the last field) follows that latest advice. Within one call, no wording beat it.
- **Few-shot copied the shape of its first example** ("My goal was …"), not the placeholders of the second. An example that bends your own rule teaches the bend.
- **The rewrite was faster and cheaper but brought made-up praise back** (2 of 3). So the app keeps the original zero-shot prompt.
- **Why not round 2's chain-of-thought** (5 of 10, no made-up praise)? It still invents in half the runs, on only one tested vague interview. The cause above needs a structural fix, not another technique.

**Decided along the way**
- **No story → no invented story.** The prompt was given an honest route for this case: "I haven't … yet", then the closest real fact, then the steps as "I would …". It took invented stories from 3 of 3 to 0 of 3, and later 15 of 15 runs stayed honest.
- **A second self-critique call** (list invented details, then fix them) fixed 1 of 3 and once returned the answer unchanged after listing 4 problems. The code was dropped; the interviewer's prompts still cover self-critique.
- **The results page explains the sample answer:** "Use it as a template: fill in the [brackets] and change any detail that isn't yours. An interviewer will ask about it."
- **The five techniques the brief asks for are compared on the interviewer.** The feedback variants were an experiment and are kept only as files (see Reproduce).

## 2. Which reasoning effort?

| Effort | Invented details (weak) ↓ | Broken output | Median s |
|---|---|---|---|
| `minimal` | 2/2 | **1 of 4 runs** returned "placeholder" as the feedback, with no error | 9.2 |
| **`low` (the app)** | 10/10 | 0 | 13.4–14.7 |
| `medium` | 9/10 | 0 | 26.5 (max 36) |

**What it shows:** `minimal` (zero reasoning tokens) can fail silently on a schema this big. `medium` doubles the wait without fixing the invented details. `low` stays.

## 3. Could a local model write it?

The three best local [interviewers](interviewer.md#3-could-a-local-model-do-it), on a 24 GB graphics card, with thinking on. Weak × 10 and nonsense × 3.

| | gpt-5-mini (the app) | Gemma 4 31B | Qwen 3.8 27B | gpt-oss-20b |
|---|---|---|---|---|
| Valid feedback | 13/13 | 13/13 | 12/13 | 13/13 |
| Invented details (weak) ↓ | 10/10 | **1/10** | 4/9 | 9/10 |
| … with a made-up percentage | 0 | 0 | 0 | **5/10** |
| Strengths for the weak interview | 2–3 | 3 | 2–3 | **0** |
| Made-up praise (nonsense) | 0/3 | 0/3 | 0/3 | 0/3 |
| Time per feedback (median) | 14.7 s | ~138 s | ~80 s | **6.5 s** |

**What it shows**
- **Gemma and Qwen are more honest than gpt-5-mini:** they keep `[placeholders]` as the prompt asks. But the candidate would wait 1.3–2.3 minutes.
- **gpt-oss-20b is the best local interviewer and the worst feedback writer.** It's fast, but it gives no strengths and invents results as percentages ("errors dropped from 12% to 0%").
- **More thinking isn't the whole story:** gpt-5-mini at `medium` thinks as much as Gemma and still invents. How literally a model follows the placeholder rule differs by model.
- A local setup would need two models: a fast one to talk, a careful one to write the feedback.

## Limits

- One candidate, one weak answer type, counted by hand by one reader.
- Not fixed: writing the sample answer *before* the advice, or in its own call that sees only the question and the candidate's answers (~$0.001 more). Both are the next thing to try.
- Qwen sometimes thinks until its token limit and returns nothing (1 of 10 runs).

## Reproduce

```bash
cd backend
uv run python evals/compare_feedback.py                                   # the app's prompt, all 4 interviews
uv run python evals/compare_feedback.py --interviews weak nonsense \
    --prompts src/backend/prompts/feedback.md ../docs/spikes/feedback-prompts/round1/*.md   # round 1
uv run python evals/compare_feedback.py --interviews weak nonsense \
    --prompts ../docs/spikes/feedback-prompts/round2/*.md                                   # round 2
uv run python evals/compare_feedback.py --effort medium --interviews weak                   # effort
uv run python evals/compare_feedback.py --local http://localhost:1234/v1 \
    --model qwen/qwen3.8-27b --effort low --interviews weak nonsense                        # a local model
```

Each run writes its rows to `backend/evals/out/feedback_<time>.json` (git-ignored). The `minimal` check is `docs/spikes/effort/effort.py feedback`. Round 1 + 2 together cost ~$0.85.
