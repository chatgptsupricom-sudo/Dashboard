"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ClipboardCheck, Loader2, Search, X } from "lucide-react";
import {
  POP_LOCATION_LABELS,
  type PopCategory,
  type PopLocation,
  type PopProduct,
} from "@/lib/adminleads/material-pop/types";
import { getTodayCaracas } from "@/lib/adminleads/material-pop/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

/**
 * Inventario físico al estilo de Odoo: una fila por producto y ubicación con
 * lo que hay a mano, la cantidad contada y la diferencia. "Aplicar" registra
 * el conteo como ajuste (`type: "adjustment"` en movements), así queda en el
 * Historial igual que un ajuste hecho desde Entradas.
 */

const UBICACIONES: PopLocation[] = ["office", "warehouse"];
type Agrupar = "location" | "category" | "none";

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
  const [query, setQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState<PopLocation | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [soloContados, setSoloContados] = useState(false);
  const [agrupar, setAgrupar] = useState<Agrupar>("location");
  const [contado, setContado] = useState<Record<string, string>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);

  const filas = useMemo<Fila[]>(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q))
      .filter((p) => !categoryFilter || String(p.category_id) === categoryFilter)
      .flatMap((p) =>
        UBICACIONES.filter((loc) => !locationFilter || loc === locationFilter).map((loc) => ({
          key: `${p.id}:${loc}`,
          product: p,
          location: loc,
          onHand: stockEn(p, loc),
        })),
      )
      .filter((f) => !soloContados || (contado[f.key] ?? "") !== "");
  }, [products, query, categoryFilter, locationFilter, soloContados, contado]);

  const grupos = useMemo(() => {
    if (agrupar === "none") return [{ titulo: "", filas }];
    const mapa = new Map<string, Fila[]>();
    for (const f of filas) {
      const titulo =
        agrupar === "location"
          ? POP_LOCATION_LABELS[f.location]
          : f.product.category_name || "Sin categoría";
      mapa.set(titulo, [...(mapa.get(titulo) || []), f]);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([titulo, filas]) => ({ titulo, filas }));
  }, [filas, agrupar]);

  function diferencia(f: Fila): number | null {
    const v = contado[f.key];
    if (v === undefined || v.trim() === "") return null;
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n - f.onHand : null;
  }

  // Todo lo contado, aunque el filtro lo esconda: "Aplicar todo" no debe
  // depender de lo que se ve en pantalla.
  const pendientes = useMemo(() => {
    const porKey = new Map<string, PopProduct>(products.map((p) => [String(p.id), p]));
    return Object.entries(contado)
      .filter(([, v]) => v.trim() !== "")
      .map(([key, v]) => {
        const [id, loc] = key.split(":") as [string, PopLocation];
        return { key, product: porKey.get(id), location: loc, valor: v };
      })
      .filter((x): x is { key: string; product: PopProduct; location: PopLocation; valor: string } => !!x.product);
  }, [contado, products]);

  async function aplicar(lista: { key: string; product: PopProduct; location: PopLocation; valor: string }[], id: string) {
    for (const x of lista) {
      const n = Number(x.valor.replace(",", "."));
      if (!Number.isFinite(n) || n < 0) {
        toast({ title: "Cantidad inválida", description: `${x.product.code} ${x.product.name}`, variant: "destructive" });
        return;
      }
    }

    setAplicando(id);
    const aplicadas: string[] = [];
    try {
      // El API recibe una ubicación por movimiento: un ajuste por ubicación.
      for (const loc of UBICACIONES) {
        const deEsta = lista.filter((x) => x.location === loc);
        if (deEsta.length === 0) continue;
        const res = await fetch("/api/adminleads/material-pop/movements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "adjustment",
            location: loc,
            reasonType: "inventario_físico",
            movementDate: getTodayCaracas(),
            items: deEsta.map((x) => ({
              productId: x.product.id,
              newQuantity: Number(x.valor.replace(",", ".")),
            })),
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`${POP_LOCATION_LABELS[loc]}: ${json?.error || "no se pudo aplicar"}`);
        aplicadas.push(...deEsta.map((x) => x.key));
      }
      toast({ title: "Inventario aplicado", description: `${lista.length} conteo(s) registrados como ajuste.` });
    } catch (e: any) {
      toast({ title: "No se pudo aplicar", description: e.message, variant: "destructive" });
    } finally {
      // Lo que sí se aplicó sale de la lista aunque otra ubicación haya fallado.
      if (aplicadas.length) {
        setContado((prev) => {
          const sig = { ...prev };
          for (const k of aplicadas) delete sig[k];
          return sig;
        });
        await onDone();
      }
      setAplicando(null);
    }
  }

  const selectClass = "h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
          <label className="flex items-center gap-1.5 text-sm text-slate-600">
            <input type="checkbox" checked={soloContados} onChange={(e) => setSoloContados(e.target.checked)} />
            Solo contados
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={pendientes.length === 0 || aplicando !== null}
            onClick={() => setContado({})}
          >
            <X className="mr-1 h-4 w-4" /> Limpiar conteo
          </Button>
          <Button
            size="sm"
            disabled={pendientes.length === 0 || aplicando !== null}
            onClick={() => aplicar(pendientes, "todo")}
          >
            {aplicando === "todo" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <ClipboardCheck className="mr-1 h-4 w-4" />
            )}
            Aplicar todo ({pendientes.length})
          </Button>
        </div>
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
                      {g.titulo} <span className="font-normal text-slate-500">({g.filas.length})</span>
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-slate-700">
                      {fmt(g.filas.reduce((s, f) => s + f.onHand, 0))}
                    </td>
                    <td colSpan={4} />
                  </tr>
                )}
                {g.filas.map((f) => {
                  const dif = diferencia(f);
                  const valor = contado[f.key] ?? "";
                  return (
                    <tr key={f.key} className="border-t border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-1.5">
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
                          onChange={(e) => setContado((prev) => ({ ...prev, [f.key]: e.target.value }))}
                          aria-label={`Cantidad contada de ${f.product.name} en ${POP_LOCATION_LABELS[f.location]}`}
                          className="ml-auto h-8 w-24 text-right"
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
                        {valor.trim() !== "" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-emerald-700"
                              disabled={aplicando !== null}
                              onClick={() =>
                                aplicar([{ key: f.key, product: f.product, location: f.location, valor }], f.key)
                              }
                            >
                              {aplicando === f.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                              Aplicar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-slate-500"
                              disabled={aplicando !== null}
                              aria-label="Descartar conteo"
                              onClick={() =>
                                setContado((prev) => {
                                  const sig = { ...prev };
                                  delete sig[f.key];
                                  return sig;
                                })
                              }
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
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
        Escribe lo que contaste y pulsa Aplicar: el stock queda en esa cantidad y el cambio se guarda como ajuste
        «inventario físico» en el Historial.
      </p>
    </div>
  );
}
