import Link from "next/link";

import { InterviewChat } from "@/components/interview/interview-chat";
import { buttonVariants } from "@/components/ui/button";

// Server Component: the chat inside is the only part that needs the browser.
export default function InterviewPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Interview</h1>
      <InterviewChat />
      <Link
        href="/results"
        className={buttonVariants({ variant: "destructive", className: "self-start" })}
      >
        Leave interview
      </Link>
    </main>
  );
}
