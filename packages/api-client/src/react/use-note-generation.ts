import { useQueryClient } from "@tanstack/react-query";
import { useReducer, useRef } from "react";
import type { NoteDraft, NoteSectionId, NoteStreamEvent } from "@asc/types";
import { ApiError } from "../http";
import { streamNoteGeneration } from "../clinical/note";
import { invalidateClinical } from "./mutation";
import { queryKeys } from "./query-keys";

type GenerationStatus = "idle" | "streaming" | "draft_ready" | "completed" | "failed" | "cancelled";

interface StreamedSection {
  readonly id: NoteSectionId;
  readonly title: string;
  readonly content: string;
  readonly complete: boolean;
}

interface GenerationState {
  readonly status: GenerationStatus;
  /** Sections in arrival order with the text streamed so far. */
  readonly sections: readonly StreamedSection[];
  /** Latest full note (from draft_ready, enriched by gap/critic events, then completed). */
  readonly note: NoteDraft | null;
  readonly codingSuggestionCount: number | null;
  readonly error: string | null;
  readonly startedAt: number | null;
}

type Action =
  | { readonly type: "start"; readonly at: number }
  | { readonly type: "event"; readonly event: NoteStreamEvent }
  | { readonly type: "cancel" }
  | { readonly type: "error"; readonly message: string };

const INITIAL: GenerationState = {
  status: "idle",
  sections: [],
  note: null,
  codingSuggestionCount: null,
  error: null,
  startedAt: null,
};

function upsertSection(sections: readonly StreamedSection[], next: StreamedSection): readonly StreamedSection[] {
  return sections.some((section) => section.id === next.id)
    ? sections.map((section) => (section.id === next.id ? next : section))
    : [...sections, next];
}

function applyEvent(state: GenerationState, event: NoteStreamEvent): GenerationState {
  switch (event.type) {
    case "section_delta": {
      const current = state.sections.find((section) => section.id === event.sectionId);
      return {
        ...state,
        sections: upsertSection(state.sections, {
          id: event.sectionId,
          title: event.title,
          content: (current?.content ?? "") + event.delta,
          complete: false,
        }),
      };
    }
    case "section_complete":
      return {
        ...state,
        sections: upsertSection(state.sections, { ...event.section, complete: true }),
      };
    case "draft_ready":
      return { ...state, status: "draft_ready", note: event.note };
    case "gap_chip":
      return state.note ? { ...state, note: { ...state.note, gapChips: [...state.note.gapChips, event.chip] } } : state;
    case "critic_suggestion":
      return state.note
        ? { ...state, note: { ...state.note, criticSuggestions: [...state.note.criticSuggestions, event.suggestion] } }
        : state;
    case "coding_ready":
      return { ...state, codingSuggestionCount: event.suggestionCount };
    case "completed":
      return { ...state, status: "completed", note: event.note };
    case "failed":
      return { ...state, status: "failed", error: event.message };
    default:
      return state;
  }
}

function reducer(state: GenerationState, action: Action): GenerationState {
  switch (action.type) {
    case "start":
      return { ...INITIAL, status: "streaming", startedAt: action.at };
    case "event":
      return applyEvent(state, action.event);
    case "cancel":
      return state.status === "streaming" || state.status === "draft_ready" ? { ...state, status: "cancelled" } : state;
    case "error":
      return { ...state, status: "failed", error: action.message };
  }
}

/**
 * Streams AI note generation for a case (draft-first). `start()` begins, `cancel()` aborts;
 * on `completed` the note query is updated and clinical queries are invalidated.
 * Cancel on unmount by calling `cancel()` from the owner if needed (navigation aborts are harmless).
 */
export function useNoteGeneration(caseId: string) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const controllerRef = useRef<AbortController | null>(null);

  const start = async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    dispatch({ type: "start", at: Date.now() });
    try {
      await streamNoteGeneration(
        caseId,
        (event) => {
          dispatch({ type: "event", event });
          if (event.type === "completed") queryClient.setQueryData(queryKeys.cases.note(caseId), event.note);
        },
        controller.signal,
      );
      if (!controller.signal.aborted) await invalidateClinical(queryClient);
    } catch (error) {
      dispatch({ type: "error", message: error instanceof ApiError ? error.message : "Note generation failed." });
    }
  };

  const cancel = () => {
    controllerRef.current?.abort();
    dispatch({ type: "cancel" });
  };

  return { ...state, isStreaming: state.status === "streaming" || state.status === "draft_ready", start, cancel };
}
