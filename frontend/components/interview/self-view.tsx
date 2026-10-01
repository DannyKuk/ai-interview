"use client";

import { useEffect, useRef } from "react";

import { Equalizer } from "@/components/interview/equalizer";

type SelfViewProps = {
  name: string | null;
  mic: AnalyserNode | null; // null = not recording
};

// the candidate's tile: an initial instead of a camera, with a ring that grows with the voice
export function SelfView({ name, mic }: SelfViewProps) {
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const ring = ringRef.current;
    if (!mic || !ring) {
      return;
    }

    const samples = new Float32Array(mic.fftSize);
    let frame = requestAnimationFrame(function update() {
      mic.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(
        samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
      );
      ring.style.setProperty("--level", String(Math.min(1, rms * 4)));
      frame = requestAnimationFrame(update);
    });

    return () => {
      cancelAnimationFrame(frame);
      ring.style.setProperty("--level", "0");
    };
  }, [mic]);

  return (
    <div
      data-speaking={mic ? "" : undefined}
      className="speaking-edge absolute top-3.5 right-3.5 grid aspect-4/3 w-[clamp(120px,22%,200px)] place-items-center rounded-xl bg-muted"
    >
      <span
        ref={ringRef}
        className="voice-ring grid size-14 place-items-center rounded-full bg-card font-heading text-2xl font-semibold"
      >
        {(name ?? "You")[0]}
      </span>
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-2 rounded-md bg-background/70 px-2 py-0.5 text-xs font-medium backdrop-blur">
        {mic && <Equalizer />}
        {name ? `${name} (you)` : "You"}
      </span>
    </div>
  );
}
