import { cn } from "@asc/ui";

interface ScopeThumbnailProps {
  /** Seed for the synthetic image (capture id). */
  readonly seed: string;
  /** Marks a polyp capture (adds a raised lesion). */
  readonly lesion?: boolean;
  readonly className?: string;
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) result = (result * 31 + char.charCodeAt(0)) % 9973;
  return result;
}

/**
 * Synthetic endoscopy frame (SVG, tokens only) — the mock has no real images. Deterministic per seed so
 * a capture looks the same on every render.
 */
export function ScopeThumbnail({ seed, lesion = false, className }: ScopeThumbnailProps) {
  const h = hash(seed);
  const lumenX = 40 + (h % 20);
  const lumenY = 30 + ((h >> 3) % 14);
  const rotate = h % 360;
  return (
    <svg viewBox="0 0 100 75" aria-hidden className={cn("block aspect-[4/3] w-full rounded-lg bg-muted", className)}>
      <circle cx="50" cy="37.5" r="36" className="fill-chart-4/55" />
      <g transform={`rotate(${rotate} 50 37.5)`} fill="none" strokeLinecap="round">
        <ellipse cx="50" cy="37.5" rx="30" ry="22" strokeWidth="2.2" className="stroke-destructive/30" />
        <ellipse cx="50" cy="37.5" rx="21" ry="15" strokeWidth="1.8" className="stroke-destructive/30" />
        <ellipse cx="50" cy="37.5" rx="12" ry="9" strokeWidth="1.4" className="stroke-destructive/25" />
      </g>
      <ellipse cx={lumenX} cy={lumenY} rx="7" ry="5.5" className="fill-foreground/55" />
      {lesion && <ellipse cx={lumenX > 50 ? 30 : 68} cy={50} rx="6.5" ry="5" className="fill-destructive/50 stroke-destructive/70" strokeWidth="1" />}
      <ellipse cx="34" cy="20" rx="5" ry="2" className="fill-background/70" />
      <circle cx="50" cy="37.5" r="36" fill="none" strokeWidth="6" className="stroke-muted" />
    </svg>
  );
}
