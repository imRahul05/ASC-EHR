import { API_ROUTES } from "@asc/config/api";
import type {
  NoteDraft,
  NoteStreamEvent,
  NoteStreamEventType,
  ResolveGapChipPayload,
  SignNotePayload,
  UpdateCriticSuggestionPayload,
  UpdateNoteSectionPayload,
} from "@asc/types";
import { ApiError, authHeaders, buildUrl, http, toApiError } from "../http";

/** Current note of the case, or null before generation. */
export function getNote(caseId: string): Promise<NoteDraft | null> {
  return http.get(API_ROUTES.caseNote(caseId));
}

/** Clinician edit of one section (marks it `edited`; critic never overwrites it). */
export function updateNoteSection(caseId: string, payload: UpdateNoteSectionPayload): Promise<NoteDraft> {
  return http.put(API_ROUTES.caseNoteSection(caseId), payload);
}

export function resolveGapChip(caseId: string, payload: ResolveGapChipPayload): Promise<NoteDraft> {
  return http.post(API_ROUTES.caseNoteGapResolve(caseId), payload);
}

export function updateCriticSuggestion(caseId: string, payload: UpdateCriticSuggestionPayload): Promise<NoteDraft> {
  return http.post(API_ROUTES.caseNoteCritic(caseId), payload);
}

/** Human signature. Rejects 422 `GATE_FAILED` while a blocking gap-chip is open (signGate). */
export function signNote(caseId: string, payload: SignNotePayload = { attest: true }): Promise<NoteDraft> {
  return http.post(API_ROUTES.caseNoteSign(caseId), payload);
}

// ─── Streaming generation ───────────────────────────────────────────────────

const NOTE_STREAM_TYPES: ReadonlySet<NoteStreamEventType> = new Set<NoteStreamEventType>([
  "started",
  "section_delta",
  "section_complete",
  "draft_ready",
  "gap_chip",
  "critic_suggestion",
  "coding_ready",
  "completed",
  "failed",
  "heartbeat",
]);
const TERMINAL_TYPES: ReadonlySet<NoteStreamEventType> = new Set<NoteStreamEventType>(["completed", "failed"]);

function isNoteStreamEvent(value: unknown): value is NoteStreamEvent {
  if (typeof value !== "object" || value === null || !("type" in value)) return false;
  return NOTE_STREAM_TYPES.has((value as { type: NoteStreamEventType }).type);
}

/** Parses one SSE block (`event:`/`id:`/`data:` lines) into its joined data payload. */
function parseSseBlock(block: string): unknown {
  const data = block
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return undefined;
  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Starts AI note generation and streams events (text/event-stream over fetch, so the bearer header is sent —
 * never EventSource). Draft-first order: started → section_delta/section_complete per section → draft_ready →
 * gap_chip / critic_suggestion / coding_ready → completed. Unknown event types are ignored.
 *
 * Resolves after the terminal event (`completed` / `failed`) or when `signal` aborts (resolves quietly).
 * Rejects with ApiError when the request itself fails (e.g. 409 `NOTE_ALREADY_SIGNED`).
 */
export async function streamNoteGeneration(
  caseId: string,
  onEvent: (event: NoteStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(buildUrl(API_ROUTES.caseNoteGenerate(caseId)), {
      method: "POST",
      signal,
      headers: { Accept: "text/event-stream", ...authHeaders() },
    });
  } catch (error) {
    if (signal?.aborted) return;
    const message = error instanceof Error ? error.message : "Network request failed";
    throw new ApiError({ status: 0, message, code: "NETWORK_ERROR" });
  }
  if (!response.ok) throw await toApiError(response);
  if (!response.body) throw new ApiError({ status: response.status, message: "Empty stream", code: "STREAM_EMPTY" });

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += value;
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!isNoteStreamEvent(event)) continue;
        onEvent(event);
        if (TERMINAL_TYPES.has(event.type)) return;
      }
    }
  } catch (error) {
    if (signal?.aborted) return;
    throw error;
  } finally {
    reader.releaseLock();
  }
}
