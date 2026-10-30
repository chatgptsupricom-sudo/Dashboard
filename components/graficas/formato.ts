import type { Formato } from "@/lib/graficas/tipos";

/** Número con el formato del panel (en-US, como `money()` de Administración). */
export function fmt(v: number | null | undefined, formato: Formato, compacto = false): string {
  if (v == null || Number.isNaN(v)) return "—";
  const n = Number(v);
  if (formato === "pct") return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} %`;
  if (formato === "dias") return `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} d`;
  const signo = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const pre = formato === "usd" ? "$" : "";
  // Un conteo (clientes, facturas) se lee completo hasta 100.000: "1 k" escondía 1.017.
  if (compacto && formato === "num" && a < 100_000) return `${signo}${a.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
  if (compacto && a >= 1_000_000) return `${signo}${pre}${(a / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: a >= 10_000_000 ? 1 : 2 })} M`;
  if (compacto && a >= 10_000) return `${signo}${pre}${(a / 1_000).toLocaleString("en-US", { maximumFractionDigits: 0 })} k`;
  if (compacto && a >= 1_000) return `${signo}${pre}${(a / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 })} k`;
  return `${signo}${pre}${a.toLocaleString("en-US", { maximumFractionDigits: formato === "usd" ? 0 : 1 })}`;
}

/** Variación con signo: "+12.3 %". */
export function fmtDelta(d: number): string {
  return `${d > 0 ? "+" : ""}${d.toLocaleString("en-US", { maximumFractionDigits: 1 })} %`;
}
