import { isPhaseAtLeast, signGate } from "@asc/clinical-rules";
import { API_ROUTE_PATTERNS as P } from "@asc/config/api";
import type {
  CaseCoding,
  NoteDraft,
  NoteStreamEvent,
  ResolveGapChipPayload,
  UpdateCriticSuggestionPayload,
  UpdateNoteSectionPayload,
} from "@asc/types";
import { delay, http, HttpResponse } from "msw";
import { buildCodingSuggestions } from "../../db/coding-builder";
import { buildNote, noteProvenance } from "../../db/note-builder";
import { actorFrom, addWorkItem, audit, autoAdvance, caseDetail, completeWorkItems, db } from "../../db/store";
import { newId } from "../../db/util";
import { apiUrl } from "../api-url";
import { apiError, body, gateFailed, latency, notFound, param } from "./respond";

const WORDS_PER_DELTA = 3;
const DELTA_DELAY_MS = 45;
const SECTION_PAUSE_MS = 160;
const ENRICH_DELAY_MS = 350;

/** Distributive Omit so each NoteStreamEvent variant keeps its own fields. */
type EventBody = NoteStreamEvent extends infer E ? (E extends NoteStreamEvent ? Omit<E, "seq" | "ts"> : never) : never;

function editableNote(caseId: string) {
  const note = db().notes.get(caseId);
  if (!note) return { error: notFound("Note") } as const;
  if (note.status !== "draft") return { error: apiError(409, "NOTE_NOT_EDITABLE", note.status === "signed" ? "The note is signed." : "Wait for the draft to finish.") } as const;
  return { note } as const;
}

function saveNote(note: NoteDraft): NoteDraft {
  db().notes.set(note.caseId, note);
  return note;
}

export const noteHandlers = [
  http.get(apiUrl(P.caseNote), async ({ params }) => {
    await latency();
    return HttpResponse.json(db().notes.get(param(params.caseId)) ?? null);
  }),

  /** Draft-first streaming generation (text/event-stream). */
  http.post(apiUrl(P.caseNoteGenerate), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const detail = caseDetail(caseId);
    if (!detail) return notFound("Case");
    const state = db();
    const previous = state.notes.get(caseId);
    if (previous?.status === "signed") return apiError(409, "NOTE_ALREADY_SIGNED", "The note is already signed.");
    if (previous?.status === "streaming") return apiError(409, "NOTE_GENERATING", "A draft is already being generated.");
    if (!isPhaseAtLeast(detail.case.phase, "RECOVERY")) {
      return apiError(409, "NOTE_NOT_READY", "Record scope out and end the procedure before generating the note.");
    }

    const actor = actorFrom(request);
    const built = buildNote({
      procedureCase: detail.case,
      patient: detail.patient,
      events: detail.events,
      specimens: detail.specimens,
      anesthesia: detail.anesthesia,
    });
    const generatedAt = new Date().toISOString();
    const base: NoteDraft = {
      id: previous?.id ?? newId("note"),
      caseId,
      status: "streaming",
      sections: [],
      findings: built.findings,
      provenance: noteProvenance(generatedAt),
      gapChips: [],
      criticSuggestions: [],
      version: (previous?.version ?? 0) + 1,
    };
    saveNote(base);
    const encoder = new TextEncoder();
    let seq = 0;
    let cancelled = false;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: EventBody) => {
          seq += 1;
          const payload = { ...event, seq, ts: new Date().toISOString() };
          controller.enqueue(encoder.encode(`id: ${seq}\nevent: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          send({ type: "started", noteId: base.id, provenance: base.provenance });
          for (const section of built.sections) {
            const words = section.content.split(" ");
            for (let index = 0; index < words.length; index += WORDS_PER_DELTA) {
              if (cancelled) return;
              const delta = words.slice(index, index + WORDS_PER_DELTA).join(" ") + (index + WORDS_PER_DELTA < words.length ? " " : "");
              send({ type: "section_delta", sectionId: section.id, title: section.title, delta });
              await delay(DELTA_DELAY_MS);
            }
            send({ type: "section_complete", section });
            await delay(SECTION_PAUSE_MS);
          }
          if (cancelled) return;
          const draft = saveNote({ ...base, status: "draft", sections: built.sections });
          send({ type: "draft_ready", note: draft });
          for (const chip of built.gapChips) {
            await delay(ENRICH_DELAY_MS);
            send({ type: "gap_chip", chip });
          }
          for (const suggestion of built.criticSuggestions) {
            await delay(ENRICH_DELAY_MS);
            send({ type: "critic_suggestion", suggestion });
          }
          const suggestions = buildCodingSuggestions(detail.case, detail.patient, detail.specimens);
          const coding: CaseCoding = {
            caseId,
            status: "not_ready",
            suggestions,
            provenance: { agent: "coding", model: "Tier: deep (BAA-hosted)", promptVersion: "coding@1.6.0", generatedAt },
          };
          state.coding.set(caseId, coding);
          await delay(ENRICH_DELAY_MS);
          send({ type: "coding_ready", suggestionCount: suggestions.length });
          const final = saveNote({ ...draft, gapChips: built.gapChips, criticSuggestions: built.criticSuggestions });
          addWorkItem({
            type: "sign_note",
            title: `Sign procedure note ${detail.case.caseNumber}`,
            detail: `${built.gapChips.filter((chip) => chip.blocking).length} blocking gap(s).`,
            ownerRole: "SURGEON",
            priority: "high",
            dueAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
            caseId,
          });
          audit(actor, "note.generate", { type: "NoteDraft", id: final.id }, `AI draft v${final.version} generated (${final.provenance.promptVersion})`);
          send({ type: "completed", note: final });
          controller.close();
        } catch {
          // Client went away mid-stream; the cancel() hook restores state.
        }
      },
      cancel() {
        cancelled = true;
        if (previous) saveNote(previous);
        else state.notes.delete(caseId);
      },
    });

    return new HttpResponse(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }),

  http.put(apiUrl(P.caseNoteSection), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const result = editableNote(caseId);
    if (result.error) return result.error;
    const payload = await body<UpdateNoteSectionPayload>(request);
    const actor = actorFrom(request);
    const note = saveNote({
      ...result.note,
      version: result.note.version + 1,
      sections: result.note.sections.map((section) =>
        section.id === payload.sectionId ? { ...section, content: payload.content, source: "edited", editedBy: actor.ref } : section,
      ),
    });
    audit(actor, "note.edit", { type: "NoteDraft", id: note.id }, `Edited section ${payload.sectionId}`);
    return HttpResponse.json(note);
  }),

  http.post(apiUrl(P.caseNoteGapResolve), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const result = editableNote(caseId);
    if (result.error) return result.error;
    const payload = await body<ResolveGapChipPayload>(request);
    const chip = result.note.gapChips.find((item) => item.id === payload.chipId);
    if (!chip) return notFound("Gap chip");
    const actor = actorFrom(request);
    const note = saveNote({
      ...result.note,
      version: result.note.version + 1,
      gapChips: result.note.gapChips.map((item) => (item.id === chip.id ? { ...item, resolved: true, resolution: payload.resolution } : item)),
      sections:
        payload.sectionContent === undefined
          ? result.note.sections
          : result.note.sections.map((section) =>
              section.id === chip.sectionId ? { ...section, content: payload.sectionContent ?? section.content, source: "edited", editedBy: actor.ref } : section,
            ),
    });
    audit(actor, "note.gap.resolve", { type: "NoteDraft", id: note.id }, `Resolved gap ${chip.id}`);
    return HttpResponse.json(note);
  }),

  http.post(apiUrl(P.caseNoteCritic), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const result = editableNote(caseId);
    if (result.error) return result.error;
    const payload = await body<UpdateCriticSuggestionPayload>(request);
    const suggestion = result.note.criticSuggestions.find((item) => item.id === payload.suggestionId);
    if (!suggestion) return notFound("Suggestion");
    const actor = actorFrom(request);
    const apply = payload.status === "accepted" && suggestion.suggestedText !== undefined;
    const note = saveNote({
      ...result.note,
      version: result.note.version + 1,
      criticSuggestions: result.note.criticSuggestions.map((item) => (item.id === suggestion.id ? { ...item, status: payload.status } : item)),
      sections: apply
        ? result.note.sections.map((section) =>
            section.id === suggestion.sectionId ? { ...section, content: suggestion.suggestedText ?? section.content, source: "edited", editedBy: actor.ref } : section,
          )
        : result.note.sections,
    });
    audit(actor, "note.critic", { type: "NoteDraft", id: note.id }, `Critic suggestion ${payload.status}`);
    return HttpResponse.json(note);
  }),

  http.post(apiUrl(P.caseNoteSign), async ({ params, request }) => {
    await latency();
    const caseId = param(params.caseId);
    const state = db();
    const current = state.notes.get(caseId) ?? null;
    const actor = actorFrom(request);
    const gate = signGate(current);
    if (!current || !gate.ok) {
      audit(actor, "note.sign", { type: "NoteDraft", id: current?.id ?? caseId }, `Sign blocked (${gate.reasons[0]?.code ?? "rule"})`, "denied");
      return gateFailed(gate);
    }
    const note = saveNote({ ...current, status: "signed", signedBy: actor.ref, signedAt: new Date().toISOString(), version: current.version + 1 });
    completeWorkItems((item) => item.caseId === caseId && item.type === "sign_note");
    const coding = state.coding.get(caseId);
    if (coding) state.coding.set(caseId, { ...coding, status: "in_review" });
    const caseNumber = state.cases.get(caseId)?.caseNumber ?? caseId;
    addWorkItem({
      type: "coding",
      title: `Code case ${caseNumber}`,
      detail: `${coding?.suggestions.length ?? 0} AI suggestions ready for review.`,
      ownerRole: "ADMIN",
      priority: "normal",
      dueAt: new Date(Date.now() + 24 * 3_600_000).toISOString(),
      caseId,
    });
    audit(actor, "note.sign", { type: "NoteDraft", id: note.id }, `Signed procedure note v${note.version}`);
    autoAdvance(caseId, actor);
    return HttpResponse.json(note);
  }),
];
