import type { CalibrationData } from "@/types";

const STORAGE_KEY = "tennis-line-call-calibration";

export function saveCalibration(data: CalibrationData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadCalibration(): CalibrationData | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CalibrationData;
  } catch {
    return null;
  }
}

export function clearCalibration(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasCalibration(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}
