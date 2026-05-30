"use client";

import { useRef, useEffect, useImperativeHandle, forwardRef } from "react";
import { startCamera, stopCamera } from "@/lib/camera";

export interface CameraFeedHandle {
  videoElement: HTMLVideoElement | null;
}

interface CameraFeedProps {
  onReady?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

const CameraFeed = forwardRef<CameraFeedHandle, CameraFeedProps>(
  function CameraFeed({ onReady, onError, className }, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    useImperativeHandle(ref, () => ({
      get videoElement() {
        return videoRef.current;
      },
    }));

    useEffect(() => {
      let mounted = true;

      async function init() {
        if (!videoRef.current) return;
        try {
          const stream = await startCamera(videoRef.current);
          if (!mounted) {
            stopCamera(stream);
            return;
          }
          streamRef.current = stream;
          onReady?.();
        } catch (err) {
          if (mounted) {
            onError?.(
              err instanceof Error ? err : new Error("Camera access denied")
            );
          }
        }
      }

      init();

      return () => {
        mounted = false;
        if (streamRef.current) {
          stopCamera(streamRef.current);
          streamRef.current = null;
        }
      };
    }, [onReady, onError]);

    return (
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className={className}
        style={{ objectFit: "cover" }}
      />
    );
  }
);

export default CameraFeed;
