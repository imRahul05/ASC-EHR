import type { ReactNode } from "react";
import { cn } from "@asc/ui";
import { Reveal } from "./reveal";

interface SectionHeadingProps {
  readonly id?: string;
  readonly eyebrow: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly align?: "left" | "center";
  readonly className?: string;
}

/** Marketing section title: small eyebrow, big tight headline, one muted sentence. Fades up on first scroll-in. */
export function SectionHeading({ id, eyebrow, title, description, align = "left", className }: SectionHeadingProps) {
  return (
    <Reveal className={cn("max-w-2xl space-y-4", align === "center" && "mx-auto text-center", className)}>
      <p className="font-mono text-xs tracking-wider text-muted-foreground uppercase">{eyebrow}</p>
      <h2 id={id} className="text-3xl leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.75rem]">
        {title}
      </h2>
      {description && <p className="text-base leading-relaxed text-pretty text-muted-foreground sm:text-lg">{description}</p>}
    </Reveal>
  );
}
