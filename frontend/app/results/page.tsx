import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Results page: transcript now, scorecard in phase 2 (built in F8).
export default function ResultsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Your feedback</h1>
      <p className="text-muted-foreground">Feedback comes soon...</p>
      <Link href="/" className={buttonVariants({ variant: "outline", className: "self-start" })}>
        New interview
      </Link>
    </main>
  );
}
