"use client";

import { useEffect } from "react";
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
  let lastActivityAt = getNow();
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const absoluteTimeoutMs = options.absoluteTimeoutMs ?? DEFAULT_ABSOLUTE_TIMEOUT_MS;
  const sessionStartedAt = options.sessionStartedAt;
  const onTimeout = options.onTimeout;

  return {
    recordActivity: () => {
      if (timedOut) return;
      lastActivityAt = getNow();
    },
    check: () => {
      if (timedOut) return;
      const currentTime = getNow();
      const idleElapsed = currentTime - lastActivityAt;
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

  useEffect(() => {
    if (!isAuthenticated || typeof window === "undefined") {
      return;
    }

    const tracker = createSessionActivityTracker({
      idleTimeoutMs,
      absoluteTimeoutMs,
      sessionStartedAt,
      onTimeout: (reason) => {
        if (onTimeout !== undefined) {
          onTimeout(reason);
        } else {
          const description =
            reason === "idle"
              ? "Your session expired after 15 minutes of inactivity."
              : "Maximum session duration (12 hours) reached. Please sign in again.";
          toast.error("Session expired", { description });
          void logout();
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
    }, checkIntervalMs);

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
