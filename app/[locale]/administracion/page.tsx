"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock, DollarSign, TrendingDown, TrendingUp, Wallet } from "lucide-react";

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  verde: { color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Óptimo" },
  amarillo: { color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Atención" },
  rojo: { color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Crítico" },
  info: { color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Informativo" },
  pendiente: { color: "text-slate-400", bg: "bg-slate-50 border-slate-200", label: "Pendiente" },
};

const CATEGORY_ICONS: Record<string, any> = {
  "Cuentas por Cobrar": DollarSign,
  "Cuentas por Pagar": Wallet,
  "Tesorería y Liquidez": Activity,
};

function formatValue(value: number | null, unit: string): string {
  if (value === null || value === undefined) return "—";
  if (unit === "$") return `$${value.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (unit === "%") return `${value}%`;
  if (unit === "días") return `${value}d`;
  return `${value} ${unit}`;
}

export default function AdministracionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [empresa, setEmpresa] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (empresa) params.set("empresa", empresa);
    fetch(`/api/administracion/salud-financiera?${params}`)
      .then((r) => r.json())
      .then((json) => { setData(json.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [empresa]);

  if (loading) return <div className="p-10 text-center font-bold text-slate-400 uppercase animate-pulse">Cargando Índice de Salud...</div>;
  if (!data) return <div className="p-10 text-center text-red-500">Error al cargar datos</div>;

  const { indice, categorias, meta } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Índice de Salud Administrativa</h1>
          <p className="text-sm text-slate-500">{meta.evaluados} de 100 pts evaluados{meta.pendientes > 0 ? ` — ${meta.pendientes} pts pendientes (Tesorería)` : ""}</p>
        </div>
        <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-medium">
          <option value="">Todas las sedes</option>
          <option value="valencia">Valencia</option>
          <option value="caracas">Caracas</option>
          <option value="panama">Panamá</option>
        </select>
      </div>

      {/* Índice General */}
      <Card className={`border-2 ${STATUS_CONFIG[indice.clasificacionColor]?.bg || "bg-slate-50 border-slate-200"}`}>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Índice General de Salud</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-black text-slate-900">{indice.value}</span>
                <span className="text-lg text-slate-400">/ 100</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{indice.puntos} puntos de {meta.evaluados} disponibles</p>
            </div>
            <Badge className={`text-sm px-3 py-1 ${STATUS_CONFIG[indice.clasificacionColor]?.color || ""} ${STATUS_CONFIG[indice.clasificacionColor]?.bg || ""} border`}>
              {indice.clasificacion}
            </Badge>
          </div>
          <div className="mt-4 w-full h-3 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-700 ${indice.clasificacionColor === "verde" ? "bg-emerald-500" : indice.clasificacionColor === "amarillo" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${indice.value}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Categorías */}
      {categorias.map((cat: any) => {
        const Icon = CATEGORY_ICONS[cat.name] || Activity;
        const score = (() => {
          let scored = 0, total = 0;
          cat.kpis.forEach((k: any) => { if (k.status !== "pendiente") { total++; if (k.status === "verde") scored++; else if (k.status === "amarillo") scored += 0.5; } });
          return total > 0 ? Math.round((scored / total) * 100) : 0;
        })();

        return (
          <Card key={cat.name}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 rounded-lg"><Icon size={20} className="text-slate-600" /></div>
                  <div>
                    <CardTitle className="text-base">{cat.name}</CardTitle>
                    <p className="text-xs text-slate-400">{cat.weight} pts disponibles</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-900">{score}%</span>
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full mt-1">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${score}%` }} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {cat.kpis.map((kpi: any) => {
                  const cfg = STATUS_CONFIG[kpi.status] || STATUS_CONFIG.pendiente;
                  return (
                    <div key={kpi.id} className={`border rounded-xl p-3 ${cfg.bg}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase truncate">{kpi.name}</span>
                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${cfg.color} border-current`}>{cfg.label}</Badge>
                      </div>
                      <p className={`text-lg font-black ${cfg.color}`}>{formatValue(kpi.value, kpi.unit)}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-slate-400">Meta: {formatValue(kpi.target, kpi.unit)}</span>
                        {kpi.detail !== undefined && <span className="text-[10px] text-slate-400">({formatValue(kpi.detail, "$")})</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
