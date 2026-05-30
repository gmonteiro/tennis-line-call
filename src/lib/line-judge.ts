import type { CourtPoint, CallResult, CourtMode, ServeMode } from "@/types";
import { COURT } from "./court-geometry";

// Ball radius (~3.35cm) + detection error margin (~5cm)
const TOLERANCE_M = 0.085;

/**
 * Judge whether a bounce point is in or out.
 */
export function judge(
  courtPoint: CourtPoint,
  courtMode: CourtMode,
  serveMode: ServeMode
): CallResult {
  // If serving, check service box
  if (serveMode !== "off") {
    return judgeServe(courtPoint, serveMode);
  }

  // Rally: check full court boundaries
  return judgeRally(courtPoint, courtMode);
}

function judgeRally(point: CourtPoint, mode: CourtMode): CallResult {
  const sideline =
    mode === "singles" ? COURT.sidelineSingles : COURT.sidelineDoubles;

  const inBounds =
    point.x >= sideline.left - TOLERANCE_M &&
    point.x <= sideline.right + TOLERANCE_M &&
    point.y >= COURT.nearBaseline - TOLERANCE_M &&
    point.y <= COURT.farBaseline + TOLERANCE_M;

  return inBounds ? "in" : "out";
}

function judgeServe(point: CourtPoint, serveMode: ServeMode): CallResult {
  const box =
    serveMode === "deuce"
      ? COURT.serviceBoxDeuce
      : COURT.serviceBoxAd;

  const inBox =
    point.x >= box.left - TOLERANCE_M &&
    point.x <= box.right + TOLERANCE_M &&
    point.y >= box.near - TOLERANCE_M &&
    point.y <= box.far + TOLERANCE_M;

  return inBox ? "in" : "fault";
}

/**
 * Calculate distance from nearest court line (negative = inside, positive = outside).
 * Used for confidence scoring.
 */
export function distanceFromLine(
  point: CourtPoint,
  courtMode: CourtMode
): number {
  const sideline =
    courtMode === "singles" ? COURT.sidelineSingles : COURT.sidelineDoubles;

  const distances = [
    point.x - sideline.left, // distance from left sideline (negative = outside left)
    sideline.right - point.x, // distance from right sideline (negative = outside right)
    point.y - COURT.nearBaseline, // distance from near baseline
    COURT.farBaseline - point.y, // distance from far baseline
  ];

  // Return the minimum (most negative = furthest outside)
  return Math.min(...distances);
}
