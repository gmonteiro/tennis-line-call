"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hasCalibration, loadCalibration } from "@/lib/calibration-store";

export default function Home() {
  const router = useRouter();
  const [calibrated, setCalibrated] = useState(false);
  const [calibrationDate, setCalibrationDate] = useState<string | null>(null);

  useEffect(() => {
    const hasCal = hasCalibration();
    setCalibrated(hasCal);
    if (hasCal) {
      const data = loadCalibration();
      if (data) {
        setCalibrationDate(
          new Date(data.timestamp).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
        );
      }
    }
  }, []);

  function handleStart() {
    if (calibrated) {
      router.push("/sessao");
    } else {
      router.push("/calibrar");
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full px-6">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="text-6xl mb-4">🎾</div>
        <h1 className="text-4xl font-bold tracking-tight">Juiz de Linha</h1>
        <p className="text-zinc-400 mt-2 text-sm">
          Detecção automática de bola fora
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={handleStart}
          className="w-full py-4 bg-green-600 text-white rounded-2xl font-semibold text-lg hover:bg-green-700 active:bg-green-800 transition-colors shadow-lg shadow-green-600/20"
        >
          Iniciar Sessão
        </button>

        <button
          onClick={() => router.push("/calibrar")}
          className="w-full py-3 bg-zinc-800 text-white rounded-2xl font-medium hover:bg-zinc-700 active:bg-zinc-600 transition-colors border border-zinc-700"
        >
          Calibrar Quadra
        </button>

        <button
          onClick={() => router.push("/testar")}
          className="w-full py-3 bg-zinc-800 text-white rounded-2xl font-medium hover:bg-zinc-700 active:bg-zinc-600 transition-colors border border-blue-700/50"
        >
          Testar com Vídeo
        </button>
      </div>

      {/* Calibration status */}
      <div className="mt-6 text-center">
        {calibrated ? (
          <p className="text-zinc-400 text-sm">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-1.5 align-middle" />
            Calibrado em {calibrationDate}
          </p>
        ) : (
          <p className="text-zinc-500 text-sm">
            <span className="inline-block w-2 h-2 bg-zinc-600 rounded-full mr-1.5 align-middle" />
            Quadra não calibrada
          </p>
        )}
      </div>
    </div>
  );
}
