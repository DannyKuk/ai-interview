# Interviewer evals

> **Answer:** the interviewer runs on **gpt-5-mini** with the **zero-shot** prompt, reasoning effort **`minimal`** and max tokens 1000.
> - **The technique barely matters:** all five prompts score 0.92–0.94.
> - **The turn notes matter most:** fixing the notes shared by every prompt lifted all five from 0.83 to 0.93.
> - **`minimal` effort** is as good as `low` at half the wait.
> - **A local model on a 24 GB graphics card** could do this job too.

## How we measure

One harness (`backend/evals/compare_prompts.py`) answers all three questions:

- **Fixed snapshots, not a simulated candidate.** A snapshot is a short conversation that stops right after the candidate's answer. Each model or prompt writes the next interviewer reply to the same 9 snapshots, so differences come only from what we changed.
- **The snapshots:**
  - an opening
  - a strong answer
  - a vague answer
  - "ChatGPT wrote most of it"
  - an off-topic answer
  - the candidate asking a question back
  - three hard cases: a wrong claim, buzzwords, a contradiction
- **The app's real turn code** (guard → turn note → prompt → model), so the eval tests what ships.
- **Checks in code:** exactly one question, no markdown, no shown reasoning, no canary leak, not empty or cut off, latency, cost.
- **Jev as the judge.** For each reply it gives a calibrated probability for four yes/no questions:
  - Does it do what a good reply should?
  - Does it pile up 3+ asks?
  - Does it praise a weak answer?
  - Does it invent facts about the company?

  Jev isn't a GPT model grading its own kind of text, and its probabilities can be averaged over runs. A hand check of 10 replies agreed 8 times; both misses were the same case in every prompt.

## 1. Which prompt technique?

Five system prompts (`backend/src/backend/prompts/interviewer/`). Each shares the same plan, security and canary parts:
- **zero-shot:** plain instructions
- **few-shot:** the same plus example exchanges
- **chain-of-thought:** silent reasoning steps before each reply
- **persona:** a named interviewer with a backstory
- **self-critique:** silent draft → check → rewrite

Final run at the shipped settings: 5 techniques × 9 snapshots × 3 runs = 135 replies, $0.045.

| | zero-shot | few-shot | CoT | persona | self-critique |
|---|---|---|---|---|---|
| Quality (Jev `good_reply`) ↑ | 0.93 | 0.92 | 0.93 | 0.92 | **0.94** |
| Exactly one question | 26/27 | 26/27 | 25/27 | 24/27 | **27/27** |
| Praises a weak answer ↓ | **0.05** | 0.39 | 0.39 | 0.28 | 0.43 |
| Invents company facts ↓ | 0.03 | 0.03 | 0.04 | 0.03 | 0.05 |
| Hard cases (wrong claim / buzzwords / contradiction) | 0.94 / 0.94 / 0.98 | 0.90 / 0.92 / 0.98 | 0.93 / 0.95 / 0.98 | 0.88 / 0.94 / 0.97 | 0.89 / 0.95 / 0.98 |
| Seconds (median) | **1.2** | **1.2** | 1.4 | 1.3 | 1.3 |
| Cost per 27 replies | **$0.0082** | $0.0098 | $0.0092 | $0.0090 | $0.0091 |

**What it shows**
- **Quality is a tie.** Every turn, a note tells the model exactly what to do (ask question 2, follow up, steer back), and gpt-5-mini already reasons before answering. Extra reasoning or examples in the prompt add little on top.
- **Zero-shot is the only one that follows "no thanks or praise".** The other four often say "I appreciate the honesty" to "ChatGPT wrote most of it". Zero-shot did this once in 12 replies across two runs.
- **Persona fits a voice interview worst:** it was the slowest and costliest in the first round, and it once gave itself two different names.

**Decided along the way**
- **The first round scored 0.83 for every technique**, because of two problems shared by all five. Both were fixed in the shared turn notes, not by picking a technique:
  - **Inventing the team:** when asked "what does the team work on?", 15 of 15 replies made up a tech stack. Telling the model "don't make things up" made it *say* that out loud ("I can't invent details about Netflux"). Giving it something to *do* instead worked: "say that today you'd like to focus on them", 0 of 15.
  - **Thanking weak answers:** a "no praise" rule alone turned the follow-ups into questionnaires (22 of 30 piled up 3+ asks). The kept wording, "react in a few neutral words, then ask one short question about one thing", gave 1 of 30.
- Lesson from both: when you take something out of a reply, say what goes in its place.

## 2. Which model and reasoning effort?

zero-shot × gpt-5-mini / gpt-5-nano × effort `minimal` / `low` / `medium` × max tokens 500 / 1000. 6 snapshots × 3 runs = 216 replies, $0.074. Rows at max tokens 1000:

| Model | Effort | Quality ↑ | Median s | Cost / 18 replies | Empty / cut off |
|---|---|---|---|---|---|
| **mini** | **minimal** | **0.93** | **1.3** | **$0.0052** | 0 / 0 |
| mini | low | 0.93 | 2.4 | $0.0085 | 0 / 0 |
| mini | medium | 0.93 | 4.3 | $0.0158 | 0 / 0 |
| nano | minimal | 0.92 | 1.2 | $0.0010 | 0 / 0 |
| nano | low | 0.92 | 3.4 | $0.0022 | 0 / 0 |
| nano | medium | 0.88 | 8.8 | $0.0058 | 1 / 2 |

**What it shows**
- **Effort is the big lever, and `minimal` is enough to talk.** It scores the same as `low` and reads the same, but is ~1 s faster per turn and 39% cheaper. The turn note already says what to do, so there's little left to reason about.
- **`medium` buys nothing:** the same score at twice the time.
- **Max tokens includes the reasoning.** At 500, nano `medium` left 16 of 18 replies empty.
- **nano is 5× cheaper at `minimal`, but sloppier** in ways Jev doesn't ask about: it said "Interesting." in reply to "ChatGPT wrote most of it".

**Decided along the way**
- **Temperature and top-p** aren't offered: OpenRouter doesn't support them for gpt-5-mini or nano. Reasoning effort replaces them.
- **Effort is set per call, not once for the app.** `minimal` means zero reasoning tokens. That's fine for talking, but not for working something out:

| Call | Effort | Why (`minimal` vs `low`, same inputs) |
|---|---|---|
| Interviewer turn | `minimal` | same quality, half the wait |
| CV profile | `low` | `minimal` counted experience 1–3 years short on 11 of 12 CVs ("2018 – present" → 6), so a 10-year head baker came out junior |
| Interview plan | `low` | `minimal` looked fine in 6 runs, too few to trust with the scoring rubric |
| Feedback | `low` | `minimal` returned "placeholder" as the feedback in 1 of 4 runs, with no error |

## 3. Could a local model do it?

The same 9 snapshots, run against open-weight models in LM Studio on a desktop PC (Radeon RX 7900 XTX, 24 GB). This was an eval only; the app isn't changed. Each local model's thinking was switched off; gpt-oss can only go down to `low`. 27 replies per model.

| Model | Quality ↑ | Praises weak answers ↓ | Contradiction ↑ | First words | Full reply |
|---|---|---|---|---|---|
| **gpt-5-mini** (cloud, the app) | 0.93 | 0.05 | 0.98 | 0.8 s | 1.2 s |
| **gpt-oss-20b** | 0.91 | 0.07 | 0.97 | **0.5 s** | 0.7 s |
| **Qwen 3.8 27B** | 0.93 | 0.17 | 0.94 | 1.6 s | 2.5 s |
| Gemma 4 31B | 0.93 | **0.04** | 0.98 | 2.4 s | 3.3 s |
| GLM 4.7 Flash | 0.86 | 0.38 | **0.66** | **0.3 s** | 0.7 s |
| Bonsai 27B (1-bit) | 0.87 | 0.09 | 0.98 | 2.3 s | 3.8 s |
| gpt-oss-120b (partly in system RAM) | **0.94** | 0.08 | 0.97 | 6.6 s | 7.7 s |

**What it shows**
- **Yes, two good options:**
  - **Qwen 3.8 27B** matches the quality, with ~1 s more wait.
  - **gpt-oss-20b** is a little lower in quality and starts *faster* than the cloud.
- **The fastest isn't the best:** GLM praised 3 of 6 weak answers and let a contradiction pass.
- **Bigger barely helps:** the 120b scores +0.03 for 10× the wait.

**Decided along the way**
- **The load settings mattered more than the model.** LM Studio's defaults made Qwen 5× slower (7.8 s instead of 1.6 s to first words). On Gemma, Windows silently moved part of the model into system RAM. The fix was Flash Attention on and *Shared GPU memory* at 0.
- **Local chat templates reject a system message mid-conversation**, so the turn note is sent as a user message instead (same text, same position).
- **The app stays on gpt-5-mini.** The brief asks for an OpenRouter model, and the CV and plan calls weren't tested locally. For the feedback report, no local model wins (see [feedback evals](feedback.md)).

## Limits

- One fixed interview (a baker changing careers), 3 runs per case: good for clear differences, not for ranking models 0.01 apart.
- Jev only answers the questions we ask. Tone slips and false promises were found by reading the replies.
- Local speeds are one PC with these settings.

## Reproduce

```bash
cd backend
uv run python evals/compare_prompts.py                          # 1: all techniques at the app's settings
uv run python evals/compare_prompts.py --techniques zero_shot \
    --models openai/gpt-5-mini openai/gpt-5-nano \
    --efforts minimal low medium --max-tokens 500 1000           # 2: model × effort × max tokens
uv run python evals/compare_prompts.py --techniques zero_shot \
    --local http://localhost:1234/v1 --models qwen/qwen3.8-27b --efforts none   # 3: one local model
```

Replies and Jev scores go to `backend/evals/out/replies_<time>.json` (git-ignored). The per-call effort check is `docs/spikes/effort/effort.py`.
