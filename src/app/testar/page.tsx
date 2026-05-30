"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import CalibrationOverlay from "@/components/CalibrationOverlay";
import CourtOverlay from "@/components/CourtOverlay";
import type {
  Point,
  Detection,
  CallResult,
  CalibrationData,
  SessionSettings,
} from "@/types";
import {
  computeHomography,
  invertHomography,
  applyHomography,
} from "@/lib/homography";
import { CALIBRATION_TARGETS } from "@/lib/court-geometry";
import {
  loadCalibration,
  saveCalibration,
} from "@/lib/calibration-store";
import { loadModel, detect, isModelLoaded } from "@/lib/ball-detector";
import { BounceDetector } from "@/lib/bounce-detector";
import { judge, distanceFromLine } from "@/lib/line-judge";
import { initAudio, playOut, playFault } from "@/lib/audio";
import { captureFrame } from "@/lib/camera";

interface BounceMarker {
  point: Point;
  call: CallResult;
  timestamp: number;
}

interface DebugInfo {
  detectionTime: number;
  confidence: number | null;
  ballPos: Point | null;
  courtPos: { x: number; y: number } | null;
  distFromLine: number | null;
  trajectoryLength: number;
  frameNumber: number;
}

type AppStep = "upload" | "calibrate" | "detect";

export default function TestarPage() {
  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const preprocessCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bounceDetectorRef = useRef<BounceDetector>(new BounceDetector());
  const isProcessingRef = useRef(false);
  const animFrameRef = useRef<number>(0);
  const fpsCounterRef = useRef({ frames: 0, lastTime: performance.now() });
  const frameCountRef = useRef(0);

  // --- State ---
  const [step, setStep] = useState<AppStep>("upload");
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoSize, setVideoSize] = useState({ width: 1280, height: 720 });
  const [videoReady, setVideoReady] = useState(false);

  // Calibration
  const [calPoints, setCalPoints] = useState<Point[]>([]);
  const [showProjection, setShowProjection] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData | null>(null);

  // Detection
  const [modelLoaded, setModelLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentDetection, setCurrentDetection] = useState<Detection | null>(null);
  const [bounceMarkers, setBounceMarkers] = useState<BounceMarker[]>([]);
  const [callFlash, setCallFlash] = useState<CallResult | null>(null);
  const [lastCall, setLastCall] = useState<{ result: CallResult; time: Date } | null>(null);
  const [fps, setFps] = useState(0);
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [showDebug, setShowDebug] = useState(true);
  const [callLog, setCallLog] = useState<
    { result: CallResult; time: number; frame: number; confidence: number }[]
  >([]);
  const [settings, setSettings] = useState<SessionSettings>({
    courtMode: "singles",
    serveMode: "off",
    sensitivity: 0.5,
    soundEnabled: true,
  });

  // --- Init ---
  useEffect(() => {
    captureCanvasRef.current = document.createElement("canvas");
    preprocessCanvasRef.current = document.createElement("canvas");

    loadModel()
      .then(() => setModelLoaded(true))
      .catch((err) => console.error("Failed to load model:", err));

    // Try to load existing calibration
    const cal = loadCalibration();
    if (cal) setCalibration(cal);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  // Clean up old bounce markers
  useEffect(() => {
    const interval = setInterval(() => {
      const now = performance.now();
      setBounceMarkers((prev) => prev.filter((m) => now - m.timestamp < 3000));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  // --- Video upload ---
  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setStep(calibration ? "detect" : "calibrate");
  }

  function handleVideoLoaded() {
    const video = videoRef.current;
    if (!video) return;
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
    setVideoReady(true);
    video.pause();
    video.currentTime = 0;
  }

  // --- Calibration ---
  function handleCalTap(point: Point) {
    if (calPoints.length >= 4) return;
    const newPoints = [...calPoints, point];
    setCalPoints(newPoints);
    if (newPoints.length === 4) setShowProjection(true);
  }

  function handleCalConfirm() {
    if (calPoints.length !== 4) return;
    try {
      const src = calPoints as [Point, Point, Point, Point];
      const H = computeHomography(src, CALIBRATION_TARGETS);
      const Hinv = invertHomography(H);
      const data: CalibrationData = {
        pixelPoints: src,
        homography: H,
        inverseHomography: Hinv,
        timestamp: Date.now(),
      };
      saveCalibration(data);
      setCalibration(data);
      setStep("detect");
    } catch {
      setCalPoints([]);
      setShowProjection(false);
    }
  }

  function handleCalReset() {
    setCalPoints([]);
    setShowProjection(false);
  }

  function handleRecalibrate() {
    setCalPoints([]);
    setShowProjection(false);
    setCalibration(null);
    setStep("calibrate");
    stopDetection();
  }

  // --- Detection ---
  const handleCall = useCallback(
    (result: CallResult, point: Point, confidence: number) => {
      setBounceMarkers((prev) => [
        ...prev,
        { point, call: result, timestamp: performance.now() },
      ]);

      if (result === "out" || result === "fault") {
        setCallFlash(result);
        setTimeout(() => setCallFlash(null), 200);
        if (settings.soundEnabled) {
          result === "fault" ? playFault() : playOut();
        }
      }

      setLastCall({ result, time: new Date() });
      setCallLog((prev) => [
        ...prev,
        {
          result,
          time: videoRef.current?.currentTime ?? 0,
          frame: frameCountRef.current,
          confidence,
        },
      ]);
    },
    [settings.soundEnabled]
  );

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    if (
      !video ||
      !captureCanvasRef.current ||
      !preprocessCanvasRef.current ||
      isProcessingRef.current ||
      !isModelLoaded()
    ) {
      return;
    }

    isProcessingRef.current = true;
    frameCountRef.current++;
    const t0 = performance.now();

    const frame = captureFrame(video, captureCanvasRef.current);
    if (!frame) {
      isProcessingRef.current = false;
      return;
    }

    const minConfidence = 0.5 - settings.sensitivity * 0.4;

    detect(frame, preprocessCanvasRef.current, minConfidence)
      .then((detection) => {
        const t1 = performance.now();
        setCurrentDetection(detection);

        let ballPos: Point | null = null;
        let courtPos: { x: number; y: number } | null = null;
        let distLine: number | null = null;

        if (detection) {
          const cx = detection.x + detection.width / 2;
          const cy = detection.y + detection.height / 2;
          ballPos = { x: cx, y: cy };

          const bounceEvent = bounceDetectorRef.current.addPoint(
            { x: cx, y: cy },
            detection.confidence,
            calibration?.homography ?? null
          );

          if (calibration) {
            courtPos = applyHomography(calibration.homography, { x: cx, y: cy });
            distLine = distanceFromLine(
              courtPos!,
              settings.courtMode
            );
          }

          if (bounceEvent && calibration) {
            const result = judge(
              bounceEvent.courtPoint,
              settings.courtMode,
              settings.serveMode
            );
            handleCall(result, bounceEvent.pixelPoint, bounceEvent.confidence);
          }
        } else {
          bounceDetectorRef.current.addMiss();
        }

        setDebugInfo({
          detectionTime: Math.round(t1 - t0),
          confidence: detection?.confidence ?? null,
          ballPos,
          courtPos,
          distFromLine: distLine,
          trajectoryLength: bounceDetectorRef.current["trajectory"]?.length ?? 0,
          frameNumber: frameCountRef.current,
        });

        // FPS counter
        fpsCounterRef.current.frames++;
        const now = performance.now();
        const elapsed = now - fpsCounterRef.current.lastTime;
        if (elapsed >= 1000) {
          setFps(Math.round((fpsCounterRef.current.frames * 1000) / elapsed));
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = now;
        }
      })
      .catch(() => {})
      .finally(() => {
        isProcessingRef.current = false;
      });
  }, [calibration, settings, handleCall]);

  const detectionLoop = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused && !video.ended) {
      processFrame();
    }
    animFrameRef.current = requestAnimationFrame(detectionLoop);
  }, [processFrame]);

  function startDetection() {
    const video = videoRef.current;
    if (!video) return;
    initAudio().catch(() => {});
    video.play();
    setIsPlaying(true);
    bounceDetectorRef.current.reset();
    frameCountRef.current = 0;
    animFrameRef.current = requestAnimationFrame(detectionLoop);
  }

  function stopDetection() {
    const video = videoRef.current;
    if (video) video.pause();
    setIsPlaying(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
  }

  function togglePlayPause() {
    if (isPlaying) {
      stopDetection();
    } else {
      startDetection();
    }
  }

  function stepFrame() {
    const video = videoRef.current;
    if (!video || isPlaying) return;
    // Advance ~1 frame (assuming 30fps)
    video.currentTime = Math.min(video.currentTime + 1 / 30, video.duration);
    // Process this frame after seek
    const onSeeked = () => {
      processFrame();
      video.removeEventListener("seeked", onSeeked);
    };
    video.addEventListener("seeked", onSeeked);
  }

  function seekTo(time: number) {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = time;
    const onSeeked = () => {
      processFrame();
      video.removeEventListener("seeked", onSeeked);
    };
    video.addEventListener("seeked", onSeeked);
  }

  function resetTest() {
    stopDetection();
    setCurrentDetection(null);
    setBounceMarkers([]);
    setCallLog([]);
    setDebugInfo(null);
    setLastCall(null);
    bounceDetectorRef.current.reset();
    frameCountRef.current = 0;
    if (videoRef.current) videoRef.current.currentTime = 0;
  }

  // === RENDER ===

  // Upload step
  if (step === "upload") {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Modo Teste</h1>
          <p className="text-zinc-400 text-sm">
            Suba um vídeo de tênis para validar a detecção
          </p>
        </div>

        <label className="w-full max-w-sm cursor-pointer">
          <div className="border-2 border-dashed border-zinc-600 rounded-2xl p-8 text-center hover:border-zinc-400 transition-colors">
            <div className="text-4xl mb-3">📹</div>
            <p className="text-zinc-300 font-medium mb-1">
              Selecionar vídeo
            </p>
            <p className="text-zinc-500 text-xs">MP4, MOV, WebM</p>
          </div>
          <input
            type="file"
            accept="video/*"
            onChange={handleFileUpload}
            className="hidden"
          />
        </label>

        <a
          href="/"
          className="mt-6 text-zinc-500 text-sm hover:text-zinc-300 transition-colors"
        >
          Voltar ao início
        </a>

        {!modelLoaded && (
          <p className="mt-4 text-yellow-400 text-xs animate-pulse">
            Carregando modelo ONNX...
          </p>
        )}
      </div>
    );
  }

  // Calibrate step (on the video first frame)
  if (step === "calibrate") {
    return (
      <div className="relative h-full w-full bg-black">
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            onLoadedMetadata={handleVideoLoaded}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {videoReady && (
          <CalibrationOverlay
            points={calPoints}
            videoWidth={videoSize.width}
            videoHeight={videoSize.height}
            onTap={handleCalTap}
            showProjection={showProjection}
          />
        )}

        <div className="absolute top-0 left-0 right-0 bg-black/70 px-4 py-2 text-center">
          <p className="text-zinc-300 text-sm">
            Marque os 4 cantos da quadra no primeiro frame do vídeo
          </p>
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
          <button
            onClick={() => {
              setStep("upload");
              handleCalReset();
            }}
            className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium"
          >
            Voltar
          </button>

          <div className="flex gap-2">
            {calPoints.length > 0 && (
              <button
                onClick={() =>
                  setCalPoints((prev) => {
                    const next = prev.slice(0, -1);
                    if (next.length < 4) setShowProjection(false);
                    return next;
                  })
                }
                className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium"
              >
                Desfazer
              </button>
            )}
            {calPoints.length === 4 && (
              <>
                <button
                  onClick={handleCalReset}
                  className="px-5 py-2 bg-zinc-700/80 text-white rounded-full text-sm font-medium"
                >
                  Refazer
                </button>
                <button
                  onClick={handleCalConfirm}
                  className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold"
                >
                  Confirmar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Detection step
  return (
    <div className="relative h-full w-full bg-black flex">
      {/* Video + overlay area */}
      <div className="relative flex-1 min-w-0">
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            onLoadedMetadata={handleVideoLoaded}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-contain"
          />
        )}

        {videoReady && (
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

        {/* Call flash text */}
        {callFlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-7xl font-black text-red-500 animate-ping opacity-80">
              {callFlash === "fault" ? "FAULT!" : "FORA!"}
            </div>
          </div>
        )}

        {/* Video controls bar */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent px-4 py-3">
          {/* Timeline scrubber */}
          <div className="mb-3">
            <input
              type="range"
              min="0"
              max={videoRef.current?.duration || 100}
              step="0.033"
              value={videoRef.current?.currentTime || 0}
              onChange={(e) => seekTo(Number(e.target.value))}
              className="w-full accent-green-500 h-1.5"
            />
            <div className="flex justify-between text-zinc-500 text-xs mt-1">
              <span>{formatTime(videoRef.current?.currentTime ?? 0)}</span>
              <span>{formatTime(videoRef.current?.duration ?? 0)}</span>
            </div>
          </div>

          {/* Playback buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={togglePlayPause}
                disabled={!modelLoaded}
                className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPlaying ? "⏸ Pausar" : "▶ Play"}
              </button>

              <button
                onClick={stepFrame}
                disabled={isPlaying || !modelLoaded}
                className="px-4 py-2 bg-zinc-700 text-white rounded-full text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                title="Avançar 1 frame"
              >
                ⏭ Frame
              </button>

              <button
                onClick={resetTest}
                className="px-4 py-2 bg-zinc-700 text-white rounded-full text-sm font-medium"
              >
                ↺ Reset
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRecalibrate}
                className="px-4 py-2 bg-zinc-700 text-white rounded-full text-sm font-medium"
              >
                Recalibrar
              </button>

              <button
                onClick={() => setShowDebug(!showDebug)}
                className={`px-4 py-2 rounded-full text-sm font-medium ${
                  showDebug
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-white"
                }`}
              >
                Debug
              </button>

              {/* Settings toggles */}
              <select
                value={settings.courtMode}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    courtMode: e.target.value as "singles" | "doubles",
                  }))
                }
                className="bg-zinc-700 text-white text-xs rounded-lg px-2 py-2"
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>

              <select
                value={settings.serveMode}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    serveMode: e.target.value as "off" | "deuce" | "ad",
                  }))
                }
                className="bg-zinc-700 text-white text-xs rounded-lg px-2 py-2"
              >
                <option value="off">Rally</option>
                <option value="deuce">Serve Deuce</option>
                <option value="ad">Serve Ad</option>
              </select>

              <a
                href="/"
                className="px-4 py-2 bg-zinc-700 text-white rounded-full text-sm font-medium"
              >
                Sair
              </a>
            </div>
          </div>
        </div>

        {/* Model loading */}
        {!modelLoaded && (
          <div className="absolute top-4 left-4 bg-yellow-900/80 text-yellow-200 text-xs px-3 py-1.5 rounded-lg animate-pulse">
            Carregando modelo ONNX...
          </div>
        )}
      </div>

      {/* Debug panel (right side) */}
      {showDebug && (
        <div className="w-80 bg-zinc-900 border-l border-zinc-800 overflow-y-auto flex flex-col">
          <div className="p-3 border-b border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-300">
              Debug Info
            </h3>
          </div>

          {/* Frame info */}
          <div className="p-3 border-b border-zinc-800 space-y-1">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase">
              Frame
            </h4>
            <Row label="Frame #" value={debugInfo?.frameNumber ?? 0} />
            <Row
              label="Inference"
              value={
                debugInfo?.detectionTime != null
                  ? `${debugInfo.detectionTime}ms`
                  : "—"
              }
            />
            <Row label="FPS" value={fps} />
            <Row
              label="Sensibilidade"
              value={`${Math.round(settings.sensitivity * 100)}%`}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sensitivity * 100}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  sensitivity: Number(e.target.value) / 100,
                }))
              }
              className="w-full accent-blue-500 mt-1"
            />
          </div>

          {/* Detection info */}
          <div className="p-3 border-b border-zinc-800 space-y-1">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase">
              Detecção
            </h4>
            <Row
              label="Confiança"
              value={
                debugInfo?.confidence != null
                  ? `${(debugInfo.confidence * 100).toFixed(1)}%`
                  : "—"
              }
              color={
                debugInfo?.confidence != null
                  ? debugInfo.confidence > 0.5
                    ? "text-green-400"
                    : "text-yellow-400"
                  : undefined
              }
            />
            <Row
              label="Posição (px)"
              value={
                debugInfo?.ballPos
                  ? `${Math.round(debugInfo.ballPos.x)}, ${Math.round(debugInfo.ballPos.y)}`
                  : "—"
              }
            />
            <Row
              label="Posição (m)"
              value={
                debugInfo?.courtPos
                  ? `${debugInfo.courtPos.x.toFixed(2)}, ${debugInfo.courtPos.y.toFixed(2)}`
                  : "—"
              }
            />
            <Row
              label="Dist. linha"
              value={
                debugInfo?.distFromLine != null
                  ? `${(debugInfo.distFromLine * 100).toFixed(1)}cm`
                  : "—"
              }
              color={
                debugInfo?.distFromLine != null
                  ? debugInfo.distFromLine >= 0
                    ? "text-green-400"
                    : "text-red-400"
                  : undefined
              }
            />
            <Row
              label="Trajetória"
              value={`${debugInfo?.trajectoryLength ?? 0} pontos`}
            />
          </div>

          {/* Last call */}
          {lastCall && (
            <div className="p-3 border-b border-zinc-800">
              <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-1">
                Último Call
              </h4>
              <div
                className={`text-lg font-bold ${
                  lastCall.result === "in"
                    ? "text-green-400"
                    : "text-red-400"
                }`}
              >
                {lastCall.result === "in"
                  ? "BOA!"
                  : lastCall.result === "fault"
                  ? "FAULT!"
                  : "FORA!"}
              </div>
            </div>
          )}

          {/* Call log */}
          <div className="p-3 flex-1 overflow-y-auto">
            <h4 className="text-xs font-semibold text-zinc-500 uppercase mb-2">
              Histórico de Calls ({callLog.length})
            </h4>
            {callLog.length === 0 ? (
              <p className="text-zinc-600 text-xs">Nenhum call ainda</p>
            ) : (
              <div className="space-y-1">
                {callLog.map((entry, i) => (
                  <button
                    key={i}
                    onClick={() => seekTo(entry.time)}
                    className="w-full text-left flex items-center gap-2 text-xs hover:bg-zinc-800 rounded px-2 py-1 transition-colors"
                  >
                    <span
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        entry.result === "in"
                          ? "bg-green-500"
                          : "bg-red-500"
                      }`}
                    />
                    <span className="text-zinc-400">
                      {formatTime(entry.time)}
                    </span>
                    <span
                      className={`font-medium ${
                        entry.result === "in"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {entry.result === "in"
                        ? "BOA"
                        : entry.result === "fault"
                        ? "FAULT"
                        : "FORA"}
                    </span>
                    <span className="text-zinc-600 ml-auto">
                      {(entry.confidence * 100).toFixed(0)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-zinc-500">{label}</span>
      <span className={color ?? "text-zinc-300"}>{value}</span>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, "0")}.${ms}`;
}
