"use client";

import { useState } from "react";
import type { SessionSettings, CallResult } from "@/types";

interface SessionControlsProps {
  settings: SessionSettings;
  onSettingsChange: (settings: SessionSettings) => void;
  onStop: () => void;
  lastCall: { result: CallResult; time: Date } | null;
  isModelLoaded: boolean;
}

export default function SessionControls({
  settings,
  onSettingsChange,
  onStop,
  lastCall,
  isModelLoaded,
}: SessionControlsProps) {
  const [showConfig, setShowConfig] = useState(false);

  return (
    <>
      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
        <button
          onClick={onStop}
          className="px-6 py-2 bg-red-600 text-white rounded-full font-semibold text-sm hover:bg-red-700 active:bg-red-800 transition-colors"
        >
          Parar
        </button>

        {/* Last call display */}
        <div className="text-center">
          {!isModelLoaded && (
            <div className="text-yellow-400 text-sm animate-pulse">
              Carregando modelo...
            </div>
          )}
          {lastCall && (
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
          )}
        </div>

        <button
          onClick={() => setShowConfig(!showConfig)}
          className="px-6 py-2 bg-white/20 text-white rounded-full font-semibold text-sm hover:bg-white/30 active:bg-white/40 transition-colors backdrop-blur-sm"
        >
          Config
        </button>
      </div>

      {/* Config drawer */}
      {showConfig && (
        <div className="absolute bottom-16 right-4 w-72 bg-zinc-900/95 rounded-xl p-4 backdrop-blur-sm border border-zinc-700 shadow-2xl">
          <h3 className="text-white font-semibold mb-3 text-sm">
            Configurações
          </h3>

          {/* Sound toggle */}
          <label className="flex items-center justify-between mb-3">
            <span className="text-zinc-300 text-sm">Som</span>
            <button
              onClick={() =>
                onSettingsChange({
                  ...settings,
                  soundEnabled: !settings.soundEnabled,
                })
              }
              className={`w-11 h-6 rounded-full transition-colors ${
                settings.soundEnabled ? "bg-green-500" : "bg-zinc-600"
              }`}
            >
              <div
                className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  settings.soundEnabled
                    ? "translate-x-[22px]"
                    : "translate-x-[2px]"
                }`}
              />
            </button>
          </label>

          {/* Court mode */}
          <div className="mb-3">
            <span className="text-zinc-300 text-sm block mb-1">Quadra</span>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  onSettingsChange({ ...settings, courtMode: "singles" })
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  settings.courtMode === "singles"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                Singles
              </button>
              <button
                onClick={() =>
                  onSettingsChange({ ...settings, courtMode: "doubles" })
                }
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  settings.courtMode === "doubles"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-700 text-zinc-300"
                }`}
              >
                Doubles
              </button>
            </div>
          </div>

          {/* Serve mode */}
          <div className="mb-3">
            <span className="text-zinc-300 text-sm block mb-1">Saque</span>
            <div className="flex gap-2">
              {(["off", "deuce", "ad"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    onSettingsChange({ ...settings, serveMode: mode })
                  }
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    settings.serveMode === mode
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300"
                  }`}
                >
                  {mode === "off" ? "Off" : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Sensitivity slider */}
          <div>
            <span className="text-zinc-300 text-sm block mb-1">
              Sensibilidade: {Math.round(settings.sensitivity * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.sensitivity * 100}
              onChange={(e) =>
                onSettingsChange({
                  ...settings,
                  sensitivity: Number(e.target.value) / 100,
                })
              }
              className="w-full accent-blue-500"
            />
          </div>
        </div>
      )}
    </>
  );
}
