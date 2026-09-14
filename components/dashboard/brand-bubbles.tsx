"use client";

/**
 * "Marcas más vendidas" y "Categorías más vendidas" del dashboard de
 * AdminLeads (y del de Diseñador, que reusa este mismo componente).
 *
 * Antes era un bubble-chart animado (framer-motion, paleta arcoíris) que no
 * calzaba con el resto del panel — acá todo usa tarjeta blanca + encabezado
 * gris mayúscula + barras horizontales de recharts (mismo patrón que
 * `components/reportes-comerciales/ReporteTrimestral.tsx` / Reporte Diario).
 * De paso, el detalle de productos por marca mostraba el SKU (`product.code`)
 * en vez del nombre — ahora muestra el nombre.
 */

import { useState } from "react";
import { BarChart3, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface BrandProduct {
  code: string;
  name: string;
  qty: number;
}

interface BrandData {
  name: string;
  qty: number;
  products: BrandProduct[];
}

interface CategoryData {
  name: string;
  qty: number;
}

interface ProductStatsProps {
  brands: BrandData[];
  categories: CategoryData[];
  loading?: boolean;
}

// Mismo set acotado de colores que el resto de los gráficos del panel
// (ver `barColor` en ReporteTrimestral.tsx) en vez de una paleta de 15 tonos.
const BAR_COLORS = [
  "#2563eb",
  "#0891b2",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#16a34a",
  "#ca8a04",
  "#4f46e5",
];

function num(n: number): string {
  return (n || 0).toLocaleString("es-VE");
}

function CardSkeleton({ title }: { title: string }) {
  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader className="pb-2">
        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-slate-100 rounded-lg" style={{ width: `${90 - i * 10}%` }} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function BrandBubbles({ brands, categories, loading }: ProductStatsProps) {
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton title="Marcas más vendidas" />
        <CardSkeleton title="Categorías más vendidas" />
      </div>
    );
  }

  const datosBarra = brands.slice(0, 12).map((b) => ({ name: b.name, qty: b.qty }));
  const maxCatQty = categories.length > 0 ? categories[0].qty : 1;
  const brandSeleccionada = brands.find((b) => b.name === marcaAbierta) || null;

  return (
    <div className="space-y-6">
      {/* ── Marcas más vendidas ── */}
      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <BarChart3 size={14} /> Marcas más vendidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {datosBarra.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin datos en el período</p>
          ) : (
            <>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={datosBarra}
                    layout="vertical"
                    margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      width={110}
                      tick={{ fontSize: 11, fill: "#334155", fontWeight: 700 }}
                    />
                    <Tooltip
                      formatter={(v: number) => [`${num(v)} uds`, "Unidades"]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        fontSize: 12,
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                      cursor={{ fill: "#f8fafc" }}
                    />
                    <Bar
                      dataKey="qty"
                      radius={[0, 6, 6, 0]}
                      barSize={16}
                      cursor="pointer"
                      onClick={(d: any) =>
                        setMarcaAbierta((actual) => (actual === d.name ? null : d.name))
                      }
                    >
                      {datosBarra.map((d, i) => (
                        <Cell
                          key={i}
                          fill={BAR_COLORS[i % BAR_COLORS.length]}
                          opacity={marcaAbierta && marcaAbierta !== d.name ? 0.45 : 1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {brandSeleccionada && brandSeleccionada.products.length > 0 && (
                <div className="mt-2 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Top productos — {brandSeleccionada.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {brandSeleccionada.products.slice(0, 10).map((p) => (
                      <div
                        key={p.code || p.name}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
                        title={p.code || undefined}
                      >
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[240px]">
                          {p.name || p.code || "—"}
                        </span>
                        <span className="text-xs font-black text-blue-600 shrink-0">
                          {num(p.qty)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Categorías más vendidas ── */}
      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-2">
          <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Boxes size={14} /> Categorías más vendidas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin datos en el período</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {categories.map((cat) => {
                const pct = Math.round((cat.qty / maxCatQty) * 100);
                return (
                  <div
                    key={cat.name}
                    className="rounded-xl border border-slate-100 bg-slate-50/60 p-3"
                  >
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">
                      {cat.name}
                    </p>
                    <p className="text-xl font-black text-slate-900 mt-1">{num(cat.qty)}</p>
                    <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
