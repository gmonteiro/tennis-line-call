"use client";

import { useRef, useEffect, useCallback } from "react";
import type { Point } from "@/types";
import { CALIBRATION_TARGETS } from "@/lib/court-geometry";
import { computeHomography, invertHomography, applyHomography } from "@/lib/homography";
import { COURT_LINES } from "@/lib/court-geometry";

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
      const scaleX = videoWidth / rect.width;
      const scaleY = videoHeight / rect.height;

      onTap({
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      });
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
      const scaleX = videoWidth / rect.width;
      const scaleY = videoHeight / rect.height;

      onTap({
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY,
      });
    },
    [videoWidth, videoHeight, onTap]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, videoWidth, videoHeight);

    // Draw instruction text
    if (points.length < 4) {
      const label = CORNER_LABELS[points.length];
      ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
      ctx.fillRect(0, 0, videoWidth, 60);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(16, videoWidth / 40)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(
        `Toque no canto ${points.length + 1}/4: ${label}`,
        videoWidth / 2,
        38
      );
    }

    // Draw placed markers
    points.forEach((point, i) => {
      const color = MARKER_COLORS[i];

      // Outer circle
      ctx.beginPath();
      ctx.arc(point.x, point.y, 14, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Inner circle
      ctx.beginPath();
      ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Label
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.max(12, videoWidth / 60)}px sans-serif`;
      ctx.textAlign = "left";
      ctx.fillText(`${i + 1}`, point.x + 18, point.y + 5);
    });

    // Draw connecting lines between placed points
    if (points.length >= 2) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (points.length === 4) {
        ctx.lineTo(points[0].x, points[0].y);
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

          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      } catch {
        // Homography computation failed — points might be bad
      }
    }
  }, [points, videoWidth, videoHeight, showProjection]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      onTouchStart={handleTouch}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      style={{ touchAction: "none" }}
    />
  );
}
