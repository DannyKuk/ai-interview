import type { AnsweredQuestion } from "@/lib/api";
import type { EndReason, TranscriptMessage } from "@/lib/store";

export function answersFrom(
  messages: TranscriptMessage[],
  ended: EndReason | null,
): AnsweredQuestion[] {
  const quit = ended === "candidate_left" && messages.at(-1)?.question === undefined;
  const counted = quit ? messages.slice(0, -2) : messages;

  const answers: AnsweredQuestion[] = [];

  counted.forEach((message, index) => {
    const reply = counted[index + 1];
    if (message.question === undefined || reply?.role !== "user") {
      return;
    }
    const exchange = { interviewer: message.content, candidate: reply.content };
    const last = answers.at(-1);

    if (last?.question === message.question) {
      last.exchanges.push(exchange);
    } else {
      answers.push({ question: message.question, exchanges: [exchange] });
    }
  });
  return answers;
}
