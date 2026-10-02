import { Fragment, type ReactNode } from "react";

import type { WriteUp } from "@/lib/benchmarks";

type Props = { id: string; title: string; writeUps: WriteUp[]; children: ReactNode };

export function BenchmarkSection({ id, title, writeUps, children }: Props) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2
        id={id}
        className="px-2 text-xs font-medium tracking-widest text-muted-foreground uppercase"
      >
        {title}
      </h2>
      {children}
      <p className="px-2 text-sm text-muted-foreground">
        Read the full write-up{writeUps.length > 1 && "s"}:{" "}
        {writeUps.map((writeUp, index) => (
          <Fragment key={writeUp.href}>
            {index > 0 && " · "}
            <a href={writeUp.href} className="text-primary underline-offset-4 hover:underline">
              {writeUp.title}
            </a>
          </Fragment>
        ))}
      </p>
    </section>
  );
}
