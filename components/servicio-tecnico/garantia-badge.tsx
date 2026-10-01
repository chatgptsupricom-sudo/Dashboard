import { CheckCircle2, HelpCircle, Infinity as InfinityIcon, Info } from "lucide-react";

export type EstadoGarantiaUI =
  | "en_garantia"
  | "vencida"
  | "vida_util"
  | "indeterminada"
  | string;

/**
 * Cómo se le dice al cliente si su equipo está cubierto (issue #29).
 *
 * El tono importa tanto como el dato:
 *
 * - Vencida NO va en rojo ni con cara de error. El cliente no hizo nada mal, y
 *   sobre todo: estar fuera de garantía NO impide reportar. Un equipo vencido
 *   igual se repara cobrando; si el portal lo presenta como un rechazo, se
 *   pierde esa venta de servicio y el cliente termina llamando por teléfono,
 *   que es justo lo que este portal viene a evitar.
 *
 * - Indeterminada no promete nada. Es mucho mejor decir "lo confirmamos al
 *   revisar tu caso" que arriesgar una respuesta equivocada: prometer una
 *   cobertura que no existe la termina pagando Supricom.
 */
const ESTILOS: Record<
  string,
  { fondo: string; texto: string; borde: string }
> = {
  en_garantia: {
    fondo: "bg-emerald-50",
    texto: "text-emerald-800",
    borde: "border-emerald-200",
  },
  vida_util: {
    fondo: "bg-[color:var(--portal-primary-soft)]",
    texto: "text-[color:var(--portal-primary)]",
    borde: "border-[color:var(--portal-primary)]",
  },
  vencida: {
    fondo: "bg-amber-50",
    texto: "text-amber-900",
    borde: "border-amber-200",
  },
  indeterminada: {
    fondo: "bg-[color:var(--portal-surface-soft)]",
    texto: "text-[color:var(--portal-muted)]",
    borde: "border-[color:var(--portal-line)]",
  },
};

function Icono({ estado }: { estado: EstadoGarantiaUI }) {
  const clase = "h-4 w-4 shrink-0";
  if (estado === "en_garantia") return <CheckCircle2 className={clase} aria-hidden />;
  if (estado === "vida_util") return <InfinityIcon className={clase} aria-hidden />;
  if (estado === "vencida") return <Info className={clase} aria-hidden />;
  return <HelpCircle className={clase} aria-hidden />;
}

export function GarantiaBadge({
  estado,
  etiqueta,
  detalle,
  compacto = false,
}: {
  estado: EstadoGarantiaUI;
  etiqueta: string;
  detalle?: string;
  compacto?: boolean;
}) {
  const estilo = ESTILOS[estado] ?? ESTILOS.indeterminada;

  if (compacto) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${estilo.fondo} ${estilo.texto} ${estilo.borde}`}
      >
        <Icono estado={estado} />
        {etiqueta}
      </span>
    );
  }

  return (
    <div
      className={`flex gap-2 rounded-[10px] border p-3 text-sm ${estilo.fondo} ${estilo.texto} ${estilo.borde}`}
    >
      <span className="mt-0.5">
        <Icono estado={estado} />
      </span>
      <span>
        <span className="block font-semibold">{etiqueta}</span>
        {detalle && <span className="mt-0.5 block opacity-90">{detalle}</span>}
      </span>
    </div>
  );
}
