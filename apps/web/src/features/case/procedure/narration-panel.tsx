"use client";

import { useEffect, useState } from "react";
import { useAddNarration } from "@asc/api-client/react";
import { formatTime24 } from "@asc/clinical-rules";
import type { CaseDetail } from "@asc/types";
import { Badge, Button, cn, EmptyState, SectionCard } from "@asc/ui";
import { Mic, MicOff, Square } from "@asc/ui/icons";
import { notifyError } from "../notify-error";

interface NarrationPanelProps {
  readonly detail: CaseDetail;
  readonly editable: boolean;
}

type SpeakerRole = "MD" | "RN" | "CRNA";

/** Synthetic diarized utterances (mock STT) — posted one by one while "listening". */
const MOCK_SCRIPT: readonly { readonly role: SpeakerRole; readonly text: string }[] = [
  { role: "MD", text: "Continuing withdrawal through the transverse colon, mucosa looks healthy." },
  { role: "RN", text: "Vitals stable, sat ninety-eight percent." },
  { role: "MD", text: "Five millimeter sessile polyp at the splenic flexure. Cold snare please." },
  { role: "RN", text: "Snare ready. Jar B labeled for the splenic flexure." },
  { role: "MD", text: "Polyp resected and retrieved, no bleeding." },
  { role: "CRNA", text: "Another twenty of propofol given." },
  { role: "MD", text: "Retroflexion in the rectum, small internal hemorrhoids." },
];

const UTTERANCE_MS = 2_600;

const ROLE_CLASS: Readonly<Record<SpeakerRole, string>> = {
  MD: "border-primary/40 bg-primary/10 text-primary",
  RN: "border-info/40 bg-info/10 text-info",
  CRNA: "border-warning/40 bg-warning/10 text-warning",
};

interface Listening {
  readonly running: boolean;
  readonly cursor: number;
}

/**
 * Live narration (mock speech-to-text). "Start narration" streams synthetic, diarized utterances into
 * the case transcript via `addNarration`; the transcript is an `aria-live` log. Real STT (Deepgram-style,
 * see MindScript §4.1) replaces the script in P13.
 */
export function NarrationPanel({ detail, editable }: NarrationPanelProps) {
  const [listening, setListening] = useState<Listening>({ running: false, cursor: 0 });
  const addNarration = useAddNarration(detail.case.id);
  const { team } = detail.case;
  const [surgeonName, nurseName, anesthesiaName] = [team.surgeon.name, team.nurse.name, team.anesthesia.name];
  const roleOf = (speaker: string): SpeakerRole =>
    speaker === nurseName ? "RN" : speaker === anesthesiaName ? "CRNA" : "MD";
  const running = listening.running && editable;
  const { mutate } = addNarration;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      const line = MOCK_SCRIPT[listening.cursor % MOCK_SCRIPT.length];
      const speaker: Readonly<Record<SpeakerRole, string>> = { MD: surgeonName, RN: nurseName, CRNA: anesthesiaName };
      if (line) mutate({ speaker: speaker[line.role], text: line.text }, { onError: notifyError("Narration was not saved") });
      const next = listening.cursor + 1;
      setListening({ running: next % MOCK_SCRIPT.length !== 0, cursor: next });
    }, UTTERANCE_MS);
    return () => window.clearTimeout(timer);
  }, [running, listening.cursor, mutate, surgeonName, nurseName, anesthesiaName]);

  const toggle = () => setListening((current) => ({ ...current, running: !current.running }));
  const segments = detail.narration;

  return (
    <SectionCard
      title="Live narration"
      description="Mock speech-to-text, diarized by speaker."
      actions={
        <Button
          size="lg"
          variant={running ? "destructive" : "default"}
          className="h-12 px-4 text-base"
          disabled={!editable}
          onClick={toggle}
          aria-pressed={running}
          data-testid="procedure-narration-toggle"
        >
          {running ? <Square /> : editable ? <Mic /> : <MicOff />}
          {running ? "Stop" : "Start narration"}
        </Button>
      }
      data-testid="procedure-narration"
    >
      {running && (
        <p className="mb-3 flex items-center gap-2 text-sm font-medium text-ai-foreground" data-testid="procedure-narration-listening">
          <span aria-hidden className="size-2.5 rounded-full bg-destructive motion-safe:animate-pulse" />
          Listening…
        </p>
      )}
      {segments.length === 0 ? (
        <EmptyState title="No narration yet" description={editable ? "Start narration to transcribe the room." : "Nothing was dictated in the room."} />
      ) : (
        // flex-col-reverse keeps the newest line in view without scripting the scroll position.
        <div className="flex max-h-80 flex-col-reverse overflow-y-auto rounded-lg border border-border bg-background">
          <ol role="log" aria-live="polite" aria-label="Narration transcript" className="divide-y divide-border" data-testid="procedure-narration-log">
            {segments.map((segment) => {
              const role = roleOf(segment.speaker);
              return (
                <li key={segment.id} className="flex gap-3 px-3 py-2.5">
                  <time className="w-12 shrink-0 pt-0.5 font-mono text-sm text-muted-foreground tabular-nums">{formatTime24(segment.at)}</time>
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge variant="outline" className={cn("h-5 px-1.5 text-[11px] font-semibold", ROLE_CLASS[role])}>
                        {role}
                      </Badge>
                      <span className="text-muted-foreground">{segment.speaker}</span>
                    </p>
                    <p className="text-base leading-snug">{segment.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </SectionCard>
  );
}
