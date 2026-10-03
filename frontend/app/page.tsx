import Link from "next/link";

import { SetupForm } from "@/components/interview/setup-form";
import { buttonVariants } from "@/components/ui/button";

// Server Component: the form inside is the only part that needs the browser.
export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 pr-12 pl-2 sm:pr-28">
        <span className="font-semibold">Interview Practice</span>
        <h1 className="text-muted-foreground">Set up your interview</h1>
        <Link
          href="/benchmarks"
          className={buttonVariants({ variant: "ghost", size: "sm", className: "ml-auto" })}
        >
          Benchmarks
        </Link>
      </header>
      <SetupForm />
    </main>
  );
}
