import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { question: string; answer: ReactNode; footnote?: ReactNode; children: ReactNode };

export function QuestionCard({ question, answer, footnote, children }: Props) {
  return (
    <Card className="[--card-spacing:--spacing(6)]">
      <CardHeader>
        <CardTitle className="text-xl font-semibold">{question}</CardTitle>
        <CardDescription className="max-w-[75ch] text-[15px]">{answer}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        {footnote && <p className="text-xs text-muted-foreground">{footnote}</p>}
      </CardContent>
    </Card>
  );
}
