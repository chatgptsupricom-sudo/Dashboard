"use client";

import { useEffect, useState } from "react";
import { TrendingUp, Package, BarChart2, Loader2 } from "lucide-react";

interface Brand {
  name: string;
  revenue: number;
  cantidad: number;
}

interface Product {
  name: string;
  revenue: number;
  cantidad: number;
  brand: string;
}

interface SalesData {
  brands: Brand[];
  products: Product[];
  month: string;
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function monthLabel(ym: string) {
  if (!ym) return "";
  const [year, month] = ym.split("-");
  const months = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return `${months[parseInt(month) - 1]} ${year}`;
}

function BarRow({
  label,
  value,
  max,
  rank,
  sub,
  color,
}: {
  label: string;
  value: number;
  max: number;
  rank?: number;
  sub?: string;
  color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2.5">
      {rank !== undefined && (
        <span className="w-5 text-xs font-bold text-slate-400 text-center flex-shrink-0">
          {rank}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm font-medium text-slate-700 truncate max-w-[60%]"
            title={label}
          >
            {label}
          </span>
          <span className="text-sm font-semibold text-slate-800 ml-2 flex-shrink-0">
            Bs {fmt(value)}
          </span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${color}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub} uds</p>}
      </div>
    </div>
  );
}

export default function SalesOverviewDashboard() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sales-overview")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Cargando datos...
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64 text-red-400 text-sm">
        Error al cargar datos de ventas
      </div>
    );
  }

  const maxBrand = data.brands[0]?.revenue || 1;
  const maxProduct = data.products[0]?.revenue || 1;

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Resumen del mes — {monthLabel(data.month)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Mes en curso
        </span>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Marcas más vendidas */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 bg-blue-50 rounded-lg">
              <BarChart2 className="w-4 h-4 text-blue-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Marcas más vendidas
            </h2>
          </div>

          {data.brands.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sin datos este mes</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.brands.map((brand, i) => (
                <BarRow
                  key={brand.name}
                  label={brand.name}
                  value={brand.revenue}
                  max={maxBrand}
                  rank={i + 1}
                  sub={brand.cantidad > 0 ? String(Math.round(brand.cantidad)) : undefined}
                  color="bg-blue-500"
                />
              ))}
            </div>
          )}
        </div>

        {/* Productos más vendidos */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="p-2 bg-violet-50 rounded-lg">
              <Package className="w-4 h-4 text-violet-600" />
            </div>
            <h2 className="text-base font-semibold text-slate-800">
              Productos más vendidos
            </h2>
          </div>

          {data.products.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Sin datos este mes</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.products.map((product, i) => (
                <BarRow
                  key={product.name + i}
                  label={product.name}
                  value={product.revenue}
                  max={maxProduct}
                  rank={i + 1}
                  color="bg-violet-500"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Trend footer */}
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <TrendingUp className="w-3.5 h-3.5" />
        Datos en tiempo real desde Odoo · Facturación del mes en curso
      </div>
    </div>
  );
}
