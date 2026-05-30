export interface Point {
  x: number;
  y: number;
}

export interface CourtPoint {
  x: number; // meters from left sideline
  y: number; // meters from near baseline
}

export interface TrackPoint {
  x: number;
  y: number;
  t: number; // timestamp ms
  confidence: number;
}

export interface Detection {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
}

export interface BounceEvent {
  pixelPoint: Point;
  courtPoint: CourtPoint;
  timestamp: number;
  confidence: number;
}

export type CallResult = "in" | "out" | "fault";

export type CourtMode = "singles" | "doubles";
export type ServeMode = "off" | "deuce" | "ad";

export interface CalibrationData {
  pixelPoints: [Point, Point, Point, Point];
  homography: number[][];
  inverseHomography: number[][];
  timestamp: number;
  label?: string;
}

export interface SessionSettings {
  courtMode: CourtMode;
  serveMode: ServeMode;
  sensitivity: number; // 0-1
  soundEnabled: boolean;
}
