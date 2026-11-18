"use client";

import { COLOR, COLORES, ESTADOS_SOLICITUD, type Celda, type Color, type EstadoSolicitud } from "@/lib/rotacion-inventario/tipos";

export function Luz({ color, tam = 10 }: { color: Color; tam?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: tam, height: tam, background: COLOR[color].hex }} aria-hidden />;
}

export function InsigniaColor({ color }: { color: Color }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${COLOR[color].fondo} ${COLOR[color].texto}`}>
      <Luz color={color} tam={8} />
      {COLOR[color].label}
    </span>
  );
}

export function InsigniaEstado({ estado }: { estado: EstadoSolicitud }) {
  const e = ESTADOS_SOLICITUD.find((x) => x.value === estado);
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${e?.color ?? ""}`}>{e?.label ?? estado}</span>;
}

/** Barra apilada verde/amarillo/rojo por valor a costo. */
export function BarraColores({ porColor, alto = 8 }: { porColor: Record<Color, Celda>; alto?: number }) {
  const total = COLORES.reduce((a, c) => a + porColor[c].valor, 0);
  if (total <= 0) return <div className="w-full rounded-full bg-slate-100" style={{ height: alto }} />;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-slate-100" style={{ height: alto }}>
      {COLORES.map((c) =>
        porColor[c].valor > 0 ? (
          <div
            key={c}
            style={{ width: `${(porColor[c].valor / total) * 100}%`, background: COLOR[c].hex }}
            title={`${COLOR[c].label}: ${usd(porColor[c].valor)}`}
          />
        ) : null,
      )}
    </div>
  );
}

/** Barra de avance contra una meta (verde ≥ 100 %, ámbar ≥ 50 %, rojo debajo). */
export function Avance({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-slate-300">—</span>;
  const color = valor >= 100 ? "bg-emerald-500" : valor >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block h-1.5 w-12 rounded-full bg-slate-100 overflow-hidden">
        <span className={`block h-full ${color}`} style={{ width: `${Math.min(100, valor)}%` }} />
      </span>
      <span className="text-xs tabular-nums">{valor.toFixed(0)}%</span>
    </span>
  );
}

export const usd = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: dec, maximumFractionDigits: dec });

export const num = (n: number | null | undefined, dec = 0) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: dec, minimumFractionDigits: 0 });

export const fecha = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, dd] = d.slice(0, 10).split("-");
  return `${dd}/${m}/${y}`;
};

export async function pedir<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers || {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `Error ${r.status}`), { odooCaido: !!j.odooCaido });
  return j as T;
}
