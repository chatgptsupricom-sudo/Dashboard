import { ESTADO_BADGE, ESTADO_LABEL, type OrdenEstado } from "@/lib/compras/ordenes-types";
import { cn } from "@/lib/utils";

export function OrdenEstadoBadge({
  estado,
  className,
}: {
  estado: OrdenEstado;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        ESTADO_BADGE[estado],
        className,
      )}
    >
      {ESTADO_LABEL[estado]}
    </span>
  );
}
