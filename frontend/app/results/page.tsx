import Link from "next/link";

import { ResultsView } from "@/components/results/results-view";
import { buttonVariants } from "@/components/ui/button";

export default function ResultsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-heading text-2xl font-semibold tracking-tight">Your feedback</h1>
      <ResultsView />
      <Link href="/" className={buttonVariants({ variant: "outline", className: "self-start" })}>
        New interview
      </Link>
    </main>
  );
}
