"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Download,
  Loader2,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { PopMovement, PopMovementType } from "@/lib/adminleads/material-pop/types";
import { POP_LOCATION_LABELS } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPE_META: Record<PopMovementType, { label: string; icon: React.ElementType; cls: string }> = {
  entry: {
    label: "Entrada",
    icon: ArrowDownToLine,
    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  exit: {
    label: "Salida",
    icon: ArrowUpFromLine,
    cls: "bg-red-50 text-red-700 ring-red-200",
  },
  transfer: {
    label: "Traslado",
    icon: ArrowLeftRight,
    cls: "bg-blue-50 text-blue-700 ring-blue-200",
  },
  adjustment: {
    label: "Ajuste",
    icon: SlidersHorizontal,
    cls: "bg-amber-50 text-amber-700 ring-amber-200",
  },
};

export function HistoryTab({ onGoToCatalog }: { onGoToCatalog: () => void }) {
  const [movements, setMovements] = useState<PopMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [limit, setLimit] = useState(50);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);

  async function load(resetLimit = false) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (type) params.set("type", type);
      if (q.trim()) params.set("q", q.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("limit", String(resetLimit ? 500 : limit));
      params.set("offset", String(resetLimit ? 0 : page * limit));

      const res = await fetch(
        `/api/adminleads/material-pop/movements?${params.toString()}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Error cargando historial");
      setMovements(json.movements || []);
      setTotal(Number(json.pagination?.total || 0));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      if (cancelled) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (type) params.set("type", type);
        if (q.trim()) params.set("q", q.trim());
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        params.set("limit", String(limit));
        params.set("offset", String(page * limit));
        const res = await fetch(
          `/api/adminleads/material-pop/movements?${params.toString()}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Error");
        if (!cancelled) {
          setMovements(json.movements || []);
          setTotal(Number(json.pagination?.total || 0));
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [type, q, from, to, limit, page]);

  async function exportCsv() {
    if (movements.length === 0) return;
    const header = [
      "Fecha", "Tipo", "Producto", "SKU", "Ubicación", "Cantidad",
      "Motivo", "Cliente/Destino", "Registrado por",
    ];
    const lines = movements.map((m) =>
      [
        m.movement_date,
        TYPE_META[m.type].label,
        m.product_name,
        m.product_code,
        POP_LOCATION_LABELS[m.location as keyof typeof POP_LOCATION_LABELS] ||
          (m.source_location && m.target_location
            ? `${POP_LOCATION_LABELS[m.source_location as keyof typeof POP_LOCATION_LABELS]} → ${POP_LOCATION_LABELS[m.target_location as keyof typeof POP_LOCATION_LABELS]}`
            : ""),
        m.quantity,
        m.reason_custom || m.reason_type,
        m.client_name || m.destination || "",
        m.created_by_name || "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `material_pop_historial_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[180px] flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar producto, SKU o cliente..."
            className="pl-9"
          />
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
        >
          <option value="">Todos los tipos</option>
          <option value="entry">Entradas</option>
          <option value="exit">Salidas</option>
          <option value="transfer">Traslados</option>
          <option value="adjustment">Ajustes</option>
        </select>
        <Input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="h-9 w-auto"
          aria-label="Desde"
        />
        <Input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="h-9 w-auto"
          aria-label="Hasta"
        />
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={exportCsv}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => { setLimit(limit === 50 ? 100 : 50); setPage(0); }}>
          {limit === 50 ? "Ver 100" : "Ver 50"}
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando movimientos…
        </div>
      ) : error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 py-16 text-center">
          <p className="text-sm font-medium text-slate-600">Sin movimientos</p>
          <p className="text-xs text-slate-400">
            Registra entradas o salidas para ver el historial aquí.
          </p>
           <Button size="sm" onClick={onGoToCatalog}>
            Ir a catálogo
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Ubicación</th>
                <th className="px-4 py-3 text-right font-medium">Cant.</th>
                <th className="px-4 py-3 font-medium">Motivo</th>
                <th className="px-4 py-3 font-medium">Cliente / Destino</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movements.map((m) => {
                const meta = TYPE_META[m.type];
                const loc =
                  m.type === "transfer"
                    ? `${POP_LOCATION_LABELS[m.source_location as keyof typeof POP_LOCATION_LABELS]} → ${POP_LOCATION_LABELS[m.target_location as keyof typeof POP_LOCATION_LABELS]}`
                    : POP_LOCATION_LABELS[m.location as keyof typeof POP_LOCATION_LABELS] || "—";
                return (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                      {m.movement_date}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", meta.cls)}>
                        <meta.icon className="h-3 w-3" />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[11px] text-slate-400">{m.product_code}</span>
                      <span className="ml-2 text-slate-800">{m.product_name}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{loc}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      {m.quantity}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {m.reason_custom || m.reason_type}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {m.client_name || m.destination || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>{total} movimientos</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
                Anterior
              </Button>
              <span>Página {page + 1} de {Math.max(1, Math.ceil(total / limit))}</span>
              <Button type="button" variant="outline" size="sm" disabled={(page + 1) * limit >= total} onClick={() => setPage((current) => current + 1)}>
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
