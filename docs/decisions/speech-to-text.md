# Speech-to-text

> **Answer:** **NVIDIA Parakeet TDT 0.6B v2** (int8, via `onnx-asr`) runs on the CPU inside the Python backend. It made the fewest errors on a real accented voice and turns a 15 s answer into text in ~0.3 s. The candidate's voice never leaves the machine.

## Question

The candidate can answer by voice. That audio has to become text that is:
- **local**: no cloud STT, and no browser Web Speech API (Chrome sends the audio to Google);
- **accurate** on tech answers: product names, numbers, a non-native accent;
- **fast** once they stop talking, since the interviewer's reply already takes ~2 s;
- **a transcript, never an answer**, so a spoken prompt injection reaches the guard as text.

It also has to run on the CPU in Docker, because Docker on macOS has no GPU.

## What we tried

- Three model families, all on the CPU of an Apple M4 Pro (4 threads, int8):
  - **faster-whisper** (tiny.en → large-v3-turbo)
  - **Moonshine** (base, small- and medium-streaming)
  - **Parakeet TDT 0.6B v2**
- Two test sets:
  - **16 synthetic clips** (HeadTTS voices): tech terms, numbers, a spoken injection
  - **one real recording** (15 s, the developer's voice, German accent)
- Score: word error rate (WER), after Whisper's English normalizer ("forty" = "40").

## Result

| Model | Size | WER synthetic | WER real voice | 15 s answer takes |
|---|---|---|---|---|
| **Parakeet TDT 0.6B v2** | 631 MB | **0.6%** | **2.3%** | **0.30 s** |
| whisper small.en | 464 MB | 1.7% | 4.7% | 1.11 s |
| whisper large-v3-turbo | 1.5 GB | 0.8% | 4.7% | 4.41 s |
| Moonshine medium-streaming | ~265 MB | 1.7% | 7.0% | 0.70 s |
| Moonshine base | ~135 MB | 6.2% | 18.6% | 0.27 s |
| whisper base.en | – | 1.7% | 30.2% | 0.37 s |
| whisper tiny.en | – | 5.1% | 27.9% | 0.18 s |

## What it shows

- **Synthetic speech flatters small models.** whisper base.en scored 1.7% on clean TTS voices and collapsed to 30% on the real one ("Soft Engineering Robler … since 10.23"). Without a real recording we would have picked wrong.
- **Parakeet is best on both sets and among the fastest**, so it doesn't need streaming: the text is there almost as soon as the candidate stops.
- **Every model wrote the spoken injection down word for word.** These are plain STT models that can't "answer", unlike `gpt-audio-mini` (see [text-to-speech](text-to-speech.md)).
- **"PostgreSQL" fooled every model.** Parakeet still got Kubernetes, Terraform, Redis and Kafka right; Whisper heard "q burnings".

## Decided along the way

- **CPU, not GPU.** Docker on macOS has no GPU, and Apple's CoreML supports under half of the model and used +43 GB of RAM while compiling. On the CPU it's 0.3 s for 15 s of audio, 1.4 s for 60 s, and 0.4 s in Docker.
- **In the backend, not a separate service.** `onnx-asr` is a light Python library (no PyTorch), so it shares the backend's rate limit, tests and in-memory-only rule.
- **Tech-word fixes:** a small list of real mishearings ("postgresl" → "PostgreSQL") runs after STT, and a "Review before sending" switch lets the candidate correct the text first.
- **Silence:** clips under 0.25 s, or with nothing louder than −40 dBFS, count as "nothing said". On hiss the model invents "Yeah." / "Mm-hmm.".
- **v2, not v3 (rechecked later).** On 3 new recordings, v3 was slightly better on a tight cut (3.8% vs 4.8% WER). But it got worse with every second of room noise after the speech, and with 6–9 s of noise it dropped a whole clause. v2 gave the same text at every tail length. A candidate always clicks stop a moment late, so v2 stays.

## Limits

- One speaker, one accent, few recordings. Other voices, mics and noisy rooms are untested.
- The loaded model holds ~1.7–1.9 GB of RAM, so the whole stack wants ~3–4 GB for Docker.
- English only (fine: the app is English only). Answers are capped at 3 minutes (~5.5 s to transcribe).

## Reproduce

```bash
cd docs/spikes/stt && uv sync                # Python 3.12 env with all three model families
docker compose up -d headtts                 # gen_clips.py makes the synthetic clips with it
uv run python gen_clips.py                   # → clips/*.wav (git-ignored)
uv run python bench.py                       # every model on the synthetic clips
uv run python bench.py parakeet parakeet:v3  # v2 vs v3
uv run python bench.py --real                # your own recordings in real/*.wav, texts in real.json
uv run python mem.py parakeet-lean           # RAM after load (reads real/answer1.wav)
```

Record a real clip on macOS: `ffmpeg -f avfoundation -i ":0" -ar 16000 -ac 1 -t 20 real/answer1.wav`.
