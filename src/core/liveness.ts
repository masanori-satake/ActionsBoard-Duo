import type { LivenessState } from "./types";

/**
 * Classify one liveness probe result. The three states stay distinct:
 * - reachable: a normal response came back.
 * - authError: 401/403 — the server is alive; the token is the problem.
 * - unreachable: timeout, connection failure, or 5xx.
 */
export function classifyProbe(httpStatus: number | null, networkFailed: boolean): LivenessState {
  if (networkFailed || httpStatus === null) {
    return "unreachable";
  }
  if (httpStatus === 401 || httpStatus === 403) {
    return "authError";
  }
  if (httpStatus >= 500) {
    return "unreachable";
  }
  return "reachable";
}

export interface LivenessTransition {
  next: LivenessState;
  /** Became unreachable on this probe (was not unreachable before). */
  becameUnreachable: boolean;
  /** Recovered on this probe (was unreachable, now reachable). */
  recovered: boolean;
  /** Auth state changed into or out of authError. */
  authChanged: boolean;
}

export function livenessTransition(prev: LivenessState | undefined, next: LivenessState): LivenessTransition {
  return {
    next,
    becameUnreachable: next === "unreachable" && prev !== "unreachable",
    recovered: next === "reachable" && prev === "unreachable",
    authChanged: (next === "authError") !== (prev === "authError") && prev !== undefined,
  };
}

/** The 復旧 marker stays visible for this long after a recovery. */
export const RECOVERY_MARKER_MS = 15 * 60 * 1000;

export function showsRecoveryMarker(recoveredAt: number | undefined, now: number): boolean {
  return recoveredAt !== undefined && now - recoveredAt < RECOVERY_MARKER_MS;
}
