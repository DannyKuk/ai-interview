import type { Metadata } from "next";
import Link from "next/link";

import { BarRows } from "@/components/benchmarks/bar-rows";
import { BeforeAfterBars } from "@/components/benchmarks/before-after-bars";
import { OTHER, USED } from "@/components/benchmarks/chart-style";
import { LatencyBars } from "@/components/benchmarks/latency-bars";
import { PairedBars } from "@/components/benchmarks/paired-bars";
import { QuestionCard } from "@/components/benchmarks/question-card";
import { BenchmarkSection } from "@/components/benchmarks/section";
import { Card, CardContent } from "@/components/ui/card";
import {
  cvYears,
  effortLevels,
  feedbackMistakes,
  latency,
  promptFixes,
  sttModels,
  tiles,
  writeUps,
} from "@/lib/benchmarks";

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

      <BenchmarkSection id="prompts" title="Prompt techniques" writeUps={writeUps.prompts}>
        <QuestionCard
          question="Which prompt technique makes the best interviewer?"
          answer={
            <>
              None stands out:{" "}
              <strong className="font-semibold text-primary">
                all five behave almost the same.
              </strong>{" "}
              What helped was fixing two mistakes they all made. The app uses zero-shot, the
              cheapest.
            </>
          }
          footnote="Jev scores each reply; 90 replies per run, 18 per technique."
        >
          <BeforeAfterBars measures={promptFixes} />
        </QuestionCard>
        <QuestionCard
          question="Can a better prompt stop the sample answer from making things up?"
          answer={
            <>
              No. Even the best technique still invented details in half the runs, and the ones that
              invented less{" "}
              <strong className="font-semibold text-primary">
                praised nonsense answers more often
              </strong>
              . So the app keeps its prompt and tells you to change any detail that isn&apos;t
              yours.
            </>
          }
          footnote="Lower is better on both. One vague interview run 10 times, three nonsense interviews. In a second round with a rewritten prompt, the best technique (chain-of-thought) still invented details in 5 of 10 runs."
        >
          <PairedBars
            rows={feedbackMistakes}
            max={1}
            a={{ label: "Invented details", color: OTHER }}
            b={{ label: "Praised nonsense", color: OTHER, outline: true }}
          />
        </QuestionCard>
      </BenchmarkSection>

      <BenchmarkSection
        id="settings"
        title="Settings & reasoning effort"
        writeUps={writeUps.settings}
      >
        <QuestionCard
          question="How long should the interviewer think before answering?"
          answer={
            <>
              Barely. With <strong className="font-semibold text-primary">minimal</strong> reasoning
              it starts answering in 1.3 s, and the replies are just as good as at medium, which
              takes 3× as long.
            </>
          }
          footnote="gpt-5-mini, median time and cost per 100 replies. Reply quality is 0.93 at every level. gpt-5-nano is 5× cheaper, but at medium effort 16 of 18 replies came back empty."
        >
          <BarRows rows={effortLevels} max={5} valueName="Median seconds" />
        </QuestionCard>
        <QuestionCard
          question="Then why not minimal everywhere?"
          answer={
            <>
              Because it gets the maths wrong. Reading a CV with minimal effort counted{" "}
              <strong className="font-semibold text-primary">
                1–3 years too few on 11 of 12 CVs
              </strong>
              , so the CV, plan and feedback calls keep low.
            </>
          }
          footnote="Years of experience the CV profile counted for one job period, two runs each; both runs gave the same number."
        >
          <PairedBars
            rows={cvYears}
            max={10}
            a={{ label: "low (correct)", color: USED }}
            b={{ label: "minimal", color: OTHER }}
          />
        </QuestionCard>
      </BenchmarkSection>

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
