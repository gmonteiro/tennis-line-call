"use client";

import { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import CameraFeed, { type CameraFeedHandle } from "@/components/CameraFeed";
import CalibrationOverlay from "@/components/CalibrationOverlay";
import type { Point, CalibrationData } from "@/types";
import { computeHomography, invertHomography } from "@/lib/homography";
import { CALIBRATION_TARGETS } from "@/lib/court-geometry";
import { saveCalibration } from "@/lib/calibration-store";

export default function CalibrarPage() {
  const router = useRouter();
  const cameraRef = useRef<CameraFeedHandle>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });
  const [showProjection, setShowProjection] = useState(false);

  const handleCameraReady = useCallback(() => {
    setCameraReady(true);
    const video = cameraRef.current?.videoElement;
    if (video) {
      setVideoSize({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      });
    }
  }, []);

  const handleCameraError = useCallback((error: Error) => {
    setCameraError(error.message);
  }, []);

  const handleTap = useCallback(
    (point: Point) => {
      if (points.length >= 4) return;

      const newPoints = [...points, point];
      setPoints(newPoints);

      if (newPoints.length === 4) {
        setShowProjection(true);
      }
    },
    [points]
  );

  function handleUndo() {
    setPoints((prev) => prev.slice(0, -1));
    setShowProjection(false);
  }

  function handleReset() {
    setPoints([]);
    setShowProjection(false);
  }

  function handleConfirm() {
    if (points.length !== 4) return;

    try {
      const srcPoints = points as [Point, Point, Point, Point];
      const H = computeHomography(srcPoints, CALIBRATION_TARGETS);
      const Hinv = invertHomography(H);

      const data: CalibrationData = {
        pixelPoints: srcPoints,
        homography: H,
        inverseHomography: Hinv,
        timestamp: Date.now(),
      };

      saveCalibration(data);
      router.push("/sessao");
    } catch {
      setCameraError(
        "Erro ao calcular a calibração. Tente marcar os pontos novamente."
      );
      handleReset();
    }
  }

  if (cameraError) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 text-center">
        <p className="text-red-400 text-lg mb-4">{cameraError}</p>
        <button
          onClick={() => {
            setCameraError(null);
            handleReset();
          }}
          className="px-6 py-2 bg-zinc-800 rounded-xl text-white"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Camera feed */}
      <CameraFeed
        ref={cameraRef}
        onReady={handleCameraReady}
        onError={handleCameraError}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Calibration overlay */}
      {cameraReady && (
        <CalibrationOverlay
          points={points}
          videoWidth={videoSize.width}
          videoHeight={videoSize.height}
          onTap={handleTap}
          showProjection={showProjection}
        />
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={() => router.push("/")}
          className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium backdrop-blur-sm"
        >
          Voltar
        </button>

        <div className="flex gap-2">
          {points.length > 0 && (
            <button
              onClick={handleUndo}
              className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium backdrop-blur-sm"
            >
              Desfazer
            </button>
          )}

          {points.length === 4 && (
            <>
              <button
                onClick={handleReset}
                className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium backdrop-blur-sm"
              >
                Refazer
              </button>
              <button
                onClick={handleConfirm}
                className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold shadow-lg"
              >
                Confirmar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Loading state */}
      {!cameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <div className="text-zinc-400 animate-pulse">
            Abrindo câmera...
          </div>
        </div>
      )}
    </div>
  );
}
