# Interview Practice

Practise a job interview with an AI interviewer who has read your CV.

Pick a parody company (Guugle, Netflux, Goldman Sax, …) and a role, then upload your CV or use a preset. A 3D interviewer asks questions tailored to you. You answer by typing or speaking, and it follows up on vague answers and pushes back on wrong claims. At the end you get a scored report: feedback per question, strengths, what to improve, and a sample answer for your weakest question.

Everything runs on your machine except the language models, which are called through [OpenRouter](https://openrouter.ai). Your voice is transcribed locally, and your CV is read in memory and never stored.

## Quick start

You need [Docker](https://www.docker.com/) with about 4 GB of memory, and an OpenRouter API key with access to `openai/gpt-5-mini` and `typesafe/jev-1.13` (and `google/gemini-3.8-flash-lite-tts` for the optional cloud voice).

```bash
cp .env.example .env          # then set OPENROUTER_API_KEY
docker compose up --build     # the first build downloads the speech models (~1 GB)
```

Open **http://localhost:3000**.

- **Developer panel:** gear icon, or `?dev=1`. Model, reasoning effort, max tokens, prompt technique, the full system prompt, cost per call and the guard log.
- **Benchmarks:** http://localhost:3000/benchmarks shows the eval results as charts.
- **Cloud voice:** on the setup page. Off (the default) is a free local voice; on uses Gemini TTS through OpenRouter (~$0.03 per interview).

Without Docker, for development:

```bash
cd backend && uv sync && uv run uvicorn backend.main:app --reload --port 8000
cd frontend && npm install && npm run dev
docker compose up headtts                         # the local voice, port 8882
cd backend && uv run pytest                       # tests use fake LLMs, no API calls
```

## What's used

| Part | Tools |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Zustand |
| 3D avatar | [TalkingHead](https://github.com/met4citizen/TalkingHead) (three.js) with lip-sync from [HeadAudio](https://github.com/met4citizen/HeadAudio) |
| Backend | Python 3.14, FastAPI, LangChain, Pydantic, `uv` |
| Language model | `openai/gpt-5-mini` via OpenRouter (dev panel: also `gpt-5-nano`) |
| Guard and scoring | `typesafe/jev-1.13`, a decision model that returns calibrated probabilities |
| Speech-to-text | NVIDIA Parakeet TDT 0.6B v2, on the CPU, in the backend |
| Text-to-speech | [HeadTTS](https://github.com/met4citizen/HeadTTS) (Kokoro, local) or Gemini 3.8 Flash Lite TTS |
| Delivery | Docker Compose: frontend, backend, local voice |

## Contents

| Doc | What's in it |
|---|---|
| [Architecture](docs/architecture.md) | The pieces, one interview from start to end, how the CV, plan and scoring work, one turn in detail, the security layers |
| [Text-to-speech](docs/decisions/text-to-speech.md) | Why a local voice by default, Gemini as an option, and not `gpt-audio` |
| [Speech-to-text](docs/decisions/speech-to-text.md) | Why Parakeet: 2.3% word errors on a real accented voice, 0.3 s per answer |
| [Challenge signal](docs/decisions/challenge-signal.md) | How the interviewer pushes back on wrong claims and contradictions |
| [Interviewer evals](docs/evals/interviewer.md) | 5 prompt techniques, model and reasoning effort, open-weight models running locally |
| [Feedback evals](docs/evals/feedback.md) | Prompt technique, effort and local models for the feedback report, and where it still fails |
| [Jailbreak tests](docs/evals/jailbreak.md) | 37 attacks + 8 legit controls, 5 runs each, and the [Excel sheet](docs/evals/jailbreak-tests.xlsx) |

## Known limits

- **The sample answer can invent details** when the weakest answer was vague (9–10 of 10 runs). The results page says to treat it as a template ([feedback evals](docs/evals/feedback.md)).
- **Tested in Chrome and Safari.** Firefox is untested.
- **Speech-to-text was tested on one speaker** with a German accent.
- **Raising reasoning effort** in the dev panel can cut a reply short (2 of 72 replies at `medium`).
- **Runs locally only.** It isn't built for deployment: there's no login, and limits are kept in memory.

## Credits

- [TalkingHead](https://github.com/met4citizen/TalkingHead), [HeadTTS](https://github.com/met4citizen/HeadTTS) and [HeadAudio](https://github.com/met4citizen/HeadAudio) by Mika Suominen, MIT. `frontend/lib/retargeter.mjs` is vendored from TalkingHead.
- Avatars from the TalkingHead repo, both **non-commercial use only**:
  - `brunette.glb`: Ready Player Me, [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)
  - `avatarsdk.glb`: Avatar SDK MetaPerson
- [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) voices, Apache 2.0.
- [Parakeet TDT 0.6B v2](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v2) by NVIDIA, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), run with [onnx-asr](https://github.com/istupakov/onnx-asr).
- The companies are parodies: pun names only, no real logos.
