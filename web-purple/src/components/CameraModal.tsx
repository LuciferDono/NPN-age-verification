import React, { useEffect, useRef, useState } from "react";
import { Camera, RefreshCw, X, Check } from "lucide-react";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (blob: Blob, previewUrl: string) => void;
}

export const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        setStream(null);
      }
      return;
    }

    let activeStream: MediaStream | null = null;

    async function initCamera() {
      try {
        setCameraError(null);
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 640 },
            facingMode: "user",
          },
          audio: false,
        });
        activeStream = mediaStream;
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        setCameraError(
          "Unable to access camera. Please allow webcam permissions or use local image upload."
        );
      }
    }

    initCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [isOpen]);

  const handleSnap = () => {
    if (!videoRef.current || !canvasRef.current) return;
    setCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const size = Math.min(video.videoWidth || 480, video.videoHeight || 480);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Crop center square
    const sx = ((video.videoWidth || size) - size) / 2;
    const sy = ((video.videoHeight || size) - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (blob) {
          const url = URL.createObjectURL(blob);
          onCapture(blob, url);
          onClose();
        }
      },
      "image/jpeg",
      0.92
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Camera className="size-5 text-cyan-400" />
            <h3 className="font-semibold text-slate-100">Live Biometric Scanner</h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Video Frame */}
        <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center text-sm text-rose-400">
              <p>{cameraError}</p>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />

              {/* Clinical Reticle Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-12">
                <div className="relative h-full w-full rounded-full border-2 border-dashed border-cyan-400/50">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-cyan-950/90 border border-cyan-500/40 px-2 py-0.5 font-mono text-[9px] text-cyan-300">
                    ALIGN FACE WITHIN GUIDES
                  </div>
                  {/* Crosshairs */}
                  <div className="absolute top-1/2 left-0 w-3 h-0.5 bg-cyan-400/80 -translate-y-1/2" />
                  <div className="absolute top-1/2 right-0 w-3 h-0.5 bg-cyan-400/80 -translate-y-1/2" />
                  <div className="absolute top-0 left-1/2 h-3 w-0.5 bg-cyan-400/80 -translate-x-1/2" />
                  <div className="absolute bottom-0 left-1/2 h-3 w-0.5 bg-cyan-400/80 -translate-x-1/2" />
                </div>
              </div>
            </>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-900/90 px-5 py-4">
          <div className="text-[11px] text-slate-400">
            <span className="text-cyan-400 font-mono">HIPAA</span>: Specimen is hashed in memory and never stored.
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSnap}
              disabled={!!cameraError || capturing}
              className="flex items-center gap-2 rounded-lg bg-cyan-500 px-5 py-2 text-xs font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-400 disabled:opacity-50"
            >
              {capturing ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Capture Specimen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
