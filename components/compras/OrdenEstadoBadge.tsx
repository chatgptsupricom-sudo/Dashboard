import {
  ESTADO_BADGE,
  ESTADO_DOT,
  ESTADO_LABEL,
  type OrdenEstado,
} from "@/lib/compras/ordenes-types";
import { cn } from "@/lib/utils";

export function OrdenEstadoBadge({
  estado,
  className,
  dot = true,
}: {
  estado: OrdenEstado;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        ESTADO_BADGE[estado],
        className,
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", ESTADO_DOT[estado])} />}
      {ESTADO_LABEL[estado]}
    </span>
  );
}
