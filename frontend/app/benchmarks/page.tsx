import type { Metadata } from "next";
import Link from "next/link";

import { BarRows } from "@/components/benchmarks/bar-rows";
import { LatencyBars } from "@/components/benchmarks/latency-bars";
import { QuestionCard } from "@/components/benchmarks/question-card";
import { BenchmarkSection } from "@/components/benchmarks/section";
import { Card, CardContent } from "@/components/ui/card";
import { latency, sttModels, tiles, writeUps } from "@/lib/benchmarks";

export const metadata: Metadata = { title: "Benchmarks · Interview Practice" };

export default function BenchmarksPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-12 pl-2 sm:pr-28">
        <Link href="/" className="font-semibold">
          Interview Practice
        </Link>
        <h1 className="text-muted-foreground">Benchmarks</h1>
      </header>

      <div className="flex flex-col gap-4">
        <p className="max-w-[70ch] px-2 text-muted-foreground">
          How the app&apos;s choices were made: every number here was measured.{" "}
          <span className="font-medium text-primary">Mint</span> marks what the app uses. Each
          section links to the full write-up with the method and the raw runs.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <Card key={tile.label} size="sm">
              <CardContent className="flex flex-col gap-1">
                <p className="font-heading text-3xl font-semibold">
                  {tile.value}
                  {tile.unit && (
                    <span className="ml-1 text-base font-medium text-muted-foreground">
                      {tile.unit}
                    </span>
                  )}
                </p>
                <p className="text-sm text-muted-foreground">{tile.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <BenchmarkSection id="voice" title="Voice" writeUps={writeUps.voice}>
        <QuestionCard
          question="Which speech-to-text model hears you best?"
          answer={
            <>
              <strong className="font-semibold text-primary">Parakeet</strong>: the fewest misheard
              words of the 9 models tested, and one of the fastest. It runs on your machine, so your
              voice never leaves it.
            </>
          }
          footnote="Bar = words misheard on a real voice (lower is better). Time = how long a 15-second answer takes to transcribe on the CPU."
        >
          <BarRows rows={sttModels} max={31} valueName="Misheard words (%)" />
        </QuestionCard>
        <QuestionCard
          question="How long until the interviewer answers you?"
          answer={
            <>
              About <strong className="font-semibold text-primary">2–3 seconds</strong> with the
              default voice. The cloud voice sounds more natural but adds 1–3 seconds.
            </>
          }
          footnote="Default voice = HeadTTS on your machine, cloud voice = Gemini TTS. Bars show typical times per step at the app's reasoning effort; the number is the whole wait, fastest to slowest."
        >
          <LatencyBars rows={latency} />
        </QuestionCard>
      </BenchmarkSection>
    </main>
  );
}
