import { InterviewChat } from "@/components/interview/interview-chat";

// Server Component: the chat inside is the only part that needs the browser.
export default function InterviewPage() {
  return (
    <main className="flex w-full flex-1 flex-col gap-3 p-3 sm:p-4 lg:h-dvh lg:flex-none">
      <InterviewChat />
    </main>
  );
}
