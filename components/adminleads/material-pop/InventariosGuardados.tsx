"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2 } from "lucide-react";
import { POP_LOCATION_LABELS, type PopLocation } from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Inventario {
  id: number;
  inventory_date: string;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
  lineas: number;
  con_diferencia: number;
}

interface Linea {
  product_code: string;
  product_name: string;
  category_name: string | null;
  uom_name: string | null;
  location: PopLocation;
  on_hand: number;
  counted: number;
  difference: number;
}

const API = "/api/adminleads/material-pop/inventarios";

function fmt(n: number): string {
  return n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
}

function fecha(s: string): string {
  return new Date(s).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" });
}

async function leerLineas(id: number): Promise<Linea[]> {
  const res = await fetch(`${API}?id=${id}`);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error || "No se pudo leer el inventario");
  return json.lineas || [];
}

function descargarCsv(inv: Inventario, lineas: Linea[]) {
  const header = ["Código", "Producto", "Categoría", "Ubicación", "A mano", "Contado", "Diferencia", "Unidad"];
  const filas = lineas.map((l) =>
    [
      l.product_code,
      l.product_name,
      l.category_name || "",
      POP_LOCATION_LABELS[l.location] || l.location,
      l.on_hand,
      l.counted,
      l.difference,
      l.uom_name || "",
    ]
      .map((c) => `"${String(c).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...filas].join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `material_pop_inventario_${inv.id}_${String(inv.inventory_date).slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function InventariosGuardados({ recargar }: { recargar: number }) {
  const [inventarios, setInventarios] = useState<Inventario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<number | null>(null);
  const [lineas, setLineas] = useState<Record<number, Linea[]>>({});
  const [soloDif, setSoloDif] = useState(false);
  const [ocupado, setOcupado] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(API);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudieron cargar los inventarios");
      setInventarios(json.inventarios || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, recargar]);

  async function conLineas(inv: Inventario): Promise<Linea[] | null> {
    if (lineas[inv.id]) return lineas[inv.id];
    setOcupado(inv.id);
    try {
      const l = await leerLineas(inv.id);
      setLineas((prev) => ({ ...prev, [inv.id]: l }));
      return l;
    } catch (e: any) {
      setError(e.message);
      return null;
    } finally {
      setOcupado(null);
    }
  }

  async function ver(inv: Inventario) {
    if (abierto === inv.id) return setAbierto(null);
    if (await conLineas(inv)) setAbierto(inv.id);
  }

  async function descargar(inv: Inventario) {
    const l = await conLineas(inv);
    if (l) descargarCsv(inv, l);
  }

  if (cargando) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando inventarios…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {inventarios.length === 0 && !error && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center text-sm text-slate-500">
          Todavía no hay inventarios guardados
        </div>
      )}
      {inventarios.map((inv) => {
        const l = lineas[inv.id] || [];
        const visibles = soloDif ? l.filter((x) => x.difference !== 0) : l;
        return (
          <div key={inv.id} className="rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => ver(inv)}
                className="flex flex-1 items-center gap-2 text-left"
                aria-expanded={abierto === inv.id}
              >
                {abierto === inv.id ? (
                  <ChevronDown className="h-4 w-4 text-slate-400" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Inventario #{inv.id} · {fecha(inv.created_at)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {inv.created_by_name || "—"} · {inv.lineas} renglones ·{" "}
                    <span className={inv.con_diferencia ? "text-amber-700" : "text-emerald-700"}>
                      {inv.con_diferencia} con diferencia
                    </span>
                    {inv.notes ? ` · ${inv.notes}` : ""}
                  </p>
                </div>
              </button>
              <Button variant="outline" size="sm" disabled={ocupado === inv.id} onClick={() => descargar(inv)}>
                {ocupado === inv.id ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-1 h-4 w-4" />
                )}
                Descargar CSV
              </Button>
            </div>

            {abierto === inv.id && (
              <div className="border-t border-slate-100 p-3">
                <label className="mb-2 flex items-center gap-1.5 text-sm text-slate-600">
                  <input type="checkbox" checked={soloDif} onChange={(e) => setSoloDif(e.target.checked)} />
                  Solo con diferencia
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Producto</th>
                        <th className="px-3 py-2">Ubicación</th>
                        <th className="px-3 py-2 text-right">A mano</th>
                        <th className="px-3 py-2 text-right">Contado</th>
                        <th className="px-3 py-2 text-right">Diferencia</th>
                        <th className="px-3 py-2">Unidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibles.map((x, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">
                            <span className="font-mono text-xs text-slate-500">[{x.product_code}]</span>{" "}
                            {x.product_name}
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">{POP_LOCATION_LABELS[x.location] || x.location}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(x.on_hand)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmt(x.counted)}</td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums",
                              x.difference > 0 && "text-emerald-600",
                              x.difference < 0 && "text-red-600",
                            )}
                          >
                            {x.difference > 0 ? "+" : ""}
                            {fmt(x.difference)}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{x.uom_name || "—"}</td>
                        </tr>
                      ))}
                      {visibles.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                            Sin diferencias
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
