"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Calendar, RefreshCw, Wallet, CreditCard, Users } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

const COMPANY_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

type Acumulado = { monto: number; pct: number; facturas: number; clientes: number };
type Bucket = Acumulado & { dias: number | "Otros" };
type ContadoCreditoData = {
  totalFacturado: number;
  contado: Acumulado;
  credito: Acumulado;
  buckets: Bucket[];
  updatedAt: string;
};

export default function ContadoCreditoPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<ContadoCreditoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  const userCids = (user as any)?.cids;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (empresa) params.set("empresa", empresa);
      else if (userCids) params.set("userCids", String(userCids));
      params.set("month", String(selectedMonth));
      params.set("year", String(selectedYear));
      const res = await fetch(`/api/superadmin/cuentas-por-cobrar/contado-credito?${params}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) {
      console.error("Error:", e);
    }
    setLoading(false);
  }, [empresa, userCids, selectedMonth, selectedYear]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Contado / Crédito</h1>
          <p className="text-sm text-slate-500 mt-1">
            Supricom — {MONTHS[selectedMonth - 1]} {selectedYear}
            {data && <span className="ml-2 text-slate-400">| Actualizado: {new Date(data.updatedAt).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="text-sm bg-transparent border-none outline-none text-slate-700">
                <option value="">Todas las sedes</option>
                <option value="caracas">Caracas</option>
                <option value="valencia">Valencia</option>
                <option value="panama">Panamá</option>
              </select>
            </div>
          )}
          {userCids && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
              <Building2 size={14} className="text-slate-400" />
              <span className="text-sm text-slate-700">{COMPANY_MAP[userCids] || `Sede ${userCids}`}</span>
            </div>
          )}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1">
            <Calendar size={14} className="text-slate-400" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700">
              {MONTHS.map((m, i) => {
                const isFuture = selectedYear === now.getFullYear() && i > now.getMonth();
                return <option key={i} value={i + 1} disabled={isFuture}>{m}</option>;
              })}
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm bg-transparent border-none outline-none text-slate-700 ml-1">
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <button onClick={fetchData} className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-blue-700 transition">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Actualizar
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Cargando...</div>
      ) : !data ? (
        <div className="flex items-center justify-center h-64 text-slate-400">Sin datos para este período</div>
      ) : (
        <div className="space-y-6">
          {/* Total facturado */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5">
            <p className="text-xs text-slate-500 uppercase tracking-wide">Total Facturado del Mes</p>
            <p className="text-3xl font-bold text-slate-800 mt-1">{formatCurrency(data.totalFacturado)}</p>
            <div className="mt-4 h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${data.contado.pct}%` }} title={`Contado: ${data.contado.pct}%`} />
              <div className="h-full bg-blue-500" style={{ width: `${data.credito.pct}%` }} title={`Crédito: ${data.credito.pct}%`} />
            </div>
          </div>

          {/* Contado vs Credito */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white border border-emerald-200 bg-emerald-50/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-emerald-700">
                <Wallet size={18} />
                <p className="text-sm font-semibold">Contado</p>
              </div>
              <p className="text-3xl font-bold text-emerald-700 mt-2">{data.contado.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.contado.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.contado.facturas} facturas · {data.contado.clientes} clientes</p>
            </div>
            <div className="bg-white border border-blue-200 bg-blue-50/30 rounded-2xl p-5">
              <div className="flex items-center gap-2 text-blue-700">
                <CreditCard size={18} />
                <p className="text-sm font-semibold">Crédito</p>
              </div>
              <p className="text-3xl font-bold text-blue-700 mt-2">{data.credito.pct}%</p>
              <p className="text-lg font-semibold text-slate-700 mt-1">{formatCurrency(data.credito.monto)}</p>
              <p className="text-xs text-slate-500 mt-2">{data.credito.facturas} facturas · {data.credito.clientes} clientes</p>
            </div>
          </div>

          {/* Buckets de credito */}
          {data.buckets.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-3">Distribución del crédito por plazo</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {data.buckets.map((b) => (
                  <div key={String(b.dias)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{b.dias === "Otros" ? "Otros" : `${b.dias} días`}</p>
                    <p className="text-xl font-bold text-slate-800 mt-1">{b.pct}%</p>
                    <p className="text-xs text-slate-600 mt-1">{formatCurrency(b.monto)}</p>
                    <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                      <Users size={12} />
                      {b.clientes} cliente{b.clientes !== 1 ? "s" : ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
