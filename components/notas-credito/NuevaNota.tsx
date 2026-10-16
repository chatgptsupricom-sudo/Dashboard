"use client";

import { FacturaBuscador, type FacturaElegida } from "@/components/notas-credito/FacturaBuscador";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatoMonto, NOMBRE_SEDE, SIN_MARCA, type ProductoFactura } from "@/lib/notas-credito/tipos";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

/** Lo elegido de cada línea de la factura: cantidad (sin serial) o seriales. */
type Eleccion = { cantidad: string; seriales: string[]; manual: string };

const sinAcentos = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Seriales escritos a mano: uno por línea o separados por coma. */
const serialesManuales = (t: string) => [
  ...new Set(
    t
      .split(/[\n,;]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

/**
 * Nota de crédito que no viene de RMA. La crea quien preaprueba (o el
 * SuperAdmin): elige la factura, los productos (agrupados por marca, con su
 * serial de Odoo) y el motivo. Nace preaprobada y le llega a quien aprueba.
 */
export function NuevaNota({ sedes, onCerrar, onCreada }: { sedes: number[]; onCerrar: () => void; onCreada: (id: number) => void }) {
  const [sede, setSede] = useState(sedes[0]);
  const [factura, setFactura] = useState<FacturaElegida | null>(null);
  const [productos, setProductos] = useState<ProductoFactura[]>([]);
  const [cargandoProductos, setCargandoProductos] = useState(false);
  const [errorProductos, setErrorProductos] = useState("");
  const [elegidos, setElegidos] = useState<Record<number, Eleccion>>({});
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({});
  const [filtro, setFiltro] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setProductos([]);
    setElegidos({});
    setAbiertas({});
    setFiltro("");
    setErrorProductos("");
    if (!factura) return;
    const ctrl = new AbortController();
    setCargandoProductos(true);
    fetch(`/api/notas-credito/facturas?company_id=${sede}&factura_id=${factura.id}`, { signal: ctrl.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j?.error || "No se pudieron leer los productos de la factura");
        const lista: ProductoFactura[] = j.productos || [];
        setProductos(lista);
        // Con una sola marca no hace falta abrirla.
        const marcas = new Set(lista.map((p) => p.marca));
        if (marcas.size === 1) setAbiertas({ [[...marcas][0]]: true });
      })
      .catch((e) => {
        if (e?.name !== "AbortError") setErrorProductos(e?.message || "No se pudieron leer los productos de la factura");
      })
      .finally(() => setCargandoProductos(false));
    return () => ctrl.abort();
  }, [factura, sede]);

  /** Seriales que cuentan para una línea: los marcados de Odoo, o los escritos a mano. */
  const serialesDe = (p: ProductoFactura, e: Eleccion) => (p.seriales.length ? e.seriales : serialesManuales(e.manual));
  const cantidadDe = (p: ProductoFactura, e: Eleccion) => (p.con_serial ? serialesDe(p, e).length : Number(e.cantidad) || 0);

  const grupos = useMemo(() => {
    const q = sinAcentos(filtro.trim());
    const m = new Map<string, ProductoFactura[]>();
    for (const p of productos) {
      if (q && !sinAcentos(`${p.producto} ${p.codigo} ${p.marca} ${p.seriales.map((s) => s.serial).join(" ")}`).includes(q)) continue;
      m.set(p.marca, [...(m.get(p.marca) ?? []), p]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === SIN_MARCA ? 1 : b === SIN_MARCA ? -1 : a.localeCompare(b, "es")));
  }, [productos, filtro]);

  const lineas = productos
    .filter((p) => elegidos[p.linea_id])
    .map((p) => {
      const e = elegidos[p.linea_id];
      const cantidad = cantidadDe(p, e);
      return { p, e, cantidad, total: r2(p.precio_unidad * cantidad) };
    });
  const total = r2(lineas.reduce((s, l) => s + l.total, 0));
  const problema = lineas
    .map(({ p, cantidad }) =>
      cantidad <= 0
        ? p.con_serial
          ? `Falta el serial de ${p.producto}.`
          : `Falta la cantidad de ${p.producto}.`
        : cantidad > p.disponible + 0.0001
          ? `De ${p.producto} queda por acreditar ${p.disponible}.`
          : "",
    )
    .find(Boolean);

  const alternar = (p: ProductoFactura) =>
    setElegidos((x) => {
      if (x[p.linea_id]) {
        const { [p.linea_id]: _fuera, ...resto } = x;
        return resto;
      }
      const libres = p.seriales.filter((s) => !s.nc);
      // Si queda un solo serial libre, ya va marcado.
      const seriales = p.con_serial && libres.length === 1 && p.disponible >= 1 ? [libres[0].serial] : [];
      return { ...x, [p.linea_id]: { cantidad: p.con_serial ? "" : String(Math.min(1, p.disponible) || ""), seriales, manual: "" } };
    });

  const cambiar = (id: number, c: Partial<Eleccion>) => setElegidos((x) => ({ ...x, [id]: { ...x[id], ...c } }));

  const enviar = async () => {
    setEnviando(true);
    setError("");
    try {
      const r = await fetch("/api/notas-credito", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: sede,
          factura_id: factura?.id,
          motivo,
          lineas: lineas.map(({ p, e, cantidad }) => ({ linea_id: p.linea_id, cantidad, seriales: serialesDe(p, e) })),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      onCreada(j.id);
    } catch (e: any) {
      setError(e?.message || "No se pudo crear");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva nota de crédito</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-slate-500">Para lo que no es un equipo de RMA. Sale preaprobada por ti y le llega a quien aprueba.</p>
          {sedes.length > 1 && (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-600">Sede</span>
              <select
                className="w-full rounded-md border px-3 py-2"
                value={sede}
                onChange={(e) => {
                  setSede(Number(e.target.value));
                  setFactura(null);
                }}
              >
                {sedes.map((s) => (
                  <option key={s} value={s}>
                    {NOMBRE_SEDE[s] || s}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="space-y-1">
            <span className="text-xs font-medium text-slate-600">1. Factura</span>
            <FacturaBuscador companyId={sede} elegida={factura} onElegir={setFactura} />
          </div>

          {factura && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-600">2. Productos que van en la nota</span>
                {productos.length > 6 && (
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      placeholder="Buscar producto, código o serial"
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                )}
              </div>
              {cargandoProductos ? (
                <div className="flex items-center gap-2 py-4 text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Leyendo los productos y seriales de la factura en Odoo…
                </div>
              ) : errorProductos ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{errorProductos}</p>
              ) : !productos.length ? (
                <p className="text-slate-400">La factura no tiene productos.</p>
              ) : (
                <div className="divide-y rounded-xl border">
                  {grupos.map(([marca, lista]) => {
                    const abierta = abiertas[marca] || !!filtro.trim();
                    const marcados = lista.filter((p) => elegidos[p.linea_id]).length;
                    return (
                      <div key={marca}>
                        <button
                          type="button"
                          onClick={() => setAbiertas((x) => ({ ...x, [marca]: !x[marca] }))}
                          className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2 text-left hover:bg-slate-100"
                        >
                          <span className="flex items-center gap-1.5 font-semibold text-slate-800">
                            {abierta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            {marca}
                          </span>
                          <span className="text-xs text-slate-500">
                            {lista.length} producto{lista.length === 1 ? "" : "s"}
                            {marcados ? <span className="ml-2 rounded-full bg-purple-600 px-1.5 text-white">{marcados}</span> : null}
                          </span>
                        </button>
                        {abierta && (
                          <ul className="divide-y">
                            {lista.map((p) => {
                              const e = elegidos[p.linea_id];
                              const agotado = p.disponible <= 0;
                              return (
                                <li key={p.linea_id} className={`px-3 py-2.5 ${e ? "bg-purple-50/50" : ""}`}>
                                  <label className={`flex items-start gap-3 ${agotado ? "opacity-50" : "cursor-pointer"}`}>
                                    <input
                                      type="checkbox"
                                      className="mt-1 h-4 w-4 accent-purple-600"
                                      checked={!!e}
                                      disabled={agotado && !e}
                                      onChange={() => alternar(p)}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="block font-medium text-slate-800">
                                        {p.codigo ? <span className="font-mono text-xs text-slate-500">[{p.codigo}] </span> : null}
                                        {p.producto}
                                      </span>
                                      <span className="block text-xs text-slate-500">
                                        Facturado {p.cantidad} · {agotado ? "ya acreditado todo" : `queda por acreditar ${p.disponible}`} ·{" "}
                                        {formatoMonto(p.precio_unidad, factura.moneda)} c/u con impuestos
                                      </span>
                                    </span>
                                  </label>
                                  {e && (
                                    <div className="mt-2 pl-7">
                                      {p.con_serial && p.seriales.length > 0 ? (
                                        <div className="flex flex-wrap gap-1.5">
                                          {p.seriales.map((s) => {
                                            const marcado = e.seriales.includes(s.serial);
                                            return (
                                              <button
                                                key={s.serial}
                                                type="button"
                                                disabled={!!s.nc}
                                                title={s.nc ? `Ya está en NC-${s.nc}` : ""}
                                                onClick={() =>
                                                  cambiar(p.linea_id, {
                                                    seriales: marcado
                                                      ? e.seriales.filter((x) => x !== s.serial)
                                                      : [...e.seriales, s.serial],
                                                  })
                                                }
                                                className={`rounded-lg border px-2 py-1 font-mono text-[11px] ${
                                                  s.nc
                                                    ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 line-through"
                                                    : marcado
                                                      ? "border-purple-500 bg-purple-600 text-white"
                                                      : "border-slate-300 bg-white text-slate-700 hover:border-purple-400"
                                                }`}
                                              >
                                                {s.serial}
                                                {s.nc ? ` · NC-${s.nc}` : ""}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      ) : p.con_serial ? (
                                        <label className="block space-y-1">
                                          <span className="text-xs text-slate-500">
                                            Odoo no tiene los seriales que salieron con esta factura: escríbelos (uno por línea).
                                          </span>
                                          <Textarea
                                            rows={2}
                                            className="font-mono text-xs"
                                            value={e.manual}
                                            onChange={(ev) => cambiar(p.linea_id, { manual: ev.target.value })}
                                          />
                                        </label>
                                      ) : (
                                        <label className="flex items-center gap-2">
                                          <span className="text-xs text-slate-500">Cantidad</span>
                                          <Input
                                            type="number"
                                            step="any"
                                            min="0"
                                            max={p.disponible}
                                            className="h-8 w-24 text-right text-xs"
                                            value={e.cantidad}
                                            onChange={(ev) => cambiar(p.linea_id, { cantidad: ev.target.value })}
                                          />
                                          <span className="text-xs text-slate-400">de {p.disponible}</span>
                                        </label>
                                      )}
                                      <p className="mt-1 text-right text-xs font-medium text-slate-700">
                                        {cantidadDe(p, e)} × {formatoMonto(p.precio_unidad, factura.moneda)} ={" "}
                                        {formatoMonto(r2(p.precio_unidad * cantidadDe(p, e)), factura.moneda)}
                                      </p>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  {!grupos.length && <p className="px-3 py-3 text-slate-400">Ningún producto coincide.</p>}
                </div>
              )}
              {lineas.length > 0 && (
                <p className="text-right text-slate-700">
                  {lineas.length} producto{lineas.length === 1 ? "" : "s"} · Total de la nota{" "}
                  <strong className="text-base text-slate-900">{formatoMonto(total, factura.moneda)}</strong>
                </p>
              )}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-600">3. Por qué se hace la nota de crédito</span>
            <Textarea
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: el cliente devolvió los equipos sin abrir, error en el precio facturado…"
            />
          </label>
          {(error || (lineas.length > 0 && problema)) && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{error || problema}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </Button>
            <Button onClick={enviar} disabled={enviando || !factura || !lineas.length || !!problema || motivo.trim().length < 10}>
              {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Enviar a aprobación
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
