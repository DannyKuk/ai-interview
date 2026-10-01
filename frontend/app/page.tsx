import { SetupForm } from "@/components/interview/setup-form";

// Server Component: the form inside is the only part that needs the browser.
export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <h1 className="font-heading text-3xl font-semibold tracking-tight">Interview Practice App</h1>
      <p className="text-muted-foreground">Pick a company and a role, then start your interview.</p>
      <SetupForm />
    </main>
  );
}
