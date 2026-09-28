"use client";

import { useSyncExternalStore } from "react";

/**
 * Onboarding UI state. Persisted part = non-sensitive UI flags only (LM-004): whether the welcome was seen,
 * tour status, which tour step ids are done, which hint strips are hidden. Never PHI, tokens or profiles.
 * The help sheet's open flag is in-memory only.
 */
type TourStatus = "idle" | "active" | "dismissed";

interface PersistedGuide {
  readonly welcomeSeen: boolean;
  readonly tour: TourStatus;
  readonly collapsed: boolean;
  readonly done: readonly string[];
  readonly hiddenHints: readonly string[];
}

interface GuideState extends PersistedGuide {
  readonly helpOpen: boolean;
  readonly welcomeOpen: boolean;
}

const STORAGE_KEY = "asc-ehr.guide.v1";

const DEFAULTS: PersistedGuide = { welcomeSeen: false, tour: "idle", collapsed: false, done: [], hiddenHints: [] };

/** Server render and first paint: behave as "already seen" so nothing flashes before storage is read. */
const SERVER_STATE: GuideState = { ...DEFAULTS, welcomeSeen: true, helpOpen: false, welcomeOpen: false };

const TOUR_STATUSES: readonly TourStatus[] = ["idle", "active", "dismissed"];

const stringList = (value: unknown): readonly string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50) : [];

function readStorage(): PersistedGuide {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULTS;
    const record = parsed as Record<string, unknown>;
    return {
      welcomeSeen: record.welcomeSeen === true,
      tour: TOUR_STATUSES.find((status) => status === record.tour) ?? "idle",
      collapsed: record.collapsed === true,
      done: stringList(record.done),
      hiddenHints: stringList(record.hiddenHints),
    };
  } catch {
    return DEFAULTS;
  }
}

function writeStorage({ welcomeSeen, tour, collapsed, done, hiddenHints }: GuideState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ welcomeSeen, tour, collapsed, done, hiddenHints }));
  } catch {
    // Storage blocked (private mode, quota): the guide still works for this session.
  }
}

let state: GuideState | null = null;
const listeners = new Set<() => void>();

function current(): GuideState {
  state ??= { ...readStorage(), helpOpen: false, welcomeOpen: false };
  return state;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Merge a patch (or a function of the current state) and persist the UI flags. */
export function updateGuide(patch: Partial<GuideState> | ((prev: GuideState) => Partial<GuideState>)): void {
  const prev = current();
  state = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
  writeStorage(state);
  listeners.forEach((listener) => listener());
}

export function useGuideState(): GuideState {
  return useSyncExternalStore(subscribe, current, () => SERVER_STATE);
}

/* ─── Commands (event handlers call these) ─────────────────────────────── */

export const openHelp = () => updateGuide({ helpOpen: true });
export const closeHelp = () => updateGuide({ helpOpen: false });
export const showWelcome = () => updateGuide({ welcomeOpen: true, helpOpen: false });

export const startTour = (restart = false) =>
  updateGuide((prev) => ({
    tour: "active",
    collapsed: false,
    welcomeSeen: true,
    welcomeOpen: false,
    helpOpen: false,
    done: restart ? [] : prev.done,
  }));

export const skipWelcome = () => updateGuide({ welcomeSeen: true, welcomeOpen: false });
export const dismissTour = () => updateGuide({ tour: "dismissed" });
export const setTourCollapsed = (collapsed: boolean) => updateGuide({ collapsed });

export const setStepDone = (stepId: string, done: boolean) =>
  updateGuide((prev) => ({ done: done ? [...new Set([...prev.done, stepId])] : prev.done.filter((id) => id !== stepId) }));

export const markStepsDone = (stepIds: readonly string[]) =>
  updateGuide((prev) => ({ done: [...new Set([...prev.done, ...stepIds])] }));

export const hideHint = (hintId: string) => updateGuide((prev) => ({ hiddenHints: [...new Set([...prev.hiddenHints, hintId])] }));
export const showAllHints = () => updateGuide({ hiddenHints: [] });
