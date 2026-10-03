import resource, sys, time, wave, numpy as np
def rss(): return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024 / 1024
w = wave.open("real/answer1.wav"); a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
if sys.argv[1].startswith("parakeet-lean"):  # parakeet-lean = v2, parakeet-lean-v3 = v3
    import onnxruntime as ort, onnx_asr
    o = ort.SessionOptions(); o.intra_op_num_threads = 4
    o.enable_cpu_mem_arena = False; o.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
    m = onnx_asr.load_model("nemo-parakeet-tdt-0.6b-" + ("v3" if sys.argv[1].endswith("v3") else "v2"), quantization="int8", providers=["CPUExecutionProvider"], sess_options=o)
    run = lambda: m.recognize(a, sample_rate=16000)
else:
    from faster_whisper import WhisperModel
    m = WhisperModel("small.en", device="cpu", compute_type="int8", cpu_threads=4)
    run = lambda: " ".join(s.text for s in m.transcribe(a, beam_size=1)[0])
loaded = rss(); t = time.perf_counter(); text = run(); took = time.perf_counter() - t
print(f"{sys.argv[1]}: after load {loaded:.0f} MB | peak {rss():.0f} MB | 15 s clip {took:.2f} s | {text[:60]}")
