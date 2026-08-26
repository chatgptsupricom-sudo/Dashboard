"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { cn } from "@/lib/utils";

export type SignaturePadProps = {
  onChange?: (dataUrl: string | null) => void;
  label?: string;
  height?: number;
  disabled?: boolean;
};

const DEFAULT_HEIGHT = 150;
const BASELINE_OFFSET = 32;
const PEN_COLOR = "#1e293b";
const BASELINE_COLOR = "#cbd5e1";
const PLACEHOLDER_COLOR = "#94a3b8";
const MAX_DPR = 3;

type Point = { x: number; y: number };

export function SignaturePad({
  onChange,
  label,
  height = DEFAULT_HEIGHT,
  disabled = false,
}: SignaturePadProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isDrawing, setIsDrawing] = useState(false);

  const lastPointRef = useRef<Point | null>(null);
  const hasContentRef = useRef(false);
  const notifiedRef = useRef(false);
  const sizeRef = useRef({ cssWidth: 0, cssHeight: height, dpr: 1 });
  const isEmptyRef = useRef(true);
  const isDrawingRef = useRef(false);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    isEmptyRef.current = isEmpty;
  }, [isEmpty]);

  useEffect(() => {
    isDrawingRef.current = isDrawing;
  }, [isDrawing]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const drawBaseline = useCallback(
    (ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number) => {
      const { dpr } = sizeRef.current;
      const lineY = cssHeight - BASELINE_OFFSET;

      ctx.save();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.strokeStyle = BASELINE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(24, lineY);
      ctx.lineTo(cssWidth - 24, lineY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = BASELINE_COLOR;
      ctx.font = "bold 11px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("X", 14, lineY);
      ctx.fillText("X", cssWidth - 14, lineY);

      ctx.fillStyle = PLACEHOLDER_COLOR;
      ctx.font = "12px sans-serif";
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "center";
      ctx.fillText("Firma aquí", cssWidth / 2, lineY - 6);

      ctx.restore();
    },
    [],
  );

  const paintBackground = useCallback(
    (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
    },
    [],
  );

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;

    const dpr =
      typeof window !== "undefined"
        ? Math.min(window.devicePixelRatio || 1, MAX_DPR)
        : 1;
    const cssWidth = wrapper.clientWidth || 0;
    const cssHeight = height;

    sizeRef.current = { cssWidth, cssHeight, dpr };

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    paintBackground(ctx, canvas);

    if (isEmptyRef.current) {
      drawBaseline(ctx, cssWidth, cssHeight);
    }
  }, [height, drawBaseline, paintBackground]);

  useEffect(() => {
    setupCanvas();

    const wrapper = wrapperRef.current;
    if (!wrapper || typeof ResizeObserver === "undefined") return;

    const ro = new ResizeObserver(() => {
      const wasEmpty = isEmptyRef.current;
      setupCanvas();
      if (!wasEmpty) {
        hasContentRef.current = false;
        notifiedRef.current = false;
        isEmptyRef.current = true;
        setIsEmpty(true);
        onChangeRef.current?.(null);
      }
    });
    ro.observe(wrapper);
    return () => ro.disconnect();
  }, [setupCanvas]);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    setIsEmpty(true);
    isEmptyRef.current = true;
    hasContentRef.current = false;
    notifiedRef.current = false;
    lastPointRef.current = null;
    setIsDrawing(false);
    isDrawingRef.current = false;

    paintBackground(ctx, canvas);
    const { cssWidth, cssHeight } = sizeRef.current;
    if (cssWidth > 0) drawBaseline(ctx, cssWidth, cssHeight);

    onChangeRef.current?.(null);
  }, [drawBaseline, paintBackground]);

  const getPos = (
    e: React.PointerEvent<HTMLCanvasElement>,
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore unsupported environments
    }

    const pos = getPos(e);
    if (!pos) return;

    setIsDrawing(true);
    isDrawingRef.current = true;
    lastPointRef.current = pos;

    const { dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = PEN_COLOR;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pos.x / dpr, pos.y / dpr);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || disabled) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pos = getPos(e);
    if (!pos) return;
    const { dpr } = sizeRef.current;
    const posX = pos.x / dpr;
    const posY = pos.y / dpr;

    const last = lastPointRef.current;
    if (!last) {
      lastPointRef.current = pos;
      ctx.lineTo(posX, posY);
      ctx.stroke();
      hasContentRef.current = true;
      return;
    }

    const lastX = last.x / dpr;
    const lastY = last.y / dpr;
    const midX = (lastX + posX) / 2;
    const midY = (lastY + posY) / 2;
    ctx.quadraticCurveTo(lastX, lastY, midX, midY);
    ctx.stroke();

    lastPointRef.current = pos;
    hasContentRef.current = true;
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    const canvas = canvasRef.current;
    if (canvas) {
      try {
        if (canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      const ctx = canvas.getContext("2d");
      ctx?.closePath();
    }

    setIsDrawing(false);
    isDrawingRef.current = false;
    lastPointRef.current = null;

    if (hasContentRef.current && !notifiedRef.current && canvas) {
      notifiedRef.current = true;
      if (isEmptyRef.current) {
        isEmptyRef.current = false;
        setIsEmpty(false);
      }
      onChangeRef.current?.(canvas.toDataURL("image/png"));
    }
  };

  return (
    <div className="w-full">
      {label && (
        <p className="text-sm font-semibold text-slate-700 mb-1.5">{label}</p>
      )}
      <div
        ref={wrapperRef}
        className={cn(
          "relative w-full rounded-[10px] border border-slate-200 bg-white shadow-sm overflow-hidden",
          "transition-opacity",
          disabled && "opacity-50",
        )}
        style={{ height: `${height}px` }}
      >
        <canvas
          ref={canvasRef}
          className={cn(
            "block w-full h-full rounded-[10px]",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          )}
          style={{ touchAction: "none" }}
          aria-label={label ?? "Firma"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onPointerLeave={(e) => {
            if (isDrawingRef.current) handlePointerEnd(e);
          }}
        />
      </div>
      <div className="mt-1.5 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className={cn(
            "h-8 px-3 inline-flex items-center gap-1.5 rounded-[10px]",
            "text-xs font-semibold text-red-600 hover:bg-red-50",
            "transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent",
          )}
          aria-label="Limpiar firma"
        >
          <Eraser className="w-3.5 h-3.5" />
          Limpiar
        </button>
      </div>
    </div>
  );
}

export default SignaturePad;
