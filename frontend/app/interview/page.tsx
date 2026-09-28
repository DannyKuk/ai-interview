import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

// Interview page: transcript + input, streamed replies (built in F5).
export default function InterviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Interview</h1>
      <p className="text-muted-foreground">The chat comes here.</p>
      <Link
        href="/results"
        className={buttonVariants({ variant: "destructive", className: "self-start" })}
      >
        Leave interview
      </Link>
    </main>
  );
}
