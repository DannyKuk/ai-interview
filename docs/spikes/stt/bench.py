"""STT spike: local speech-to-text on CPU, same clips for every model.

    uv run python bench.py                 # all engines
    uv run python bench.py whisper:small.en moonshine:SMALL_STREAMING parakeet
    uv run python bench.py --live          # + real-time streaming test (Moonshine)
    uv run python bench.py parakeet:v3     # Parakeet v3 (multilingual); plain "parakeet" = v2

WER = word error rate over all clips, after Whisper's English normalizer (so
"forty" / "40" and "p95" / "P95" count as the same). "per clip" is what the candidate
waits after they stop talking if the model only starts then (no streaming).
"""

import json
import sys
import time
import wave
from pathlib import Path

import jiwer
import numpy as np
from whisper_normalizer.english import EnglishTextNormalizer

HERE = Path(__file__).parent
# --real: the user's own recordings in real/ (references in real.json)
SET = "real" if "--real" in sys.argv else "clips"
REFS = json.loads((HERE / f"{SET}.json").read_text())
CLIPS = sorted((HERE / SET).glob("*.wav"))
THREADS = 4  # roughly what a Docker container gets; the Mac has 14 cores
normalize = EnglishTextNormalizer()

DEFAULT = [
    "whisper:tiny.en",
    "whisper:base.en",
    "whisper:small.en",
    "whisper:distil-large-v3",
    "whisper:large-v3-turbo",
    "moonshine:BASE",
    "moonshine:SMALL_STREAMING",
    "moonshine:MEDIUM_STREAMING",
    "parakeet",
    "parakeet:v3",
]


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path)) as w:
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    return pcm.astype(np.float32) / 32768


def load(engine: str):
    kind, _, name = engine.partition(":")
    if kind == "whisper":
        from faster_whisper import WhisperModel

        model = WhisperModel(name, device="cpu", compute_type="int8", cpu_threads=THREADS)
        english_only = name.endswith(".en")

        def run(audio):
            segments, _ = model.transcribe(
                audio, language=None if english_only else "en", beam_size=1
            )
            return " ".join(s.text.strip() for s in segments)

        return run
    if kind == "moonshine":
        from moonshine_voice import ModelArch, Transcriber, get_model_for_language

        path, arch = get_model_for_language("en", ModelArch[name])
        transcriber = Transcriber(model_path=path, model_arch=arch)

        def run(audio):
            result = transcriber.transcribe_without_streaming(
                audio.tolist(), sample_rate=16000, flags=0
            )
            return " ".join(line.text.strip() for line in result.lines)

        run.transcriber = transcriber
        return run
    if kind == "parakeet":
        import onnx_asr

        import onnxruntime as ort

        options = ort.SessionOptions()
        options.intra_op_num_threads = THREADS
        # CPU only: on a Mac it would pick CoreML, which Docker doesn't have
        model = onnx_asr.load_model(
            f"nemo-parakeet-tdt-0.6b-{name or 'v2'}",
            quantization="int8",
            providers=["CPUExecutionProvider"],
            sess_options=options,
        )
        return lambda audio: model.recognize(audio, sample_rate=16000)
    raise ValueError(engine)


def live_test(transcriber, audio: np.ndarray) -> float:
    # feed 100 ms chunks at real speed, like a microphone; time from the last chunk
    # (the candidate stops) to the finished line
    from moonshine_voice import TranscriptEventListener

    done = {}

    class Listener(TranscriptEventListener):
        def on_line_completed(self, event):
            done["at"] = time.perf_counter()
            done["text"] = done.get("text", "") + " " + event.line.text

    transcriber.remove_all_listeners()
    transcriber.add_listener(Listener())
    transcriber.start()
    chunk = 1600
    start = time.perf_counter()
    for i in range(0, len(audio), chunk):
        transcriber.add_audio(audio[i : i + chunk].tolist(), 16000)
        time.sleep(max(0, start + (i + chunk) / 16000 - time.perf_counter()))
    stopped = time.perf_counter()
    transcriber.stop()
    end = done.get("at", time.perf_counter())
    return max(0.0, end - stopped), done.get("text", "").strip()


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    live = "--live" in sys.argv
    for engine in args or DEFAULT:
        start = time.perf_counter()
        try:
            run = load(engine)
        except Exception as error:  # a model that doesn't load is a result too
            print(f"\n=== {engine}: failed to load: {type(error).__name__}: {error}")
            continue
        load_s = time.perf_counter() - start

        run(read_wav(CLIPS[0]))  # warm-up, not timed
        refs, hyps, times, audio_s, injection = [], [], [], 0.0, []
        for clip in CLIPS:
            audio = read_wav(clip)
            t = time.perf_counter()
            text = run(audio)
            times.append(time.perf_counter() - t)
            audio_s += len(audio) / 16000
            name = clip.stem.split("_")[0]
            refs.append(normalize(REFS[name]))
            hyps.append(normalize(text))
            if name in ("injection", "numbers") or SET == "real":
                injection.append(f"{clip.stem}: {text}")

        wer = jiwer.wer(refs, hyps)
        print(
            f"\n=== {engine}: WER {wer:.1%} | load {load_s:.1f} s | per clip "
            f"{min(times):.2f}–{max(times):.2f} s | {audio_s / sum(times):.0f}× real time"
        )
        for line in injection:
            print(f"   {line}")
        worst = sorted(zip(refs, hyps), key=lambda p: -jiwer.wer(p[0], p[1]))[:2]
        for ref, hyp in worst:
            if ref != hyp:
                print(f"   ref: {ref}\n   got: {hyp}")

        if live and hasattr(run, "transcriber") and "STREAMING" in engine:
            for clip in [c for c in CLIPS if c.stem.startswith(("kubernetes", "design"))][:2]:
                lag, text = live_test(run.transcriber, read_wav(clip))
                print(f"   live {clip.stem}: final text {lag:.2f} s after stop | {text[:80]}")


if __name__ == "__main__":
    main()
