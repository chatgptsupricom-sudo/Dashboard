"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type StarRatingSize = "sm" | "md" | "lg";

export interface StarRatingProps {
  value: number;
  onChange?: (value: number) => void;
  readonly?: boolean;
  size?: StarRatingSize;
  showValue?: boolean;
  className?: string;
  ariaLabel?: string;
}

const SIZE_PX: Record<StarRatingSize, number> = {
  sm: 16,
  md: 20,
  lg: 28,
};

const COLOR_FILLED = "#741DFE";
const COLOR_EMPTY = "#cbd5e1";

const STAR_COUNT = 5;

function clamp(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return 0;
  return Math.min(max, Math.max(min, n));
}

function formatValue(v: number) {
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

interface FractionalStarProps {
  fraction: number;
  px: number;
}

function FractionalStar({ fraction, px }: FractionalStarProps) {
  const pct = clamp(fraction, 0, 1) * 100;
  return (
    <span
      className="relative inline-block shrink-0"
      style={{ width: px, height: px, lineHeight: 0 }}
      aria-hidden
    >
      <Star
        width={px}
        height={px}
        strokeWidth={1.5}
        style={{ color: COLOR_EMPTY, fill: "none", display: "block" }}
      />
      {pct > 0 && (
        <span
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
          style={{ width: `${pct}%` }}
        >
          <Star
            width={px}
            height={px}
            strokeWidth={1.5}
            style={{
              color: COLOR_FILLED,
              fill: COLOR_FILLED,
              stroke: COLOR_FILLED,
              display: "block",
            }}
          />
        </span>
      )}
    </span>
  );
}

interface InteractiveStarProps {
  index: number;
  filled: boolean;
  px: number;
  onSelect: (i: number) => void;
  onHover: (i: number) => void;
}

function InteractiveStar({
  index,
  filled,
  px,
  onSelect,
  onHover,
}: InteractiveStarProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(index)}
      onMouseEnter={() => onHover(index)}
      onFocus={() => onHover(index)}
      aria-label={`${index} ${index === 1 ? "estrella" : "estrellas"}`}
      className={cn(
        "inline-flex items-center justify-center rounded-sm border-0 bg-transparent p-0 m-0 cursor-pointer",
        "transition-transform duration-150 ease-out hover:scale-110",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-1"
      )}
    >
      <Star
        width={px}
        height={px}
        strokeWidth={1.5}
        style={{
          color: filled ? COLOR_FILLED : COLOR_EMPTY,
          fill: filled ? COLOR_FILLED : "none",
          transition: "color 120ms ease, fill 120ms ease",
        }}
      />
    </button>
  );
}

export function StarRating({
  value,
  onChange,
  readonly = false,
  size = "md",
  showValue = false,
  className,
  ariaLabel,
}: StarRatingProps) {
  const interactive = !readonly && typeof onChange === "function";
  const [hover, setHover] = useState<number | null>(null);
  const safeValue = clamp(value, 0, STAR_COUNT);
  const px = SIZE_PX[size];
  const previewValue = hover !== null ? hover : safeValue;

  const handleSelect = (i: number) => {
    onChange?.(i);
  };

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 align-middle", className)}
      role={interactive ? "group" : "img"}
      aria-label={
        ariaLabel ??
        (interactive
          ? "Calificación"
          : `Calificación: ${formatValue(safeValue)} de ${STAR_COUNT}`)
      }
      onMouseLeave={interactive ? () => setHover(null) : undefined}
    >
      <span
        className="inline-flex items-center"
        style={{ gap: size === "lg" ? 4 : 2 }}
      >
        {Array.from({ length: STAR_COUNT }, (_, i) => {
          const index = i + 1;
          if (interactive) {
            return (
              <InteractiveStar
                key={index}
                index={index}
                filled={index <= previewValue}
                px={px}
                onSelect={handleSelect}
                onHover={setHover}
              />
            );
          }
          const fraction = clamp(safeValue - i, 0, 1);
          return <FractionalStar key={index} fraction={fraction} px={px} />;
        })}
      </span>
      {showValue && !interactive && (
        <span
          className={cn(
            "font-semibold text-slate-700 tabular-nums",
            size === "sm" && "text-xs",
            size === "md" && "text-sm",
            size === "lg" && "text-base"
          )}
        >
          {formatValue(safeValue)}
        </span>
      )}
    </span>
  );
}

export function StarRatingDisplay(props: StarRatingProps) {
  return <StarRating {...props} readonly onChange={undefined} />;
}

export default StarRating;
