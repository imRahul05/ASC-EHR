"use client";

import { useEffect, useReducer, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { ClipboardList, FileText, HeartPulse, Inbox, MonitorDot, Receipt } from "@asc/ui/icons";
import { OPEN_CHAPTER_EVENT } from "./landing-journey";

/** Chapter ids match the `chapter` values in `JOURNEY_STOPS` (landing-journey.ts). */
export const SCENES_CONFIG = [
  { id: "referral", step: "01", label: "Intake & OCR", icon: Inbox },
  { id: "preop", step: "02", label: "Pre-Op Gate", icon: ClipboardList },
  { id: "procedure", step: "03", label: "Procedure Room", icon: MonitorDot },
  { id: "note", step: "04", label: "AI Note Draft", icon: FileText },
  { id: "pacu", step: "05", label: "PACU Recovery", icon: HeartPulse },
  { id: "coding", step: "06", label: "Coding & Claim", icon: Receipt },
] as const;

export const TOTAL_SCENES = SCENES_CONFIG.length;
export const SCENE_DURATION_MS = 5000;
export const TOTAL_DURATION_MS = TOTAL_SCENES * SCENE_DURATION_MS; // 30,000 ms
const TICK_MS = 100;

interface PlayerState {
  readonly elapsedMs: number;
  readonly speed: 1 | 1.5;
  /** Explicit user choice; null = default (autoplay unless reduced motion, paused while hovered/focused). */
  readonly userPlay: boolean | null;
  readonly hovered: boolean;
  readonly focused: boolean;
}

type PlayerAction =
  | { readonly type: "TICK"; readonly deltaMs: number }
  | { readonly type: "SET_PLAY"; readonly playing: boolean }
  | { readonly type: "SET_SCENE"; readonly index: number }
  | { readonly type: "STEP_SCENE"; readonly by: 1 | -1 }
  | { readonly type: "SEEK"; readonly ms: number }
  | { readonly type: "REPLAY" }
  | { readonly type: "TOGGLE_SPEED" }
  | { readonly type: "ENGAGE"; readonly source: "hovered" | "focused"; readonly value: boolean };

const INITIAL_STATE: PlayerState = { elapsedMs: 0, speed: 1, userPlay: null, hovered: false, focused: false };

const clampScene = (index: number) => Math.max(0, Math.min(TOTAL_SCENES - 1, index));
const sceneOf = (elapsedMs: number) => clampScene(Math.floor(elapsedMs / SCENE_DURATION_MS));

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "TICK":
      return { ...state, elapsedMs: (state.elapsedMs + action.deltaMs * state.speed) % TOTAL_DURATION_MS };
    case "SET_PLAY":
      return { ...state, userPlay: action.playing };
    case "SET_SCENE":
      return { ...state, elapsedMs: clampScene(action.index) * SCENE_DURATION_MS };
    case "STEP_SCENE": {
      const target = (sceneOf(state.elapsedMs) + action.by + TOTAL_SCENES) % TOTAL_SCENES;
      return { ...state, elapsedMs: target * SCENE_DURATION_MS };
    }
    case "SEEK":
      return { ...state, elapsedMs: Math.max(0, Math.min(TOTAL_DURATION_MS - 1, action.ms)) };
    case "REPLAY":
      return { ...state, elapsedMs: 0, userPlay: true };
    case "TOGGLE_SPEED":
      return { ...state, speed: state.speed === 1 ? 1.5 : 1 };
    case "ENGAGE":
      return state[action.source] === action.value ? state : { ...state, [action.source]: action.value };
    default:
      return state;
  }
}

/** Media query / visibility subscriptions: external state → useSyncExternalStore (LM-003). */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function subscribeVisibility(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribeReducedMotion, () => window.matchMedia(REDUCED_MOTION_QUERY).matches, () => false);
}

function usePageVisible() {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => true);
}

/** True while the element intersects the viewport (IntersectionObserver is the external system). */
function useInViewport(ref: RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry?.isIntersecting ?? false));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return inView;
}

/** Advances the timeline only while `active`; no timer runs otherwise. */
function usePlaybackClock(active: boolean, dispatch: (action: PlayerAction) => void) {
  useEffect(() => {
    if (!active) return;
    let last = performance.now();
    const interval = setInterval(() => {
      const now = performance.now();
      dispatch({ type: "TICK", deltaMs: now - last });
      last = now;
    }, TICK_MS);
    return () => clearInterval(interval);
  }, [active, dispatch]);
}

/** Jumps to a chapter when another landing section calls `openChapter(id)`. */
function useOpenChapterEvent(dispatch: (action: PlayerAction) => void) {
  useEffect(() => {
    const onOpen = (event: Event) => {
      const chapter: unknown = event instanceof CustomEvent ? event.detail : undefined;
      const index = SCENES_CONFIG.findIndex((scene) => scene.id === chapter);
      if (index >= 0) dispatch({ type: "SET_SCENE", index });
    };
    window.addEventListener(OPEN_CHAPTER_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_CHAPTER_EVENT, onOpen);
  }, [dispatch]);
}

/**
 * Walkthrough player state. `isPlaying` is the user's intent (autoplay by default, off for reduced motion);
 * `isHeld` means autoplay is paused because the pointer or focus is inside the player.
 */
export function useProductPlayer() {
  const [state, dispatch] = useReducer(playerReducer, INITIAL_STATE);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const reducedMotion = usePrefersReducedMotion();
  const pageVisible = usePageVisible();
  const inView = useInViewport(rootRef);

  const isPlaying = state.userPlay ?? !reducedMotion;
  const isHeld = state.userPlay === null && isPlaying && (state.hovered || state.focused);
  const isRunning = isPlaying && !isHeld;

  usePlaybackClock(isRunning && inView && pageVisible, dispatch);
  useOpenChapterEvent(dispatch);

  const sceneIndex = sceneOf(state.elapsedMs);
  // Reduced motion: scenes render in their final state instead of animating in.
  const sceneProgress = reducedMotion ? 1 : (state.elapsedMs % SCENE_DURATION_MS) / SCENE_DURATION_MS;

  return { state, dispatch, rootRef, sceneIndex, sceneProgress, isPlaying, isHeld, isRunning };
}
