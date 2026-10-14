"use client";

import { Input } from "@/components/ui/input";
import { formatoMonto } from "@/lib/notas-credito/tipos";
import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";

export type FacturaElegida = {
  id: number;
  nombre: string;
  fecha: string | null;
  cliente: string;
  moneda: string;
  total: number;
  acreditado: number;
};

/** Busca facturas de cliente publicadas de la sede (número o cliente) en Odoo. */
export function FacturaBuscador({
  companyId,
  onElegir,
  elegida,
}: {
  companyId: number;
  onElegir: (f: FacturaElegida | null) => void;
  elegida: FacturaElegida | null;
}) {
  const [q, setQ] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resultados, setResultados] = useState<FacturaElegida[]>([]);

  useEffect(() => {
    if (q.trim().length < 3) {
      setResultados([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setCargando(true);
      setError("");
      try {
        const r = await fetch(`/api/notas-credito/facturas?company_id=${companyId}&q=${encodeURIComponent(q.trim())}`, {
          signal: ctrl.signal,
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "No se pudo buscar en Odoo");
        setResultados(j.facturas || []);
      } catch (e: any) {
        if (e?.name !== "AbortError") setError(e?.message || "No se pudo buscar en Odoo");
      } finally {
        setCargando(false);
      }
    }, 350);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, companyId]);

  if (elegida) {
    return (
      <div className="flex items-start justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
        <div>
          <p className="font-semibold text-slate-800">Factura {elegida.nombre}</p>
          <p className="text-slate-600">{elegida.cliente}</p>
          <p className="text-xs text-slate-500">
            {elegida.fecha || "—"} · Total {formatoMonto(elegida.total, elegida.moneda)}
            {elegida.acreditado > 0 ? ` · ya acreditado ${formatoMonto(elegida.acreditado, elegida.moneda)}` : ""}
          </p>
        </div>
        <button type="button" className="text-xs font-medium text-blue-700 hover:underline" onClick={() => onElegir(null)}>
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número de factura o cliente" className="pl-9" />
        {cargando && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {resultados.length > 0 && (
        <div className="max-h-56 overflow-y-auto rounded-xl border divide-y">
          {resultados.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onElegir(f)}
              className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              <span>
                <span className="font-medium text-slate-800">{f.nombre}</span>
                <span className="block text-xs text-slate-500">{f.cliente}</span>
              </span>
              <span className="shrink-0 text-right text-xs text-slate-500">
                {formatoMonto(f.total, f.moneda)}
                <br />
                {f.fecha || ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {!cargando && q.trim().length >= 3 && !resultados.length && !error && (
        <p className="text-xs text-slate-400">Sin facturas publicadas que coincidan.</p>
      )}
    </div>
  );
}
