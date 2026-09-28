import type { ChatMessage } from "@/lib/api";

type TranscriptProps = {
  messages: ChatMessage[];
  children?: React.ReactNode; // extra lines at the end, e.g. the reply that's still streaming
};

// the conversation so far. Used on /interview and /results
export function Transcript({ messages, children }: TranscriptProps) {
  return (
    <ol className="flex flex-col gap-3">
      {messages.map((message, index) => (
        <TranscriptLine key={index} role={message.role} content={message.content} />
      ))}
      {children}
    </ol>
  );
}

export function TranscriptLine({ role, content }: ChatMessage) {
  return (
    <li>
      <strong>{role === "assistant" ? "Interviewer" : "You"}:</strong> {content}
    </li>
  );
}
