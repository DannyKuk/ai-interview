import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import type { ChatMessage } from "@/lib/api";

type TranscriptProps = {
  messages: ChatMessage[];
  children?: React.ReactNode; // extra lines at the end, e.g. the reply that's still streaming
};

// the conversation so far. Used on /interview and /results
export function Transcript({ messages, children }: TranscriptProps) {
  return (
    <ol className="flex flex-col gap-2">
      {messages.map((message, index) => (
        <TranscriptLine key={index} role={message.role} content={message.content} />
      ))}
      {children}
    </ol>
  );
}

export function TranscriptLine({ role, content }: ChatMessage) {
  const mine = role === "user";

  return (
    <li>
      <Message align={mine ? "end" : "start"}>
        <MessageContent>
          <Bubble variant={mine ? "tinted" : "secondary"} align={mine ? "end" : "start"}>
            <BubbleContent className="whitespace-pre-wrap">{content}</BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </li>
  );
}
