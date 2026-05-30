"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Point } from "@/types";
import { CALIBRATION_TARGETS } from "@/lib/court-geometry";
import { computeHomography, invertHomography, applyHomography } from "@/lib/homography";
import { COURT_LINES } from "@/lib/court-geometry";
import { containerToVideoCoords, getVideoRect } from "@/lib/video-fit";

const CORNER_LABELS = [
  "Fundo Esquerdo (baseline)",
  "Fundo Direito (baseline)",
  "Frente Direito (rede)",
  "Frente Esquerdo (rede)",
];

const MARKER_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b"];

interface CalibrationOverlayProps {
  points: Point[];
  videoWidth: number;
  videoHeight: number;
  onTap: (point: Point) => void;
  showProjection: boolean;
}

export default function CalibrationOverlay({
  points,
  videoWidth,
  videoHeight,
  onTap,
  showProjection,
}: CalibrationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const coords = containerToVideoCoords(
        clickX, clickY,
        rect.width, rect.height,
        videoWidth, videoHeight
      );
      if (coords) onTap(coords);
    },
    [videoWidth, videoHeight, onTap]
  );

  const handleTouch = useCallback(
    (e: React.TouchEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const clickX = touch.clientX - rect.left;
      const clickY = touch.clientY - rect.top;

      const coords = containerToVideoCoords(
        clickX, clickY,
        rect.width, rect.height,
        videoWidth, videoHeight
      );
      if (coords) onTap(coords);
    },
    [videoWidth, videoHeight, onTap]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the container's actual pixel size for the canvas resolution
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

    // Draw instruction text
    if (points.length < 4) {
      const label = CORNER_LABELS[points.length];
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, containerWidth, 50);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(16, containerWidth / 50)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        `Toque no canto ${points.length + 1}/4: ${label}`,
        containerWidth / 2,
        33
      );
    }

    // Draw placed markers
    points.forEach((point, i) => {
      const color = MARKER_COLORS[i];
      const [cx, cy] = toCanvas(point.x, point.y);

      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      ctx.fillStyle = color;
      ctx.font = `bold ${Math.max(12, containerWidth / 70)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, cx + 18, cy + 5);
    });

    // Draw connecting lines between placed points
    if (points.length >= 2) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      const [x0, y0] = toCanvas(points[0].x, points[0].y);
      ctx.moveTo(x0, y0);
      for (let i = 1; i < points.length; i++) {
        const [x, y] = toCanvas(points[i].x, points[i].y);
        ctx.lineTo(x, y);
      }
      if (points.length === 4) {
        ctx.lineTo(x0, y0);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw projected court lines
    if (showProjection && points.length === 4) {
      try {
        const H = computeHomography(
          points as [Point, Point, Point, Point],
          CALIBRATION_TARGETS
        );
        const Hinv = invertHomography(H);

        ctx.strokeStyle = "rgba(0, 255, 100, 0.6)";
        ctx.lineWidth = 2;

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
      } catch {
        // Homography computation failed
      }
    }
  }, [points, videoWidth, videoHeight, showProjection]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onTouchStart={handleTouch}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      style={{
        touchAction: "none",
        pointerEvents: points.length >= 4 ? "none" : "auto",
      }}
    />
  );
}
