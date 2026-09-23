"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { AlertTriangle, Copy, Plus, Search } from "lucide-react";
import { nivelContraMeta, NIVEL_CHIP } from "@/lib/stoplight/scoring";

interface Meta {
  marcaId: number;
  marca: string;
  meta: number;
  peso: number;
  metaAlDia: number;
  real: number;
  cumplimiento: number | null;
}
interface Marca {
  marcaId: number;
  marca: string;
  promedio3m: number;
  vendidoMes: number;
}
interface Datos {
  mes: string;
  companyId: number;
  cobertura: { mes: number | null; semanas: (number | null)[] };
  metas: Meta[];
  marcas: Marca[];
}

interface Props {
  /** Solo /api/superadmin/stoplight tiene metas-marca. */
  companyId: number | null;
  mes: string;
  /** Superadmin: edita las metas (como la columna META de la grilla). */
  puedeEditar: boolean;
  /** Avisa que cambió una meta, para recargar la grilla. */
  onChange?: () => void;
}

/**
 * Metas de venta por marca de Cobertura de marcas (lib/stoplight/metasMarca):
 * el superadmin carga la meta del mes de cada marca; todos ven el peso, lo
 * vendido y el cumplimiento, y la cobertura resultante.
 */
export default function MetasMarcaPanel({ companyId, mes, puedeEditar, onChange }: Props) {
  const t = useTranslations("stoplight");
  const locale = useLocale();
  const [data, setData] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [editando, setEditando] = useState<Record<number, string>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [copiando, setCopiando] = useState(false);

  const query = useMemo(() => {
    const p = new URLSearchParams({ mes });
    if (companyId != null) p.set("company_id", String(companyId));
    return p.toString();
  }, [mes, companyId]);

  useEffect(() => {
    let cancelado = false;
    setCargando(true);
    setError(false);
    fetch(`/api/superadmin/stoplight/metas-marca?${query}`)
      .then(async (r) => {
        const json = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && json?.success) { setData(json.data); setEditando({}); }
        else setError(true);
      })
      .catch(() => { if (!cancelado) setError(true); })
      .finally(() => { if (!cancelado) setCargando(false); });
    return () => { cancelado = true; };
  }, [query, recarga]);

  const dinero = (n: number) => `$${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`;

  const guardar = async (marcaId: number, marca: string, valor: string) => {
    const meta = parseFloat(valor.replace(/,/g, "")) || 0;
    const actual = data?.metas.find((m) => m.marcaId === marcaId)?.meta ?? 0;
    if (meta === actual) return;
    setGuardando(marcaId);
    try {
      const r = await fetch("/api/superadmin/stoplight/metas-marca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId ?? data?.companyId, mes, marca_id: marcaId, marca, meta }),
      });
      if (r.ok) { setRecarga((n) => n + 1); onChange?.(); }
    } finally {
      setGuardando(null);
    }
  };

  const copiarMesAnterior = async () => {
    setCopiando(true);
    try {
      const r = await fetch("/api/superadmin/stoplight/metas-marca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId ?? data?.companyId, mes, accion: "copiar" }),
      });
      if (r.ok) { setRecarga((n) => n + 1); onChange?.(); }
    } finally {
      setCopiando(false);
    }
  };

  if (cargando && !data) {
    return <div className="h-64 rounded-xl bg-slate-100 animate-pulse" />;
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="text-amber-500" size={24} />
        <p className="text-sm text-slate-600">{t("metas_marca_error")}</p>
        <button onClick={() => setRecarga((n) => n + 1)} className="h-8 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50">
          {t("margen_reintentar")}
        </button>
      </div>
    );
  }

  const conMeta = new Set(data.metas.map((m) => m.marcaId));
  const historial = new Map(data.marcas.map((m) => [m.marcaId, m]));
  const q = busqueda.trim().toLowerCase();
  // Marcas sin meta que se pueden agregar: las vendidas en los últimos meses.
  const candidatas = data.marcas.filter((m) => !conMeta.has(m.marcaId) && (!q || m.marca.toLowerCase().includes(q))).slice(0, q ? 30 : 12);
  const cobertura = data.cobertura.mes;
  const nivel = nivelContraMeta(cobertura, 100);

  const inputMeta = (marcaId: number, marca: string, valor: number) => (
    <input
      type="number"
      min={0}
      value={editando[marcaId] ?? (valor ? String(valor) : "")}
      placeholder="0"
      disabled={guardando === marcaId}
      onChange={(e) => setEditando((x) => ({ ...x, [marcaId]: e.target.value }))}
      onBlur={(e) => guardar(marcaId, marca, e.target.value)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-28 text-right text-sm tabular-nums bg-slate-50 border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:opacity-50"
    />
  );

  return (
    <div className="space-y-5">
      {/* Resumen */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{t("metas_marca_cobertura")}</p>
          {cobertura == null ? (
            <p className="text-sm text-slate-600 mt-1">{t("metas_marca_sin_metas")}</p>
          ) : (
            <p className="mt-1 flex items-center gap-2">
              <span className={`inline-flex rounded-md px-2 py-0.5 text-lg font-bold tabular-nums ring-1 ring-inset ${NIVEL_CHIP[nivel]}`}>{cobertura}%</span>
              <span className="text-xs text-slate-500">{t("metas_marca_formula")}</span>
            </p>
          )}
        </div>
        {puedeEditar && data.metas.length === 0 && (
          <button
            onClick={copiarMesAnterior}
            disabled={copiando}
            className="inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Copy size={14} /> {t("metas_marca_copiar")}
          </button>
        )}
      </div>

      {/* Metas del mes */}
      {data.metas.length > 0 && (
        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-left">{t("marca")}</th>
                <th className="px-3 py-2.5 text-right">{t("metas_marca_meta")}</th>
                <th className="px-3 py-2.5 text-right">{t("metas_marca_peso")}</th>
                <th className="px-3 py-2.5 text-right">{t("metas_marca_meta_al_dia")}</th>
                <th className="px-3 py-2.5 text-right">{t("metas_marca_vendido")}</th>
                <th className="px-3 py-2.5 text-center">{t("metas_marca_cumplimiento")}</th>
                <th className="px-3 py-2.5 text-right">{t("metas_marca_promedio")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.metas.map((m) => (
                <tr key={m.marcaId}>
                  <td className="px-3 py-2 font-medium text-slate-800">{m.marca}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{puedeEditar ? inputMeta(m.marcaId, m.marca, m.meta) : dinero(m.meta)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{m.peso}%</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">{dinero(m.metaAlDia)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{dinero(m.real)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`inline-flex min-w-[56px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${NIVEL_CHIP[nivelContraMeta(m.cumplimiento, 100)]}`}>
                      {m.cumplimiento == null ? "–" : `${m.cumplimiento}%`}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-400">{dinero(historial.get(m.marcaId)?.promedio3m ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Agregar marcas (superadmin) */}
      {puedeEditar && (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-700"><Plus size={15} /> {t("metas_marca_agregar")}</p>
            <div className="relative w-full max-w-xs">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder={t("metas_marca_buscar")}
                className="w-full h-8 pl-8 pr-3 text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              />
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {candidatas.map((m) => (
              <div key={m.marcaId} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="text-slate-700">{m.marca}</span>
                <span className="flex items-center gap-4">
                  <span className="text-xs text-slate-400">{t("metas_marca_promedio")}: {dinero(m.promedio3m)}</span>
                  {inputMeta(m.marcaId, m.marca, 0)}
                </span>
              </div>
            ))}
            {candidatas.length === 0 && <p className="py-3 text-center text-xs text-slate-400">{t("no_available_data")}</p>}
          </div>
        </div>
      )}

      <p className="text-[11px] leading-relaxed text-slate-400">{t("metas_marca_nota")}</p>
    </div>
  );
}
