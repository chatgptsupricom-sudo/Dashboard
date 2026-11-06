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
 *
 * Unidades o Monto (USD sin IVA, las notas de crédito restan): lo elige el
 * selector y vale para la gráfica, el detalle de la marca y las tarjetas de
 * categoría. Al pulsar una categoría se abren sus productos y marcas.
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

interface Medidas {
  qty: number;
  monto: number;
}

interface BrandProduct extends Medidas {
  code: string;
  name: string;
}

interface BrandData extends Medidas {
  name: string;
  products: BrandProduct[];
}

interface CategoryData extends Medidas {
  name: string;
  products?: BrandProduct[];
  brands?: (Medidas & { name: string })[];
}

interface ProductStatsProps {
  brands: BrandData[];
  categories: CategoryData[];
  loading?: boolean;
}

type Medida = keyof Medidas;

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

function valor(n: number, medida: Medida): string {
  return medida === "monto"
    ? `$${(n || 0).toLocaleString("es-VE", { maximumFractionDigits: 0 })}`
    : num(n);
}

/** Lo que tiene algo en la medida elegida, de mayor a menor. */
function ordenar<T extends Medidas>(lista: T[], medida: Medida): T[] {
  return lista.filter((x) => (x[medida] || 0) > 0).sort((a, b) => (b[medida] || 0) - (a[medida] || 0));
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

function SelectorMedida({ medida, onChange }: { medida: Medida; onChange: (m: Medida) => void }) {
  return (
    <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
      {(
        [
          ["qty", "Unidades"],
          ["monto", "Monto"],
        ] as const
      ).map(([m, label]) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          aria-pressed={medida === m}
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
            medida === m ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Chips({ items, medida }: { items: (Medidas & { name: string; code?: string })[]; medida: Medida }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((p) => (
        <div
          key={p.code || p.name}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-100"
          title={p.code || undefined}
        >
          <span className="text-xs font-semibold text-slate-700 truncate max-w-[240px]">
            {p.name || p.code || "—"}
          </span>
          <span className="text-xs font-black text-blue-600 shrink-0">{valor(p[medida], medida)}</span>
        </div>
      ))}
    </div>
  );
}

export function BrandBubbles({ brands, categories, loading }: ProductStatsProps) {
  const [marcaAbierta, setMarcaAbierta] = useState<string | null>(null);
  const [categoriaAbierta, setCategoriaAbierta] = useState<string | null>(null);
  const [medida, setMedida] = useState<Medida>("qty");

  if (loading) {
    return (
      <div className="space-y-6">
        <CardSkeleton title="Marcas más vendidas" />
        <CardSkeleton title="Categorías más vendidas" />
      </div>
    );
  }

  const etiqueta = medida === "monto" ? "Monto" : "Unidades";
  const marcas = ordenar(brands, medida);
  const datosBarra = marcas.slice(0, 12).map((b) => ({ name: b.name, valor: b[medida] }));
  const cats = ordenar(categories, medida).slice(0, 15);
  const maxCat = cats.length > 0 ? cats[0][medida] : 1;
  const brandSeleccionada = marcas.find((b) => b.name === marcaAbierta) || null;
  const categoriaSeleccionada = cats.find((c) => c.name === categoriaAbierta) || null;

  return (
    <div className="space-y-6">
      {/* ── Marcas más vendidas ── */}
      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <BarChart3 size={14} /> Marcas más vendidas
          </CardTitle>
          <SelectorMedida medida={medida} onChange={setMedida} />
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
                      tickFormatter={(v) =>
                        `${medida === "monto" ? "$" : ""}${v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v}`
                      }
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
                      formatter={(v: number) => [
                        medida === "monto" ? valor(v, medida) : `${num(v)} uds`,
                        etiqueta,
                      ]}
                      contentStyle={{
                        borderRadius: 12,
                        border: "none",
                        fontSize: 12,
                        boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)",
                      }}
                      cursor={{ fill: "#f8fafc" }}
                    />
                    <Bar
                      dataKey="valor"
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
                  <Chips items={ordenar(brandSeleccionada.products, medida).slice(0, 10)} medida={medida} />
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Categorías más vendidas ── */}
      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Boxes size={14} /> Categorías más vendidas
          </CardTitle>
          <SelectorMedida medida={medida} onChange={setMedida} />
        </CardHeader>
        <CardContent>
          {cats.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">Sin datos en el período</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {cats.map((cat) => {
                  const pct = Math.round((cat[medida] / maxCat) * 100);
                  const abierta = categoriaAbierta === cat.name;
                  return (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => setCategoriaAbierta(abierta ? null : cat.name)}
                      aria-expanded={abierta}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        abierta
                          ? "border-blue-300 bg-blue-50"
                          : "border-slate-100 bg-slate-50/60 hover:border-slate-300"
                      }`}
                    >
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide truncate">
                        {cat.name}
                      </p>
                      <p className="text-xl font-black text-slate-900 mt-1">{valor(cat[medida], medida)}</p>
                      <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {categoriaSeleccionada && (
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      Top productos — {categoriaSeleccionada.name}
                    </p>
                    <Chips items={ordenar(categoriaSeleccionada.products ?? [], medida).slice(0, 10)} medida={medida} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                      Marcas en {categoriaSeleccionada.name}
                    </p>
                    <div className="space-y-1.5">
                      {ordenar(categoriaSeleccionada.brands ?? [], medida).map((b) => {
                        const pct = Math.round((b[medida] / (categoriaSeleccionada[medida] || 1)) * 100);
                        return (
                          <div key={b.name} className="flex items-center gap-3 text-xs">
                            <span className="w-32 shrink-0 truncate font-bold text-slate-700">{b.name}</span>
                            <div className="h-1.5 flex-1 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className="w-24 shrink-0 text-right font-black text-slate-900 tabular-nums">
                              {valor(b[medida], medida)}
                            </span>
                            <span className="w-10 shrink-0 text-right text-slate-400 tabular-nums">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
