"use client";

import type { FocusEvent, KeyboardEvent } from "react";
import { Button } from "@asc/ui/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@asc/ui/components/ui/tooltip";
import { cn } from "@asc/ui/lib/utils";
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
import { SCENE_DURATION_MS, SCENES_CONFIG, TOTAL_DURATION_MS, useProductPlayer } from "./product-mock-player";

/** Same order as SCENES_CONFIG. */
const SCENE_COMPONENTS = [ReferralScene, PreOpScene, ProcedureScene, AiNoteScene, PacuScene, CodingScene] as const;
const TOTAL_SECONDS = TOTAL_DURATION_MS / 1000;

const PLAYER_KEYS: Readonly<Record<string, "toggle" | "next" | "prev">> = {
  " ": "toggle",
  ArrowRight: "next",
  ArrowLeft: "prev",
};

const formatSeconds = (seconds: number) => `00:${String(seconds).padStart(2, "0")}`;

/** Space clicks a focused button and arrows move the range input; let those elements keep their own keys. */
function ownsKey(target: EventTarget, key: string): boolean {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  return key === " " && target instanceof HTMLElement && target.closest("button, a") !== null;
}

/**
 * An interactive, video-like animated clinical walkthrough of the endoscopy case journey.
 * Keys (Space, ←, →) act only while focus is inside the player; autoplay pauses while it is hovered or
 * focused, stops ticking offscreen or in a hidden tab, and is off for reduced-motion users.
 */
export function ProductMock() {
  const { state, dispatch, rootRef, sceneIndex, sceneProgress, isHeld, isRunning } = useProductPlayer();

  const togglePlay = () => dispatch({ type: "SET_PLAY", playing: !isRunning });
  const selectScene = (index: number) => dispatch({ type: "SET_SCENE", index });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || !Object.hasOwn(PLAYER_KEYS, event.key)) return;
    if (ownsKey(event.target, event.key)) return;
    event.preventDefault();
    const action = PLAYER_KEYS[event.key];
    if (action === "toggle") togglePlay();
    else dispatch({ type: "STEP_SCENE", by: action === "next" ? 1 : -1 });
  };

  // Only keyboard focus holds autoplay; a mouse click would otherwise keep it paused after the pointer leaves.
  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    if (event.target.matches(":focus-visible")) dispatch({ type: "ENGAGE", source: "focused", value: true });
  };

  const handleBlur =(event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) dispatch({ type: "ENGAGE", source: "focused", value: false });
  };

  const elapsedSeconds = Math.floor(state.elapsedMs / 1000);
  const currentScene = SCENES_CONFIG[sceneIndex] ?? SCENES_CONFIG[0];
  const Scene = SCENE_COMPONENTS[sceneIndex] ?? ReferralScene;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerEnter={() => dispatch({ type: "ENGAGE", source: "hovered", value: true })}
      onPointerLeave={() => dispatch({ type: "ENGAGE", source: "hovered", value: false })}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className="relative overflow-hidden rounded-2xl border border-border bg-background shadow-lg select-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      data-testid="landing-product-mock"
      role="region"
      aria-roledescription="walkthrough player"
      aria-label="Interactive EHR simulation walkthrough"
      aria-keyshortcuts="Space ArrowLeft ArrowRight"
    >
      {/* Top OS Window Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-rose-500/80" />
            <span className="size-2.5 rounded-full bg-amber-500/80" />
            <span className="size-2.5 rounded-full bg-emerald-500/80" />
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-0.5 text-[11px] font-medium text-foreground">
            {/* Live dot: pulsing while playing, amber while held by hover/focus, grey when paused */}
            <span
              aria-hidden
              title={isHeld ? "Paused while you explore" : undefined}
              className={cn(
                "size-1.5 shrink-0 rounded-full transition-colors",
                isRunning ? "bg-emerald-500 animate-pulse" : isHeld ? "bg-amber-500" : "bg-muted-foreground",
              )}
            />
            <span className="truncate">Live Case Walkthrough · Daniel Ortiz (Colonoscopy)</span>
          </span>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground">
          <Search className="size-3" /> Jump to patient, case or screen <span className="ml-2 font-mono">⌘K</span>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => dispatch({ type: "TOGGLE_SPEED" })}
            className="flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Playback speed ${state.speed}x`}
            title="Toggle playback speed"
            data-testid="landing-player-speed"
          >
            <FastForward className="size-3 text-primary" /> {state.speed}x
          </button>
        </div>
      </div>

      <div className="flex">
        {/* App sidebar rail: each icon opens its chapter */}
        <nav aria-label="Walkthrough screens" className="hidden w-12 shrink-0 flex-col items-center gap-2 border-r border-border bg-card/40 py-3 sm:flex">
          {SCENES_CONFIG.map((scene, idx) => {
            const isActive = idx === sceneIndex;
            const Icon = scene.icon;
            return (
              <Tooltip key={scene.id}>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => selectScene(idx)}
                      aria-label={`${scene.label} (chapter ${scene.step})`}
                      aria-current={isActive ? "step" : undefined}
                      className={cn(
                        "rounded-md p-1.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        isActive ? "bg-accent text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )}
                      data-testid={`landing-player-rail-${scene.id}`}
                    >
                      <Icon className="size-4" aria-hidden />
                    </button>
                  }
                />
                <TooltipContent side="right">{scene.label}</TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {/* Video Phase Chapters / Stepper Navigation */}
          <div className="flex overflow-x-auto border-b border-border bg-card/60 px-2 py-1.5 text-xs scrollbar-none">
            <div className="flex min-w-full gap-1.5 sm:gap-2">
              {SCENES_CONFIG.map((scene, idx) => {
                const isActive = idx === sceneIndex;
                const isCompleted = idx < sceneIndex;
                return (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => selectScene(idx)}
                    aria-current={isActive ? "step" : undefined}
                    className={cn(
                      "relative flex-1 min-w-[80px] rounded-lg px-2.5 py-1.5 text-left transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      isActive
                        ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                        : isCompleted
                          ? "text-foreground hover:bg-muted/50"
                          : "text-muted-foreground hover:bg-muted/40",
                    )}
                    data-testid={`landing-player-chapter-${scene.id}`}
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
                          className="h-full bg-primary transition-[width] duration-100 ease-linear"
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
            <Scene progress={sceneProgress} />
          </div>
        </div>
      </div>

      {/* Interactive Bottom Video Player Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-border bg-card/90 px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={togglePlay}
            className="h-8 px-2.5 gap-1.5 font-medium cursor-pointer"
            aria-label={isRunning ? "Pause simulation" : "Play simulation"}
            data-testid="landing-player-play"
          >
            {isRunning ? <Pause className="size-3.5" /> : <Play className="size-3.5 fill-current" />}
            <span>{isRunning ? "Pause" : "Play"}</span>
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "STEP_SCENE", by: -1 })}
            className="size-8 p-0 cursor-pointer"
            aria-label="Previous chapter"
            title="Previous chapter"
          >
            <SkipBack className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "STEP_SCENE", by: 1 })}
            className="size-8 p-0 cursor-pointer"
            aria-label="Next chapter"
            title="Next chapter"
          >
            <SkipForward className="size-3.5" />
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => dispatch({ type: "REPLAY" })}
            className="size-8 p-0 cursor-pointer"
            aria-label="Replay from start"
            title="Replay from start"
          >
            <RotateCcw className="size-3.5" />
          </Button>

          <span className="font-mono text-[11px] text-muted-foreground pl-1">
            {formatSeconds(elapsedSeconds)} / {formatSeconds(TOTAL_SECONDS)}
          </span>
        </div>

        {/* Timeline scrubber: a native range input laid over the progress track (pointer, keyboard and AT) */}
        <div className="relative flex h-6 flex-1 items-center rounded-full sm:mx-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
          <div aria-hidden className="pointer-events-none relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-100 ease-linear"
              style={{ width: `${Math.min(100, (state.elapsedMs / TOTAL_DURATION_MS) * 100)}%` }}
            />
            {SCENES_CONFIG.slice(1).map((scene, idx) => (
              <span
                key={scene.id}
                className="absolute inset-y-0 w-px bg-background/70"
                style={{ left: `${(((idx + 1) * SCENE_DURATION_MS) / TOTAL_DURATION_MS) * 100}%` }}
              />
            ))}
          </div>
          <input
            type="range"
            min={0}
            max={TOTAL_SECONDS - 1}
            step={1}
            value={elapsedSeconds}
            onChange={(event) => dispatch({ type: "SEEK", ms: Number(event.target.value) * 1000 })}
            aria-label="Walkthrough timeline"
            aria-valuetext={`${formatSeconds(elapsedSeconds)} of ${formatSeconds(TOTAL_SECONDS)}, chapter ${currentScene.step}: ${currentScene.label}`}
            className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
            data-testid="landing-player-scrubber"
          />
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
          <span className="hidden md:inline font-medium text-foreground">{currentScene.label}</span>
          <span className="hidden lg:inline">
            · Press <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground">Space</kbd> to toggle
          </span>
        </div>
      </div>
    </div>
  );
}
