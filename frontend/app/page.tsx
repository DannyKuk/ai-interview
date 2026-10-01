import { SetupForm } from "@/components/interview/setup-form";

// Server Component: the form inside is the only part that needs the browser.
export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 px-2">
        <span className="font-semibold">Interview Practice</span>
        <h1 className="text-muted-foreground">Set up your interview</h1>
      </header>
      <SetupForm />
    </main>
  );
}
