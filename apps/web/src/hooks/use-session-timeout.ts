"use client";

import { useEffect, useRef } from "react";
import { toast } from "@asc/ui/components/ui/sonner";
import { useAuthStore } from "../lib/stores/auth.store";
import { useAuth } from "./use-auth";

export const DEFAULT_IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes (M12-3)
export const DEFAULT_ABSOLUTE_TIMEOUT_MS = 12 * 60 * 60 * 1000; // 12 hours (M12-3)
export const DEFAULT_CHECK_INTERVAL_MS = 15 * 1000; // 15 seconds

type SessionTimeoutReason = "idle" | "absolute";

interface SessionActivityTrackerOptions {
  readonly idleTimeoutMs?: number;
  readonly absoluteTimeoutMs?: number;
  readonly sessionStartedAt: number | null;
  readonly onTimeout: (reason: SessionTimeoutReason) => void;
  readonly now?: () => number;
  readonly getLastActivityAt?: () => number;
  readonly setLastActivityAt?: (time: number) => void;
}

interface SessionActivityTracker {
  readonly recordActivity: () => void;
  readonly check: () => void;
  readonly isTimedOut: () => boolean;
}

export function createSessionActivityTracker(
  options: SessionActivityTrackerOptions,
): SessionActivityTracker {
  let timedOut = false;
  const getNow = options.now ?? (() => Date.now());
  let internalLastActivityAt = getNow();
  const readLastActivity = options.getLastActivityAt ?? (() => internalLastActivityAt);
  const writeLastActivity =
    options.setLastActivityAt ??
    ((time: number) => {
      internalLastActivityAt = time;
    });

  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const absoluteTimeoutMs = options.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
  const sessionStartedAt = options.sessionStartedAt;
  const onTimeout = options.onTimeout;

  return {
    recordActivity: () => {
      if (timedOut) return;
      writeLastActivity(getNow());
    },
    check: () => {
      if (timedOut) return;
      const currentTime = getNow();
      const idleElapsed = currentTime - readLastActivity();
      if (idleElapsed >= idleTimeoutMs) {
        timedOut = true;
        onTimeout("idle");
        return;
      }
      if (sessionStartedAt !== null) {
        const absoluteElapsed = currentTime - sessionStartedAt;
        if (absoluteElapsed >= absoluteTimeoutMs) {
          timedOut = true;
          onTimeout("absolute");
        }
      }
    },
    isTimedOut: () => timedOut,
  };
}

interface SessionTimeoutOptions {
  readonly idleTimeoutMs?: number;
  readonly absoluteTimeoutMs?: number;
  readonly checkIntervalMs?: number;
  readonly onTimeout?: (reason: SessionTimeoutReason) => void;
}

const ACTIVITY_EVENTS: readonly (keyof WindowEventMap)[] = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
];

export function useSessionTimeout(options: SessionTimeoutOptions = {}) {
  const {
    idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
    absoluteTimeoutMs = DEFAULT_ABSOLUTE_TIMEOUT_MS,
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    onTimeout,
  } = options;

  const { isAuthenticated, logout } = useAuth();
  const sessionStartedAt = useAuthStore((state) => state.sessionStartedAt);

  const optionsRef = useRef({
    idleTimeoutMs,
    absoluteTimeoutMs,
    checkIntervalMs,
    onTimeout,
    logout,
  });

  const lastActivityRef = useRef<number | null>(null);

  useEffect(() => {
    optionsRef.current = {
      idleTimeoutMs,
      absoluteTimeoutMs,
      checkIntervalMs,
      onTimeout,
      logout,
    };

    if (!isAuthenticated || typeof window === "undefined") {
      lastActivityRef.current = null;
      return;
    }

    if (lastActivityRef.current === null) {
      lastActivityRef.current = Date.now();
    }

    const tracker = createSessionActivityTracker({
      idleTimeoutMs: optionsRef.current.idleTimeoutMs,
      absoluteTimeoutMs: optionsRef.current.absoluteTimeoutMs,
      sessionStartedAt,
      getLastActivityAt: () => lastActivityRef.current ?? Date.now(),
      setLastActivityAt: (time: number) => {
        lastActivityRef.current = time;
      },
      onTimeout: (reason) => {
        const currentOptions = optionsRef.current;
        if (currentOptions.onTimeout !== undefined) {
          currentOptions.onTimeout(reason);
        } else {
          const description =
            reason === "idle"
              ? "Your session expired after 15 minutes of inactivity."
              : "Maximum session duration (12 hours) reached. Please sign in again.";
          toast.error("Session expired", { description });
          void currentOptions.logout();
        }
      },
    });

    const handleActivity = () => {
      tracker.recordActivity();
    };

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }

    const intervalId = window.setInterval(() => {
      tracker.check();
    }, optionsRef.current.checkIntervalMs);

    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      window.clearInterval(intervalId);
    };
  }, [
    absoluteTimeoutMs,
    checkIntervalMs,
    idleTimeoutMs,
    isAuthenticated,
    logout,
    onTimeout,
    sessionStartedAt,
  ]);
}
