"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Calendar, RefreshCw, ThumbsUp, ThumbsDown, Info } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

type Cliente = {
  partnerId: number;
  partnerName: string;
  diasAtrasoPromedio: number;
  facturasPagadas: number;
  montoTotal: number;
  creditLimit: number | null;
  creditUsado: number | null;
  utilizacionPct: number | null;
  clasificacion: "buena_paga" | "mala_paga";
  sugerencia: string;
};

type Data = {
  buenaPaga: Cliente[];
  malaPaga: Cliente[];
  meses: number;
  totalClientesConHistorial: number;
  criterios: {
    diasBuenaPaga: number;
    diasMalaPagaSevera: number;
    utilizacionAlta: number;
    minFacturasParaClasificar: number;
  };
  updatedAt: string;
};

function sugerenciaBadge(sugerencia: string) {
  const estilos: Record<string, string> = {
    "Subir crédito": "bg-emerald-100 text-emerald-700",
    "Mantener crédito": "bg-slate-100 text-slate-600",
    "Bajar crédito": "bg-amber-100 text-amber-700",
    "Quitar crédito": "bg-red-100 text-red-700",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${estilos[sugerencia] || "bg-slate-100 text-slate-600"}`}>
      {sugerencia}
    </span>
  );
}

function TablaClientes({ clientes, tono }: { clientes: Cliente[]; tono: "verde" | "rojo" }) {
  if (clientes.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Sin clientes en esta lista para el período elegido.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
            <th className="py-2 pr-3 font-medium">Cliente</th>
            <th className="py-2 px-3 font-medium text-right">Días atraso prom.</th>
            <th className="py-2 px-3 font-medium text-right">Facturas</th>
            <th className="py-2 px-3 font-medium text-right">Monto pagado</th>
            <th className="py-2 px-3 font-medium text-right">Cupo Odoo</th>
            <th className="py-2 px-3 font-medium text-right">Uso cupo</th>
            <th className="py-2 pl-3 font-medium text-right">Sugerencia</th>
          </tr>
        </thead>
        <tbody>
          {clientes.map((c) => (
            <tr key={c.partnerId} className="border-b border-slate-50 hover:bg-slate-50/60">
              <td className="py-2.5 pr-3 font-medium text-slate-800">{c.partnerName}</td>
              <td className={`py-2.5 px-3 text-right tabular-nums font-semibold ${tono === "verde" ? "text-emerald-600" : "text-red-600"}`}>
                {c.diasAtrasoPromedio}d
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">{c.facturasPagadas}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-slate-700">{formatCurrency(c.montoTotal)}</td>
              <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                {c.creditLimit != null ? formatCurrency(c.creditLimit) : "—"}
              </td>
              <td className="py-2.5 px-3 text-right tabular-nums text-slate-500">
                {c.utilizacionPct != null ? `${c.utilizacionPct}%` : "—"}
              </td>
              <td className="py-2.5 pl-3 text-right">{sugerenciaBadge(c.sugerencia)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ClasificacionClientesPage() {
  const { user } = useAuthStore();
  const userCids = user?.cids ? Number(user.cids) : undefined;

  const [empresa, setEmpresa] = useState("");
  const [meses, setMeses] = useState(6);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ meses: String(meses) });
      if (empresa) params.set("empresa", empresa);
      if (userCids) params.set("userCids", String(userCids));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/clasificacion-clientes?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar la clasificación");
      setData(json.data);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [empresa, meses, userCids]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clasificación de Clientes</h1>
          <p className="text-sm text-slate-500 mt-1">
            Buena paga / mala paga según su historial real de pagos, últimos {meses} {meses === 1 ? "mes" : "meses"}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids ? (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select value={meses} onChange={(e) => setMeses(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
              <option value={3}>Últimos 3 meses</option>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
              <option value={24}>Últimos 24 meses</option>
            </select>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-4 mb-6">{error}</div>
      )}

      {loading && !data ? (
        <div className="text-center py-20 text-slate-400 text-sm">Cargando...</div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="bg-white border border-emerald-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-emerald-100 text-emerald-600 rounded-lg p-1.5">
                  <ThumbsUp size={16} />
                </div>
                <h2 className="font-semibold text-slate-800">Buena Paga</h2>
                <span className="text-xs text-slate-400">({data.buenaPaga.length})</span>
              </div>
              <TablaClientes clientes={data.buenaPaga} tono="verde" />
            </div>

            <div className="bg-white border border-red-200 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-red-100 text-red-600 rounded-lg p-1.5">
                  <ThumbsDown size={16} />
                </div>
                <h2 className="font-semibold text-slate-800">Mala Paga</h2>
                <span className="text-xs text-slate-400">({data.malaPaga.length})</span>
              </div>
              <TablaClientes clientes={data.malaPaga} tono="rojo" />
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-xl p-3">
            <Info size={14} className="shrink-0 mt-0.5" />
            <p>
              Se clasifica por el promedio de días de atraso entre la fecha de vencimiento de cada factura y la fecha real
              en que se concilió el pago (no la fecha de la factura). Buena paga: promedio ≤ {data.criterios.diasBuenaPaga} días.
              Mala paga: más de {data.criterios.diasBuenaPaga} días; si el promedio supera {data.criterios.diasMalaPagaSevera} días
              se sugiere quitar el crédito en vez de solo bajarlo. Para buena paga, si además usa {data.criterios.utilizacionAlta}%
              o más de su cupo actual, se sugiere subirlo. Clientes con menos de {data.criterios.minFacturasParaClasificar} facturas
              cobradas en el período ({data.totalClientesConHistorial} clasificados en total) no aparecen -- no hay historial
              suficiente para juzgarlos. Estos umbrales son ajustables si el negocio quiere otro criterio.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
