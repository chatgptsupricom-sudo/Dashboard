"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { Check, ClipboardCheck, History, Loader2, Pencil, Save, Search, X } from "lucide-react";
import {
  POP_LOCATION_LABELS,
  type PopCategory,
  type PopLocation,
  type PopProduct,
} from "@/lib/adminleads/material-pop/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { InventariosGuardados } from "./InventariosGuardados";

/**
 * Inventario físico al estilo de Odoo: una fila por producto y ubicación con
 * lo que hay a mano y la cantidad contada. "Aplicar" marca la fila como
 * contada (verde) sin tocar el stock; cuando todo está contado, "Guardar
 * inventario" ajusta el stock de una vez (ajustes en el Historial) y deja el
 * conteo guardado para consultarlo o descargarlo.
 */

const UBICACIONES: PopLocation[] = ["office", "warehouse"];
const BORRADOR = "material-pop-inventario-borrador";
type Agrupar = "location" | "category" | "none";
type Estado = "" | "pendientes" | "contados";

interface Fila {
  key: string;
  product: PopProduct;
  location: PopLocation;
  onHand: number;
}

function stockEn(p: PopProduct, loc: PopLocation): number {
  return Number(loc === "office" ? p.stock_office : p.stock_warehouse) || 0;
}

function fmt(n: number): string {
  return n.toLocaleString("es-VE", { maximumFractionDigits: 2 });
}

function numero(v: string | undefined): number | null {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function InventoryTab({
  products,
  categories,
  onDone,
}: {
  products: PopProduct[];
  categories: PopCategory[];
  onDone: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [vista, setVista] = useState<"contar" | "guardados">("contar");
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<PopLocation | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [estado, setEstado] = useState<Estado>("");
  const [agrupar, setAgrupar] = useState<Agrupar>("location");
  const [contado, setContado] = useState<Record<string, string>>({});
  const [listos, setListos] = useState<Record<string, boolean>>({});
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [recargarGuardados, setRecargarGuardados] = useState(0);

  // Un conteo puede llevar horas: el borrador queda en este navegador para no
  // perderlo si se recarga la página.
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BORRADOR) || "null");
      if (b?.contado) setContado(b.contado);
      if (b?.listos) setListos(b.listos);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(BORRADOR, JSON.stringify({ contado, listos }));
    } catch {}
  }, [contado, listos]);

  const todas = useMemo<Fila[]>(
    () =>
      products.flatMap((p) =>
        UBICACIONES.map((loc) => ({ key: `${p.id}:${loc}`, product: p, location: loc, onHand: stockEn(p, loc) })),
      ),
    [products],
  );
  const totalListos = todas.filter((f) => listos[f.key]).length;
  const completo = todas.length > 0 && totalListos === todas.length;

  const filas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return todas.filter(
      (f) =>
        (!q || f.product.name.toLowerCase().includes(q) || f.product.code.toLowerCase().includes(q)) &&
        (!categoryFilter || String(f.product.category_id) === categoryFilter) &&
        (!locationFilter || f.location === locationFilter) &&
        (!estado || (estado === "contados") === !!listos[f.key]),
    );
  }, [todas, query, categoryFilter, locationFilter, estado, listos]);

  const grupos = useMemo(() => {
    if (agrupar === "none") return [{ titulo: "", filas }];
    const mapa = new Map<string, Fila[]>();
    for (const f of filas) {
      const titulo =
        agrupar === "location" ? POP_LOCATION_LABELS[f.location] : f.product.category_name || "Sin categoría";
      mapa.set(titulo, [...(mapa.get(titulo) || []), f]);
    }
    return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([titulo, filas]) => ({ titulo, filas }));
  }, [filas, agrupar]);

  function marcar(f: Fila) {
    const n = numero(contado[f.key]);
    if (n === null) {
      toast({ title: "Cantidad inválida", description: `${f.product.code} ${f.product.name}`, variant: "destructive" });
      return;
    }
    if (!Number(f.product.uom_allows_decimal) && !Number.isInteger(n)) {
      toast({ title: "Esta unidad solo permite enteros", description: f.product.name, variant: "destructive" });
      return;
    }
    setListos((prev) => ({ ...prev, [f.key]: true }));
  }

  function editar(key: string, valor: string) {
    setContado((prev) => ({ ...prev, [key]: valor }));
    // Cambiar lo contado lo vuelve a dejar pendiente hasta que se aplique.
    setListos((prev) => {
      if (!prev[key]) return prev;
      const sig = { ...prev };
      delete sig[key];
      return sig;
    });
  }

  function descartar() {
    if (!window.confirm("¿Descartar todo el conteo en curso?")) return;
    setContado({});
    setListos({});
    setNota("");
  }

  async function guardar() {
    if (!completo) return;
    setGuardando(true);
    try {
      const res = await fetch("/api/adminleads/material-pop/inventarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: nota.trim() || null,
          lineas: todas.map((f) => ({
            productId: f.product.id,
            location: f.location,
            counted: numero(contado[f.key]),
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar el inventario");
      toast({
        title: `Inventario #${json.id} guardado`,
        description: `${json.lineas} renglones, ${json.conDiferencia} con diferencia ajustados en el stock.`,
      });
      setContado({});
      setListos({});
      setNota("");
      setRecargarGuardados((n) => n + 1);
      await onDone();
      setVista("guardados");
    } catch (e: any) {
      toast({ title: "No se pudo guardar", description: e.message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  }

  const selectClass = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm";
  const pct = todas.length ? Math.round((totalListos / todas.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg bg-slate-100 p-1">
        {[
          { id: "contar" as const, label: "Conteo", icon: ClipboardCheck },
          { id: "guardados" as const, label: "Inventarios guardados", icon: History },
        ].map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVista(v.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium",
              vista === v.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
            )}
          >
            <v.icon className="h-4 w-4" /> {v.label}
          </button>
        ))}
      </div>

      {vista === "guardados" ? (
        <InventariosGuardados recargar={recargarGuardados} />
      ) : (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-700">
                  {totalListos} de {todas.length} contados
                  {!completo && todas.length > 0 && (
                    <span className="font-normal text-slate-500"> · faltan {todas.length - totalListos}</span>
                  )}
                </p>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={cn("h-full transition-all", completo ? "bg-emerald-500" : "bg-sky-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={guardando || Object.keys(contado).length === 0}
                  onClick={descartar}
                >
                  <X className="mr-1 h-4 w-4" /> Descartar conteo
                </Button>
              </div>
            </div>
            {completo && (
              <div className="mt-3 flex flex-col gap-2 rounded-lg bg-emerald-50 p-3 sm:flex-row sm:items-center">
                <p className="text-sm text-emerald-800 sm:flex-1">
                  Todo contado. Al guardar, el stock queda en lo contado y el inventario se guarda para consultarlo
                  después.
                </p>
                <Input
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="h-9 bg-white sm:w-56"
                />
                <Button size="sm" disabled={guardando} onClick={guardar}>
                  {guardando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                  Guardar inventario
                </Button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar producto o código"
                className="h-9 w-60 pl-8"
              />
            </div>
            <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)} className={selectClass}>
              <option value="">Todos</option>
              <option value="pendientes">Pendientes</option>
              <option value="contados">Contados</option>
            </select>
            <select value={locationFilter} onChange={(e) => setLocationFilter(e.target.value as any)} className={selectClass}>
              <option value="">Todas las ubicaciones</option>
              {UBICACIONES.map((loc) => (
                <option key={loc} value={loc}>{POP_LOCATION_LABELS[loc]}</option>
              ))}
            </select>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectClass}>
              <option value="">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
            <select value={agrupar} onChange={(e) => setAgrupar(e.target.value as Agrupar)} className={selectClass}>
              <option value="location">Agrupar por ubicación</option>
              <option value="category">Agrupar por categoría</option>
              <option value="none">Sin agrupar</option>
            </select>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2">Ubicación</th>
                  <th className="px-3 py-2">Categoría</th>
                  <th className="px-3 py-2 text-right">A mano</th>
                  <th className="px-3 py-2 text-right">Cantidad contada</th>
                  <th className="px-3 py-2 text-right">Diferencia</th>
                  <th className="px-3 py-2">Unidad</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      No hay productos con estos filtros
                    </td>
                  </tr>
                )}
                {grupos.map((g) => (
                  <Fragment key={g.titulo || "todo"}>
                    {g.titulo && (
                      <tr className="border-t border-slate-200 bg-slate-100/70">
                        <td colSpan={3} className="px-3 py-1.5 font-semibold text-slate-700">
                          {g.titulo}{" "}
                          <span className="font-normal text-slate-500">
                            ({g.filas.filter((f) => listos[f.key]).length}/{g.filas.length} contados)
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                          {fmt(g.filas.reduce((s, f) => s + f.onHand, 0))}
                        </td>
                        <td colSpan={4} />
                      </tr>
                    )}
                    {g.filas.map((f) => {
                      const valor = contado[f.key] ?? "";
                      const n = numero(valor);
                      const dif = n === null ? null : n - f.onHand;
                      const listo = !!listos[f.key];
                      return (
                        <tr
                          key={f.key}
                          className={cn(
                            "border-t border-slate-100",
                            listo ? "bg-emerald-50 hover:bg-emerald-100/70" : "hover:bg-slate-50",
                          )}
                        >
                          <td className="px-3 py-1.5">
                            {listo && <Check className="mr-1 inline h-4 w-4 text-emerald-600" aria-label="Contado" />}
                            <span className="font-mono text-xs text-slate-500">[{f.product.code}]</span>{" "}
                            <span className="text-slate-900">{f.product.name}</span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">{POP_LOCATION_LABELS[f.location]}</td>
                          <td className="px-3 py-1.5 text-slate-600">{f.product.category_name || "—"}</td>
                          <td className={cn("px-3 py-1.5 text-right tabular-nums", f.onHand < 0 && "text-red-600")}>
                            {fmt(f.onHand)}
                          </td>
                          <td className="px-3 py-1">
                            <Input
                              type="number"
                              min={0}
                              step={Number(f.product.uom_allows_decimal) ? "0.01" : "1"}
                              value={valor}
                              onChange={(e) => editar(f.key, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") marcar(f);
                              }}
                              aria-label={`Cantidad contada de ${f.product.name} en ${POP_LOCATION_LABELS[f.location]}`}
                              className={cn("ml-auto h-8 w-24 text-right", listo && "border-emerald-300 bg-white")}
                            />
                          </td>
                          <td
                            className={cn(
                              "px-3 py-1.5 text-right tabular-nums",
                              dif !== null && dif > 0 && "text-emerald-600",
                              dif !== null && dif < 0 && "text-red-600",
                            )}
                          >
                            {dif === null ? "" : `${dif > 0 ? "+" : ""}${fmt(dif)}`}
                          </td>
                          <td className="px-3 py-1.5 text-slate-500">{f.product.uom_name || "—"}</td>
                          <td className="px-3 py-1 text-right">
                            {listo ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-slate-500"
                                disabled={guardando}
                                onClick={() => editar(f.key, valor)}
                              >
                                <Pencil className="h-4 w-4" /> Corregir
                              </Button>
                            ) : (
                              valor.trim() !== "" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-emerald-700"
                                  disabled={guardando}
                                  onClick={() => marcar(f)}
                                >
                                  <Check className="h-4 w-4" /> Aplicar
                                </Button>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">
            Escribe lo contado y pulsa Aplicar (o Enter): la fila queda en verde. El stock no cambia hasta guardar el
            inventario completo. El conteo en curso queda guardado en este navegador.
          </p>
        </>
      )}
    </div>
  );
}
