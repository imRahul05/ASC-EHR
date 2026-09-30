"use client";

import { useEffect, useReducer, useRef } from "react";
import { Button } from "@asc/ui";
import {
  FastForward,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
} from "@asc/ui/icons";
import {
  AiNoteScene,
  CodingScene,
  PacuScene,
  PreOpScene,
  ProcedureScene,
  ReferralScene,
} from "./player-scenes";

interface PlayerState {
  readonly sceneIndex: number;
  readonly isPlaying: boolean;
  readonly elapsedMs: number;
  readonly speed: 1 | 1.5;
}

type PlayerAction =
  | { readonly type: "TICK"; readonly deltaMs: number }
  | { readonly type: "TOGGLE_PLAY" }
  | { readonly type: "SET_SCENE"; readonly index: number }
  | { readonly type: "NEXT_SCENE" }
  | { readonly type: "PREV_SCENE" }
  | { readonly type: "REPLAY" }
  | { readonly type: "TOGGLE_SPEED" };

const TOTAL_SCENES = 6;
const SCENE_DURATION_MS = 5000;
const TOTAL_DURATION_MS = TOTAL_SCENES * SCENE_DURATION_MS; // 30,000 ms

const SCENES_CONFIG = [
  { id: "referral", step: "01", label: "Intake & OCR", phase: "SCHEDULED" },
  { id: "preop", step: "02", label: "Pre-Op Gate", phase: "READY_FOR_PROCEDURE" },
  { id: "procedure", step: "03", label: "Procedure Room", phase: "IN_PROCEDURE" },
  { id: "note", step: "04", label: "AI Note Draft", phase: "IN_PROCEDURE" },
  { id: "pacu", step: "05", label: "PACU Recovery", phase: "RECOVERY" },
  { id: "coding", step: "06", label: "Coding & Claim", phase: "CODED" },
] as const;

const INITIAL_STATE: PlayerState = {
  sceneIndex: 0,
  isPlaying: true,
  elapsedMs: 0,
  speed: 1,
};

function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "TICK": {
      if (!state.isPlaying) return state;
      const nextElapsed = (state.elapsedMs + action.deltaMs * state.speed) % TOTAL_DURATION_MS;
      const nextScene = Math.floor(nextElapsed / SCENE_DURATION_MS) % TOTAL_SCENES;
      return {
        ...state,
        elapsedMs: nextElapsed,
        sceneIndex: nextScene,
      };
    }
    case "TOGGLE_PLAY":
      return { ...state, isPlaying: !state.isPlaying };
    case "SET_SCENE": {
      const targetScene = Math.max(0, Math.min(TOTAL_SCENES - 1, action.index));
      return {
        ...state,
        sceneIndex: targetScene,
        elapsedMs: targetScene * SCENE_DURATION_MS,
      };
    }
    case "NEXT_SCENE": {
      const targetScene = (state.sceneIndex + 1) % TOTAL_SCENES;
      return {
        ...state,
        sceneIndex: targetScene,
        elapsedMs: targetScene * SCENE_DURATION_MS,
      };
    }
    case "PREV_SCENE": {
      const targetScene = (state.sceneIndex - 1 + TOTAL_SCENES) % TOTAL_SCENES;
      return {
        ...state,
        sceneIndex: targetScene,
        elapsedMs: targetScene * SCENE_DURATION_MS,
      };
    }
    case "REPLAY":
      return {
        ...state,
        sceneIndex: 0,
        elapsedMs: 0,
        isPlaying: true,
      };
    case "TOGGLE_SPEED":
      return {
        ...state,
        speed: state.speed === 1 ? 1.5 : 1,
      };
    default:
      return state;
  }
}

/**
 * An interactive, video-like animated clinical walkthrough of the endoscopy case journey.
 * Built with @asc/ui primitives and clean reducer timing (LM-003, LM-008).
 */
export function ProductMock() {
  const [state, dispatch] = useReducer(playerReducer, INITIAL_STATE);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      dispatch({ type: "TICK", deltaMs: 100 });
    }, 100);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        dispatch({ type: "TOGGLE_PLAY" });
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        dispatch({ type: "NEXT_SCENE" });
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        dispatch({ type: "PREV_SCENE" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const sceneProgress = (state.elapsedMs % SCENE_DURATION_MS) / SCENE_DURATION_MS;
  const totalSeconds = Math.floor(state.elapsedMs / 1000);
  const formattedTime = `00:${String(totalSeconds).padStart(2, "0")} / 00:30`;
  const currentSceneConfig = SCENES_CONFIG[state.sceneIndex] ?? SCENES_CONFIG[0];

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-lg select-none transition-all"
      data-testid="landing-product-mock"
      role="region"
      aria-label="Interactive EHR simulation walkthrough"
    >
      {/* Top OS Window Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-500/80" />
            <span className="size-2.5 rounded-full bg-amber-500/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            <span className={`size-1.5 rounded-full ${state.isPlaying ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            Live Case Walkthrough · Daniel Ortiz (Colonoscopy)
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          <Search className="size-3" /> Jump to patient, case or screen <span className="ml-2 font-mono">⌘K</span>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_SPEED" })}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
            title="Toggle playback speed"
          >
            <FastForward className="size-3 text-primary" /> {state.speed}x
          </button>
        </div>
      </div>

      {/* Video Phase Chapters / Stepper Navigation */}
      <div className="flex overflow-x-auto border-b border-border bg-card/60 px-2 py-1.5 text-xs scrollbar-none">
        <div className="flex min-w-full gap-1.5 sm:gap-2">
          {SCENES_CONFIG.map((scene, idx) => {
            const isActive = idx === state.sceneIndex;
            const isCompleted = idx < state.sceneIndex;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => dispatch({ type: "SET_SCENE", index: idx })}
                className={`relative flex-1 min-w-[80px] rounded-lg px-2.5 py-1.5 text-left transition-all cursor-pointer ${
                  isActive
                    ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                    : isCompleted
                      ? "text-foreground hover:bg-muted/50"
                      : "text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span className="font-mono">{scene.step}</span>
                  {isActive && <span className="size-1 rounded-full bg-primary" />}
                </div>
                <div className="truncate text-xs">{scene.label}</div>

                {/* Micro Progress Line on active scene */}
                {isActive && (
                  <div className="absolute bottom-0 inset-x-1 h-0.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-100 ease-linear"
                      style={{ width: `${Math.min(100, sceneProgress * 100)}%` }}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Simulated Scene Viewport */}
      <div className="p-4 sm:p-5 min-h-[360px] bg-background/50">
        {state.sceneIndex === 0 && <ReferralScene progress={sceneProgress} />}
        {state.sceneIndex === 1 && <PreOpScene progress={sceneProgress} />}
        {state.sceneIndex === 2 && <ProcedureScene progress={sceneProgress} />}
        {state.sceneIndex === 3 && <AiNoteScene progress={sceneProgress} />}
        {state.sceneIndex === 4 && <PacuScene progress={sceneProgress} />}
        {state.sceneIndex === 5 && <CodingScene progress={sceneProgress} />}
      </div>

      {/* Interactive Bottom Video Player Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-border bg-card/90 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => dispatch({ type: "TOGGLE_PLAY" })}
            className="h-8 px-2.5 gap-1.5 font-medium cursor-pointer"
            aria-label={state.isPlaying ? "Pause simulation" : "Play simulation"}
          >
            {state.isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
            <span>{state.isPlaying ? "Pause" : "Play"}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "PREV_SCENE" })}
            className="size-8 p-0 cursor-pointer"
            title="Previous chapter"
          >
            <SkipBack className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "NEXT_SCENE" })}
            className="size-8 p-0 cursor-pointer"
            title="Next chapter"
          >
            <SkipForward className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "REPLAY" })}
            className="size-8 p-0 cursor-pointer"
            title="Replay from start"
          >
            <RotateCcw className="size-3.5" />
          </Button>

          <span className="font-mono text-[11px] text-muted-foreground pl-1">{formattedTime}</span>
        </div>

        {/* Timeline Scrubber Bar */}
        <div className="flex-1 mx-2 relative flex items-center">
          <div
            className="w-full h-1.5 rounded-full bg-muted overflow-hidden cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              const targetScene = Math.floor(ratio * TOTAL_SCENES);
              dispatch({ type: "SET_SCENE", index: targetScene });
            }}
          >
            <div
              className="h-full bg-primary transition-all duration-100 ease-linear rounded-full"
              style={{ width: `${Math.min(100, (state.elapsedMs / TOTAL_DURATION_MS) * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
          <span className="hidden md:inline font-medium text-foreground">{currentSceneConfig.label}</span>
          <span className="hidden lg:inline">· Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">Space</kbd> to toggle</span>
        </div>
      </div>
    </div>
  );
}
