"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import CameraFeed, { type CameraFeedHandle } from "@/components/CameraFeed";
import CourtOverlay from "@/components/CourtOverlay";
import SessionControls from "@/components/SessionControls";
import type {
  Detection,
  CallResult,
  SessionSettings,
  Point,
  CalibrationData,
} from "@/types";
import { loadCalibration } from "@/lib/calibration-store";
import { loadModel, detect, isModelLoaded } from "@/lib/ball-detector";
import { BounceDetector } from "@/lib/bounce-detector";
import { judge } from "@/lib/line-judge";
import { initAudio, playOut, playFault } from "@/lib/audio";
import { captureFrame } from "@/lib/camera";

interface BounceMarker {
  point: Point;
  call: CallResult;
  timestamp: number;
}

export default function SessaoPage() {
  const router = useRouter();
  const cameraRef = useRef<CameraFeedHandle>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const preprocessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bounceDetectorRef = useRef<BounceDetector>(new BounceDetector());
  const isProcessingRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });

  const [cameraReady, setCameraReady] = useState(false);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);
  const [currentDetection, setCurrentDetection] = useState<Detection | null>(
    null
  );
  const [bounceMarkers, setBounceMarkers] = useState<BounceMarker[]>([]);
  const [callFlash, setCallFlash] = useState<CallResult | null>(null);
  const [lastCall, setLastCall] = useState<{
    result: CallResult;
    time: Date;
  } | null>(null);
  const [fps, setFps] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });
  const [settings, setSettings] = useState<SessionSettings>({
    courtMode: "singles",
    serveMode: "off",
    sensitivity: 0.5,
    soundEnabled: true,
  });

  // Load calibration and model on mount
  useEffect(() => {
    const cal = loadCalibration();
    if (!cal) {
      router.push("/calibrar");
      return;
    }
    setCalibration(cal);

    loadModel()
      .then(() => setModelLoaded(true))
      .catch((err) => console.error("Failed to load model:", err));

    // Create offscreen canvases
    captureCanvasRef.current = document.createElement("canvas");
    preprocessCanvasRef.current = document.createElement("canvas");

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [router]);

  // Clean up old bounce markers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      setBounceMarkers((prev) =>
        prev.filter((m) => now - m.timestamp < 3000)
      );
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handleCall = useCallback(
    (result: CallResult, point: Point) => {
      // Add bounce marker
      setBounceMarkers((prev) => [
        ...prev,
        { point, call: result, timestamp: performance.now() },
      ]);

      if (result === "out" || result === "fault") {
        // Flash
        setCallFlash(result);
        setTimeout(() => setCallFlash(null), 200);

        // Audio
        if (settings.soundEnabled) {
          if (result === "fault") {
            playFault();
          } else {
            playOut();
          }
        }
      }

      setLastCall({ result, time: new Date() });
    },
    [settings.soundEnabled]
  );

  // Detection loop
  const runDetectionLoop = useCallback(() => {
    if (!cameraRef.current?.videoElement || !captureCanvasRef.current || !preprocessCanvasRef.current) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop);
      return;
    }

    if (isProcessingRef.current || !isModelLoaded()) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop);
      return;
    }

    isProcessingRef.current = true;

    const video = cameraRef.current.videoElement;
    const frame = captureFrame(video, captureCanvasRef.current);

    if (!frame) {
      isProcessingRef.current = false;
      animFrameRef.current = requestAnimationFrame(runDetectionLoop);
      return;
    }

    // Map sensitivity (0-1) to confidence threshold (0.5-0.1)
    const minConfidence = 0.5 - settings.sensitivity * 0.4;

    detect(frame, preprocessCanvasRef.current, minConfidence)
      .then((detection) => {
        setCurrentDetection(detection);

        if (detection) {
          const cx = detection.x + detection.width / 2;
          const cy = detection.y + detection.height / 2;

          const bounceEvent = bounceDetectorRef.current.addPoint(
            { x: cx, y: cy },
            detection.confidence,
            calibration?.homography ?? null
          );

          if (bounceEvent && calibration) {
            const result = judge(
              bounceEvent.courtPoint,
              settings.courtMode,
              settings.serveMode
            );
            handleCall(result, bounceEvent.pixelPoint);
          }
        } else {
          bounceDetectorRef.current.addMiss();
        }

        // FPS counter
        fpsCounterRef.current.frames++;
        const now = performance.now();
        const elapsed = now - fpsCounterRef.current.lastTime;
        if (elapsed >= 1000) {
          setFps(
            Math.round(
              (fpsCounterRef.current.frames * 1000) / elapsed
            )
          );
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = now;
        }
      })
      .catch(() => {})
      .finally(() => {
        isProcessingRef.current = false;
      });

    animFrameRef.current = requestAnimationFrame(runDetectionLoop);
  }, [calibration, settings.courtMode, settings.serveMode, settings.sensitivity, handleCall]);

  const handleCameraReady = useCallback(async () => {
    setCameraReady(true);
    const video = cameraRef.current?.videoElement;
    if (video) {
      setVideoSize({
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      });
    }

    // Init audio (must be in user gesture chain)
    try {
      await initAudio();
    } catch {
      // Audio init may fail if not from user gesture — will retry on first interaction
    }
  }, []);

  // Start detection loop when camera and model are ready
  useEffect(() => {
    if (cameraReady && modelLoaded) {
      animFrameRef.current = requestAnimationFrame(runDetectionLoop);
      return () => {
        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
        }
      };
    }
  }, [cameraReady, modelLoaded, runDetectionLoop]);

  function handleStop() {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    router.push("/");
  }

  async function handleScreenTap() {
    // Use any tap to resume AudioContext (iOS requirement)
    try {
      await initAudio();
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative h-full w-full" onClick={handleScreenTap}>
      {/* Camera feed */}
      <CameraFeed
        ref={cameraRef}
        onReady={handleCameraReady}
        onError={() => router.push("/")}
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Court overlay */}
      {cameraReady && (
        <CourtOverlay
          videoWidth={videoSize.width}
          videoHeight={videoSize.height}
          homography={calibration?.homography ?? null}
          currentDetection={currentDetection}
          bounceMarkers={bounceMarkers}
          callFlash={callFlash}
          fps={fps}
        />
      )}

      {/* Controls */}
      <SessionControls
        settings={settings}
        onSettingsChange={setSettings}
        onStop={handleStop}
        lastCall={lastCall}
        isModelLoaded={modelLoaded}
      />

      {/* Loading state */}
      {!cameraReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950">
          <div className="text-zinc-400 animate-pulse">Iniciando...</div>
        </div>
      )}

      {/* Big call overlay text */}
      {callFlash && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-7xl font-black text-red-500 animate-ping opacity-80">
            {callFlash === "fault" ? "FAULT!" : "FORA!"}
          </div>
        </div>
      )}
    </div>
  );
}
