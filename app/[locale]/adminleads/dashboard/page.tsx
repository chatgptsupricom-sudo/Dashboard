"use client";

import { useEffect, useState } from "react";
import { BarChart3, Calendar } from "lucide-react";
import { BrandBubbles } from "@/components/dashboard/brand-bubbles";
import { RotacionSkus } from "@/components/adminleads/RotacionSkus";
import { veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { useAuthStore } from "@/lib/stores/auth.store";

function hace3Meses(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() - 3, d.getDate())
    .toISOString()
    .slice(0, 10);
}
function hoy(): string {
  return new Date().toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "30 días", meses: 1 },
  { label: "3 meses", meses: 3 },
  { label: "6 meses", meses: 6 },
  { label: "12 meses", meses: 12 },
];

// SuperAdmin e Inteligencia de Negocio eligen sede (resolverCompanies).
const SEDES = [
  { label: "Valencia y Caracas", valor: "venezuela" },
  { label: "Valencia", valor: "9" },
  { label: "Caracas", valor: "10" },
];

export default function AdminLeadsDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(hace3Meses());
  const [hasta, setHasta] = useState(hoy());
  const { user } = useAuthStore();
  const eligeSede = veTodasLasSedes(user?.role);
  const [sede, setSede] = useState("venezuela");
  const sedeParam = eligeSede ? sede : undefined;

  useEffect(() => {
    async function fetchStats() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/adminleads/product-stats?desde=${desde}&hasta=${hasta}${sedeParam ? `&sede=${sedeParam}` : ""}`,
        );
        const json = await res.json();
        if (json.success) setData(json);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, [desde, hasta, sedeParam]);

  const aplicarPreset = (meses: number) => {
    const d = new Date();
    setDesde(new Date(d.getFullYear(), d.getMonth() - meses, d.getDate()).toISOString().slice(0, 10));
    setHasta(hoy());
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 rounded-xl">
            <BarChart3 className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard de Productos</h1>
            <p className="text-sm text-slate-500">
              Estadísticas de ventas · {desde} a {hasta}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {eligeSede && (
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {SEDES.map((s) => (
                <button
                  key={s.valor}
                  onClick={() => setSede(s.valor)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    sede === s.valor
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => aplicarPreset(p.meses)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:text-slate-900 hover:shadow-sm transition-all"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center gap-2 shadow-sm">
            <Calendar size={16} className="text-slate-400 ml-1" />
            <input
              type="date"
              value={desde}
              max={hasta}
              onChange={(e) => setDesde(e.target.value)}
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent"
            />
            <span className="text-slate-300">→</span>
            <input
              type="date"
              value={hasta}
              min={desde}
              max={hoy()}
              onChange={(e) => setHasta(e.target.value)}
              className="text-sm border-none focus:ring-0 font-bold text-slate-700 bg-transparent"
            />
          </div>
        </div>
      </div>

      <BrandBubbles
        brands={data?.brands || []}
        categories={data?.categories || []}
        loading={loading}
      />

      <RotacionSkus sede={sedeParam} />
    </div>
  );
}
