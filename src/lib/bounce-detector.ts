import type { TrackPoint, BounceEvent, Point } from "@/types";
import { applyHomography } from "./homography";

const BUFFER_SIZE = 15;
const MIN_VELOCITY = 2; // minimum pixels/frame vertical velocity for valid bounce
const DEBOUNCE_MS = 800; // minimum time between bounces

export class BounceDetector {
  trajectory: TrackPoint[] = [];
  private lastBounceTime = 0;

  /**
   * Add a new detection point to the trajectory buffer.
   * Returns a BounceEvent if a bounce was detected.
   */
  addPoint(
    point: Point,
    confidence: number,
    homography: number[][] | null
  ): BounceEvent | null {
    const now = performance.now();

    this.trajectory.push({
      x: point.x,
      y: point.y,
      t: now,
      confidence,
    });

    // Keep buffer size limited
    if (this.trajectory.length > BUFFER_SIZE) {
      this.trajectory.shift();
    }

    // Need at least 4 points for bounce detection
    if (this.trajectory.length < 4) return null;

    // Debounce
    if (now - this.lastBounceTime < DEBOUNCE_MS) return null;

    return this.detectBounce(homography);
  }

  /**
   * Add a "miss" frame where the ball was not detected.
   */
  addMiss(): void {
    // Don't add gaps, just let the trajectory thin out naturally
    // This avoids false bounces from detection gaps
  }

  /**
   * Check for bounce in recent trajectory.
   * A bounce = vertical velocity reversal (ball going down then up).
   */
  private detectBounce(homography: number[][] | null): BounceEvent | null {
    const len = this.trajectory.length;
    const recent = this.trajectory.slice(-4);

    // Compute vertical velocities between consecutive points
    const velocities: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      const dt = recent[i].t - recent[i - 1].t;
      if (dt <= 0) return null;
      velocities.push((recent[i].y - recent[i - 1].y) / dt);
    }

    // Look for sign change: positive → negative (down → up in screen coords)
    // In screen coordinates: y increases downward, so:
    // - positive vy = ball moving down (toward court)
    // - negative vy = ball moving up (bouncing up)
    for (let i = 1; i < velocities.length; i++) {
      const prevVy = velocities[i - 1];
      const currVy = velocities[i];

      // Check for reversal: was going down, now going up
      if (prevVy > 0 && currVy < 0) {
        // Check minimum velocity (ignore slow drift)
        if (Math.abs(prevVy) < MIN_VELOCITY * 0.001) continue;

        // The bounce point is the trajectory point at the reversal
        const bounceIdx = len - recent.length + i;
        const bouncePoint = this.trajectory[bounceIdx];

        // Compute court coordinates if we have calibration
        let courtPoint = { x: 0, y: 0 };
        if (homography) {
          courtPoint = applyHomography(homography, {
            x: bouncePoint.x,
            y: bouncePoint.y,
          });
        }

        this.lastBounceTime = bouncePoint.t;

        return {
          pixelPoint: { x: bouncePoint.x, y: bouncePoint.y },
          courtPoint,
          timestamp: bouncePoint.t,
          confidence: bouncePoint.confidence,
        };
      }
    }

    return null;
  }

  reset(): void {
    this.trajectory = [];
    this.lastBounceTime = 0;
  }
}
