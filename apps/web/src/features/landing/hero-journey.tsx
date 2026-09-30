"use client";

import { useRef, useState, type CSSProperties } from "react";
import { AiBadge, cn } from "@asc/ui";
import {
  CalendarCheck,
  ClipboardCheck,
  FileInput,
  HeartPulse,
  Microscope,
  Receipt,
  RotateCcw,
  Stethoscope,
} from "@asc/ui/icons";
import styles from "./landing-hero.module.css";
import { JOURNEY_STOPS, PRODUCT_ANCHOR, openChapter, scrollToAnchor } from "./landing-journey";

/** One stop on the journey line. `event` is what the product just did there (synthetic). */
const STATIONS = [
  { label: "Referral", icon: FileInput, event: "Referral fax read", detail: "Six fields pulled from page 2, each linked to where it came from.", ai: true },
  { label: "Schedule", icon: CalendarCheck, event: "Room 2 booked for 08:00", detail: "Eligibility came back active before the slot was confirmed.", ai: false },
  { label: "Pre-op", icon: ClipboardCheck, event: "Readiness gate is green", detail: "GLP-1 hold confirmed, consent signed, escort on file.", ai: false },
  { label: "Procedure", icon: Stethoscope, event: "Note draft ready", detail: "Cecum at 08:19, withdrawal 9 min, two polyps removed.", ai: true },
  { label: "PACU", icon: HeartPulse, event: "Discharge gate passed", detail: "Aldrete 10/10, escort present, instructions approved.", ai: false },
  { label: "Coding", icon: Receipt, event: "Codes suggested", detail: "CPT 45385 with evidence links, waiting for the coder.", ai: true },
  { label: "Pathology", icon: Microscope, event: "Result matched to Jar A", detail: "Tubular adenoma, 6 mm. The surveillance interval updates.", ai: false },
  { label: "Recall", icon: RotateCcw, event: "Recall scheduled", detail: "The reminder goes out on its own before it's due.", ai: false },
] as const;

/** Timeline: 2 s per station, the pulse arrives at the last one at 14 s, the line fades and restarts at 16 s. */
const CYCLE_S = 16;
const ARRIVE_END = (STATIONS.length - 1) / STATIONS.length; // 0.875
const FADE_AT = 0.94;
const FADE_DONE = 0.97;

const VIEW_W = 1000;
const VIEW_H = 140;
const PAD_X = 40;
const CREST_Y = 24;
const TROUGH_Y = 104;

const POINTS = STATIONS.map((_, index) => ({
  x: PAD_X + (index * (VIEW_W - PAD_X * 2)) / (STATIONS.length - 1),
  y: index % 2 === 0 ? TROUGH_Y : CREST_Y,
}));

/** A wave with flat tangents at every station, so each segment has the same length and the pulse keeps an even pace. */
const PATH = POINTS.reduce((d, point, index) => {
  if (index === 0) return `M${point.x} ${point.y}`;
  const prev = POINTS[index - 1];
  const half = (point.x - prev.x) / 2;
  return `${d} C${prev.x + half} ${prev.y} ${point.x - half} ${point.y} ${point.x} ${point.y}`;
}, "");

const arrival = (index: number) => index / STATIONS.length;

/** SMIL key frames for "station lit from arrival until the loop fades". */
function litFrames(index: number) {
  const at = arrival(index);
  return index === 0
    ? { keyTimes: `0;0.005;${FADE_AT};${FADE_DONE};1`, values: "0;1;1;0;0" }
    : { keyTimes: `0;${at};${at + 0.005};${FADE_AT};${FADE_DONE};1`, values: "0;0;1;1;0;0" };
}

/** SMIL key frames for the ring that pings once when the pulse arrives. */
function pingFrames(index: number) {
  const at = arrival(index);
  return index === 0
    ? { keyTimes: "0;0.06;1", r: "7;26;26", opacity: "0.7;0;0" }
    : { keyTimes: `0;${at};${at + 0.06};1`, r: "7;7;26;26", opacity: "0;0.7;0;0" };
}

const pct = (value: number, total: number) => `${(value / total) * 100}%`;

/** A station click opens its walkthrough chapter when there is one, otherwise the matching workflow step. */
function goToStop(index: number) {
  const stop = JOURNEY_STOPS[index];
  if (stop.chapter) {
    openChapter(stop.chapter);
    scrollToAnchor(PRODUCT_ANCHOR);
  } else {
    scrollToAnchor(stop.stepAnchor);
  }
}

/**
 * The hero's moving part: a pulse travels referral → recall and each stop shows what the product did there.
 * The drawing is decorative (aria-hidden); each station is also a button. Hovering or focusing one freezes the
 * loop (SMIL via the svg, cards via a CSS class) and pins its card; clicking jumps to its chapter or workflow step.
 * The svg's animated children never change props, so pinning re-renders without restarting the timeline.
 */
export function HeroJourney({ className }: { readonly className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const dur = `${CYCLE_S}s`;
  const fade = { keyTimes: `0;${ARRIVE_END};${FADE_AT};${FADE_DONE};1`, opacity: "1;1;1;0;0" };

  const pin = (index: number) => {
    svgRef.current?.pauseAnimations();
    setPinned(index);
  };
  const release = () => {
    svgRef.current?.unpauseAnimations();
    setPinned(null);
  };

  return (
    <div className={cn("relative select-none", pinned !== null && styles.journeyPinned, className)} data-testid="landing-hero-journey">
      {/* Event lane: one card per station, each visible for its 2 s slot (or only the pinned one while a station is held). */}
      <div aria-hidden className="pointer-events-none relative h-28 sm:h-24">
        {STATIONS.map((station, index) => (
          <div
            key={station.label}
            className={cn(styles.cardSlot, index === 3 && styles.cardStatic, pinned === index && styles.cardPinned)}
            style={{ "--x": pct(POINTS[index].x, VIEW_W), "--delay": `${index * (CYCLE_S / STATIONS.length)}s` } as CSSProperties}
          >
            <div className={styles.card}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <station.icon className="size-4" />
              </span>
              <span className="min-w-0 space-y-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-foreground">{station.event}</span>
                  {station.ai && <AiBadge label="AI" />}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{station.detail}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg ref={svgRef} aria-hidden viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="pointer-events-none block h-auto w-full overflow-visible" fill="none">
          <defs>
            <linearGradient id="hero-journey-stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--hero-teal)" />
              <stop offset="0.5" stopColor="var(--primary)" />
              <stop offset="1" stopColor="var(--hero-rose)" />
            </linearGradient>
            <filter id="hero-journey-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* Faint lead-in and lead-out so the line reads as continuing past the frame. */}
          <path d={`M-200 ${TROUGH_Y} L${PAD_X} ${TROUGH_Y}`} className={styles.trackFaint} />
          <path d={`M${VIEW_W - PAD_X} ${CREST_Y} L${VIEW_W + 200} ${CREST_Y}`} className={styles.trackFaint} />
          <path id="hero-journey-path" d={PATH} className={styles.track} />

          {/* Static fallback for reduced motion: the whole journey, drawn. */}
          <path d={PATH} stroke="url(#hero-journey-stroke)" strokeWidth="3" strokeLinecap="round" className={styles.staticOnly} />

          <g className={styles.motionOnly}>
            <path d={PATH} stroke="url(#hero-journey-stroke)" strokeWidth="10" strokeLinecap="round" pathLength={1} strokeDasharray="1 1" filter="url(#hero-journey-glow)" opacity="0.45">
              <animate attributeName="stroke-dashoffset" dur={dur} repeatCount="indefinite" keyTimes={fade.keyTimes} values="1;0;0;0;1" />
            </path>
            <path d={PATH} stroke="url(#hero-journey-stroke)" strokeWidth="3" strokeLinecap="round" pathLength={1} strokeDasharray="1 1">
              <animate attributeName="stroke-dashoffset" dur={dur} repeatCount="indefinite" keyTimes={fade.keyTimes} values="1;0;0;0;1" />
              <animate attributeName="opacity" dur={dur} repeatCount="indefinite" keyTimes={fade.keyTimes} values={fade.opacity} />
            </path>
          </g>

          {POINTS.map((point, index) => {
            const lit = litFrames(index);
            const ping = pingFrames(index);
            return (
              <g key={STATIONS[index].label}>
                <circle cx={point.x} cy={point.y} r="7" className={styles.station} />
                <g className={styles.motionOnly}>
                  <circle cx={point.x} cy={point.y} r="7" className={styles.ping} opacity="0">
                    <animate attributeName="r" dur={dur} repeatCount="indefinite" keyTimes={ping.keyTimes} values={ping.r} />
                    <animate attributeName="opacity" dur={dur} repeatCount="indefinite" keyTimes={ping.keyTimes} values={ping.opacity} />
                  </circle>
                  <circle cx={point.x} cy={point.y} r="7" className={styles.stationLit} opacity="0">
                    <animate attributeName="opacity" dur={dur} repeatCount="indefinite" keyTimes={lit.keyTimes} values={lit.values} />
                  </circle>
                </g>
                <circle cx={point.x} cy={point.y} r="7" className={cn(styles.stationLit, styles.staticOnly)} />
              </g>
            );
          })}

          {/* Held station: lit and a little larger, drawn over whatever state the frozen timeline is in. */}
          {POINTS.map((point, index) => (
            <circle key={STATIONS[index].label} cx={point.x} cy={point.y} r="7" className={cn(styles.stationHeld, pinned === index && styles.stationHeldOn)} />
          ))}

          <g className={styles.motionOnly}>
            <animate attributeName="opacity" dur={dur} repeatCount="indefinite" keyTimes={fade.keyTimes} values={fade.opacity} />
            <circle r="16" fill="var(--primary)" opacity="0.35" filter="url(#hero-journey-glow)">
              <animateMotion dur={dur} repeatCount="indefinite" keyPoints="0;1;1" keyTimes={`0;${ARRIVE_END};1`} calcMode="linear">
                <mpath href="#hero-journey-path" />
              </animateMotion>
            </circle>
            <circle r="5" className={styles.pulse}>
              <animateMotion dur={dur} repeatCount="indefinite" keyPoints="0;1;1" keyTimes={`0;${ARRIVE_END};1`} calcMode="linear">
                <mpath href="#hero-journey-path" />
              </animateMotion>
            </circle>
          </g>
        </svg>

        {/* Station hit targets (40 px, centred on the point) with their names below — HTML so they stay legible; names hide on phones. */}
        {POINTS.map((point, index) => {
          const station = STATIONS[index];
          return (
            <button
              key={station.label}
              type="button"
              aria-label={`${station.label}: ${station.event}`}
              className="absolute size-10 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              style={{ left: pct(point.x, VIEW_W), top: pct(point.y, VIEW_H) }}
              onPointerEnter={() => pin(index)}
              onPointerLeave={release}
              onFocus={() => pin(index)}
              onBlur={release}
              onClick={() => goToStop(index)}
            >
              {/* top-full sits 20 px below the point; -mt-1 keeps the old 16 px label offset. */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-full left-1/2 -mt-1 hidden -translate-x-1/2 text-xs font-medium whitespace-nowrap transition-colors sm:block motion-reduce:transition-none",
                  pinned === index ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {station.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
