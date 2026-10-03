# Challenge signal: pushing back on wrong claims and contradictions

> **Answer:** in the same guard call as every turn, Jev also scores each answer for three things: a **wrong** technical claim, a claim it **can't verify**, and a **contradiction** with an earlier answer. A wrong claim (≥ 0.8) or a contradiction (≥ 0.5) makes the interviewer ask about it live, at every difficulty. A claim Jev can't verify is never held against the candidate. In the results, wrong claims and contradictions get a red badge, and a contradiction lowers that answer's score.

## Question

At first the interviewer never pushed back. In the [settings experiment](../evals/interviewer.md), it questioned a wrong claim in 1 of 10 replies, and even thanked the candidate for it. It never pointed out a contradiction (0 of 10). The cause was the turn design, not the model: the guard saw "answered", and the "move on" note beat the prompt's "push back" line.

The opposite mistake is worse: a candidate who says something **correct but new or niche** must never be told they're wrong.

## What we tried

- **Jev, case by case:** 28 hand-written answers, scored on three new Jev questions:
  - clearly wrong
  - correct but odd
  - correct but recent or niche (Python 3.14 free-threading, React 19 Actions, …)
  - personal numbers
  - contradictions, and near-misses that aren't contradictions
- **Threshold check:** later widened to 45 cases (16 wrong, 29 correct), 2 runs each.
- **Interviewer before and after:** the eval rerun on the hard snapshots, 5 replies each.
- **3 real interviews** in the browser.

## Result

**Can Jev tell them apart?** (probability, min–max per group)

| Group | wrong | can't verify | contradiction |
|---|---|---|---|
| clearly wrong (6) | **0.94–0.98** | 0.07–0.35 | 0.05–0.27 |
| correct but odd (4) | 0.03–0.09 | 0.05–0.12 | ≤ 0.06 |
| correct but recent / niche (6) | 0.20–0.72 | **0.57–0.87** | ≤ 0.08 |
| personal / normal (5) | 0.03–0.26 | 0.10–0.31 | ≤ 0.13 (buzzwords 0.82) |
| real contradictions (3) | 0.06–0.29 | ≤ 0.09 | **0.64–0.97** |
| not contradictions (4) | ≤ 0.05 | ≤ 0.17 | ≤ 0.09 |

**Does the interviewer push back now?**

| Snapshot | Before | After |
|---|---|---|
| wrong claim (SQLite takes any number of simultaneous writes) | questioned 0 / 5 | **5 / 5**, asks how SQLite handles concurrent writes, never says "wrong" |
| contradiction ("built it myself" → "a friend wrote it") | pointed out 0 / 5 | **5 / 5** |
| normal snapshots (strong, vague, off-topic, …) | – | no false challenges |

## What it shows

- **Wrong claims separate cleanly:** every wrong claim scored ≥ 0.80, every correct one ≤ 0.75 (45 cases, every run).
- **Jev knows what it doesn't know:** recent or niche claims score high on "can't verify" (≥ 0.57) and stay below the wrong threshold.
- **Contradictions separate too:** 0.64–0.97 against ≤ 0.13 for small corrections, changed opinions and new details. Claiming Kubernetes microservices after describing "a small Flask app" (the buzzwords case, 0.82) is a fair thing to ask about.
- **The old feedback punished correct-but-unknown claims:** its "technically correct" criterion gave a true OpenRouter TTS answer 1.8 / 5. Fixing that was part of this work.

## Decided along the way

- **Wrong-claim threshold 0.9 → 0.8:** in a real interview the guard gave a wrong claim 0.82 under another question. At 0.8 it catches 15–16 of 16 wrong claims and challenges 0 of 29 correct ones.
- **Ask, don't correct:** the interviewer asks the candidate to explain the claim and never says "that's wrong". Jev can't name the claim, and the claim may be right after all.
- **One extra turn per question** (a challenge *or* a follow-up). Without it, the candidate's clarification was flagged again and looped.
- **Can't verify (≥ 0.45, and not wrong):** the "technically correct" criterion is left out of that answer's score, and the feedback is told not to call it right or wrong.
- **Contradictions in the results get their own Jev call**, because adding the earlier answers to the scoring call made Jev credit the candidate for things said in *other* answers (e.g. STAR 0.10 → 0.94). The feedback wording was tuned until it named both statements in 3 of 3 runs (the first wording managed 0 of 3).

## Limits

- Contradictions with the **CV** aren't checked, only answer against answer ("five years at a bank" after a baker CV scores 0.15).
- Only technical claims count as wrong; personal numbers ("waste went down 18%") can't be checked by anyone.
- Hand-written cases from one author, and 3 real interviews.

## Reproduce

```bash
cd backend
uv run python ../docs/spikes/challenge/jev_claims.py              # the 28 cases, all three signals
uv run python ../docs/spikes/challenge/threshold_check.py --runs 2 # 45 cases, wrong-claim thresholds
uv run python ../docs/spikes/challenge/contradiction_scoring.py    # contradictions in the results
uv run python ../docs/spikes/challenge/contradiction_feedback.py   # feedback wording (LLM calls, ~$0.02)
```

Jev-only scripts cost well under a cent per run. `jev_claims.py` writes its raw results to `docs/spikes/challenge/out/` (git-ignored).
