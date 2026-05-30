"use client";

import { useRef, useEffect } from "react";
import type { Point, CallResult, Detection } from "@/types";
import { invertHomography, applyHomography } from "@/lib/homography";
import { COURT_LINES } from "@/lib/court-geometry";
import { getVideoRect } from "@/lib/video-fit";

interface BounceMarker {
  point: Point;
  call: CallResult;
  timestamp: number;
}

interface CourtOverlayProps {
  videoWidth: number;
  videoHeight: number;
  homography: number[][] | null;
  currentDetection: Detection | null;
  bounceMarkers: BounceMarker[];
  callFlash: CallResult | null;
  fps: number;
}

const MARKER_DURATION_MS = 3000;

export default function CourtOverlay({
  videoWidth,
  videoHeight,
  homography,
  currentDetection,
  bounceMarkers,
  callFlash,
  fps,
}: CourtOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const containerWidth = canvas.clientWidth;
    const containerHeight = canvas.clientHeight;
    canvas.width = containerWidth;
    canvas.height = containerHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, containerWidth, containerHeight);

    // Compute the video's actual rendered area within the container
    const vr = getVideoRect(containerWidth, containerHeight, videoWidth, videoHeight);

    // Helper: convert video pixel coords to canvas coords
    const toCanvas = (vx: number, vy: number): [number, number] => [
      vr.offsetX + (vx / videoWidth) * vr.width,
      vr.offsetY + (vy / videoHeight) * vr.height,
    ];

    // Scale factor for sizes (e.g., circle radii)
    const scale = vr.width / videoWidth;

    // Draw projected court lines
    if (homography) {
      const Hinv = invertHomography(homography);

      ctx.strokeStyle = "rgba(0, 255, 100, 0.3)";
      ctx.lineWidth = 1.5;

      for (const line of COURT_LINES.singles) {
        const p1 = applyHomography(Hinv, line[0]);
        const p2 = applyHomography(Hinv, line[1]);
        const [x1, y1] = toCanvas(p1.x, p1.y);
        const [x2, y2] = toCanvas(p2.x, p2.y);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Draw current ball detection
    if (currentDetection) {
      const cx = currentDetection.x + currentDetection.width / 2;
      const cy = currentDetection.y + currentDetection.height / 2;
      const r = Math.max(currentDetection.width, currentDetection.height) / 2;

      const [canvasCx, canvasCy] = toCanvas(cx, cy);
      const canvasR = r * scale;

      // Yellow circle around ball
      ctx.beginPath();
      ctx.arc(canvasCx, canvasCy, canvasR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#facc15";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Crosshair
      ctx.strokeStyle = "rgba(250, 204, 21, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(canvasCx - canvasR - 10, canvasCy);
      ctx.lineTo(canvasCx + canvasR + 10, canvasCy);
      ctx.moveTo(canvasCx, canvasCy - canvasR - 10);
      ctx.lineTo(canvasCx, canvasCy + canvasR + 10);
      ctx.stroke();
    }

    // Draw bounce markers
    const now = performance.now();
    for (const marker of bounceMarkers) {
      const age = now - marker.timestamp;
      if (age > MARKER_DURATION_MS) continue;

      const alpha = 1 - age / MARKER_DURATION_MS;
      const isOut = marker.call === "out" || marker.call === "fault";
      const [mx, my] = toCanvas(marker.point.x, marker.point.y);

      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.fillStyle = isOut
        ? `rgba(239, 68, 68, ${alpha})`
        : `rgba(34, 197, 94, ${alpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      const label = isOut
        ? marker.call === "fault"
          ? "FAULT"
          : "FORA"
        : "BOA";
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.font = `bold 14px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(label, mx, my - 18);
    }

    // Flash border on call
    if (callFlash === "out" || callFlash === "fault") {
      ctx.strokeStyle = "rgba(239, 68, 68, 0.8)";
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, containerWidth - 8, containerHeight - 8);
    }

    // FPS counter
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(containerWidth - 80, 8, 72, 28);
    ctx.fillStyle = fps > 12 ? "#22c55e" : "#ef4444";
    ctx.font = "bold 14px monospace";
    ctx.textAlign = "right";
    ctx.fillText(`${fps} FPS`, containerWidth - 16, 28);
  }, [
    videoWidth,
    videoHeight,
    homography,
    currentDetection,
    bounceMarkers,
    callFlash,
    fps,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
