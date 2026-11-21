import type { AccountHealth, LivenessState } from "./types";

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

/**
 * Entering "unreachable" takes this many consecutive unreachable-classified
 * probes. A single failure is often transient — right after the editor
 * starts, the proxy/VPN path may not be ready yet — so the first failure is
 * held (display and notifications untouched) until a confirmation probe
 * agrees. Auth errors are deterministic and never go through this.
 */
export const UNREACHABLE_CONFIRMATIONS = 2;

/** Delay before the automatic confirmation probe after a first failure. */
export const CONFIRM_PROBE_DELAY_MS = 10_000;

export interface ProbeDecision {
  /**
   * The state to record for the account this round. Undefined means the
   * result is being held pending confirmation: leave the recorded health
   * (and therefore the display and the notifications) untouched.
   */
  applyState: LivenessState | undefined;
  /** Consecutive unreachable-classified probes, updated for this round. */
  consecutiveUnreachable: number;
  /** True when a confirmation probe should be scheduled. */
  needsConfirmation: boolean;
}

/**
 * Decide what one classified probe result does to an account, given its
 * recorded state and its current run of consecutive unreachable results.
 */
export function decideProbe(
  prev: LivenessState | undefined,
  next: LivenessState,
  consecutiveUnreachable: number,
): ProbeDecision {
  if (next !== "unreachable") {
    // Reachable and authError apply immediately; either resets the streak.
    return { applyState: next, consecutiveUnreachable: 0, needsConfirmation: false };
  }
  if (prev === "unreachable") {
    // Already in the unreachable state: nothing to confirm.
    return { applyState: next, consecutiveUnreachable, needsConfirmation: false };
  }
  const streak = consecutiveUnreachable + 1;
  if (streak >= UNREACHABLE_CONFIRMATIONS) {
    return { applyState: next, consecutiveUnreachable: streak, needsConfirmation: false };
  }
  return { applyState: undefined, consecutiveUnreachable: streak, needsConfirmation: true };
}

export function livenessTransition(prev: LivenessState | undefined, next: LivenessState): LivenessTransition {
  return {
    next,
    becameUnreachable: next === "unreachable" && prev !== "unreachable",
    recovered: next === "reachable" && prev === "unreachable",
    authChanged: (next === "authError") !== (prev === "authError") && prev !== undefined,
  };
}

/**
 * The recoveredAt timestamp to record after a probe. A recovery earns the
 * 復旧 marker only when it was witnessed in this session: a recovery applied
 * during the silent startup baseline (witnessed = false) clears the marker
 * instead of setting it — from the user's point of view nothing happened,
 * so there is nothing to mark. Without a recovery edge, the previous
 * marker carries over while it is still inside its display window.
 */
export function nextRecoveredAt(
  transition: LivenessTransition,
  prevRecoveredAt: number | undefined,
  now: number,
  witnessed: boolean,
): number | undefined {
  if (!transition.recovered) {
    return prevRecoveredAt;
  }
  return witnessed ? now : undefined;
}

/**
 * Health restored from persistence at startup, with the recovery marker
 * removed. The marker is session-local — it stands for an outage and a
 * recovery the user could have witnessed — so a marker stored by a previous
 * session must not reappear after a restart. Everything else (state,
 * timestamps, login) carries over unchanged.
 */
export function withoutRecoveryMarker(health: AccountHealth): AccountHealth {
  if (health.recoveredAt === undefined) {
    return health;
  }
  return { ...health, recoveredAt: undefined };
}

/** The 復旧 marker stays visible for this long after a recovery. */
export const RECOVERY_MARKER_MS = 15 * 60 * 1000;

export function showsRecoveryMarker(recoveredAt: number | undefined, now: number): boolean {
  return recoveredAt !== undefined && now - recoveredAt < RECOVERY_MARKER_MS;
}
