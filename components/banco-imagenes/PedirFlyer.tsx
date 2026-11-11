"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ProductoPedible {
  id: number;
  codigo: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  flyerId: number | null;
  mia: string | null;
  otros: number;
  etapa: "por_aprobar" | "en_desarrollo" | "hecho" | "descartado" | null;
}

const campo = "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm";

function Segmento<T extends string>({ valor, opciones, onChange }: { valor: T; opciones: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1">
      {opciones.map(([v, t]) => (
        <button
          key={v}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onChange(v)}
          className={cn(
            "h-9 rounded-full text-[13px] font-semibold text-slate-500",
            valor === v && "bg-white text-blue-600 shadow-[0_1px_3px_rgba(15,23,42,.1)]",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

/**
 * Panel lateral para pedir flyers. Cada resultado de Odoo dice si ya tiene
 * flyer (se descarga en vez de pedirlo), si ya lo pediste, o si otros
 * vendedores ya lo piden: ahí te sumas a esa misma fila y el flyer se diseña
 * una sola vez.
 */
export function PedirFlyer({
  abierto,
  onCerrar,
  busquedaInicial,
  onEnviada,
}: {
  abierto: boolean;
  onCerrar: () => void;
  busquedaInicial: string;
  onEnviada: (codigo: string, estado: string) => void;
}) {
  const [tipo, setTipo] = useState<"productos" | "categoria">("productos");
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<ProductoPedible[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [elegidos, setElegidos] = useState<ProductoPedible[]>([]);
  const [categorias, setCategorias] = useState<{ id: number; nombre: string; productos: number }[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [urgencia, setUrgencia] = useState<"normal" | "alta">("normal");
  const [fecha, setFecha] = useState("");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Al abrir: lo que se buscó en la galería ya viene escrito.
  useEffect(() => {
    if (!abierto) return;
    setQ(busquedaInicial);
    setError(null);
  }, [abierto, busquedaInicial]);

  useEffect(() => {
    if (!abierto || tipo !== "productos") return;
    const texto = q.trim();
    if (texto.length < 2) {
      setResultados([]);
      return;
    }
    let vigente = true;
    setBuscando(true);
    const t = setTimeout(() => {
      fetch(`/api/vendedores/banco-imagenes/productos?q=${encodeURIComponent(texto)}`)
        .then((r) => r.json())
        .then((d) => vigente && setResultados(d.productos || []))
        .catch(() => vigente && setResultados([]))
        .finally(() => vigente && setBuscando(false));
    }, 300);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [q, abierto, tipo]);

  useEffect(() => {
    if (tipo !== "categoria" || categorias.length) return;
    fetch("/api/vendedores/banco-imagenes/productos?categorias=1")
      .then((r) => r.json())
      .then((d) => setCategorias(d.categorias || []))
      .catch(() => {});
  }, [tipo, categorias.length]);

  function limpiar() {
    setElegidos([]);
    setQ("");
    setResultados([]);
    setCategoriaId("");
    setUrgencia("normal");
    setFecha("");
    setMotivo("");
    setTipo("productos");
  }

  async function enviar() {
    setError(null);
    if (tipo === "productos" && elegidos.length === 0) return setError("Agrega al menos un producto");
    if (tipo === "categoria" && !categoriaId) return setError("Elige una categoría");
    if (!motivo.trim()) return setError("Cuéntanos para qué es: el cliente o la campaña");
    setEnviando(true);
    try {
      const r = await fetch("/api/vendedores/banco-imagenes/solicitudes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tipo,
          productos: elegidos.map((p) => p.id),
          categoriaId: Number(categoriaId) || null,
          urgencia,
          paraCuando: fecha || null,
          motivo: motivo.trim(),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return setError(d?.error || "No se pudo enviar la solicitud");
      limpiar();
      onEnviada(d.codigo, d.estado);
    } catch (e: any) {
      setError(e?.message || "Error de conexión");
    } finally {
      setEnviando(false);
    }
  }

  const cat = categorias.find((c) => String(c.id) === categoriaId);

  return (
    <Sheet open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[460px]">
        <div className="border-b border-slate-200 px-5 py-[18px]">
          <SheetTitle className="text-[17px] font-bold">Pedir flyer</SheetTitle>
        </div>

        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 py-[18px]">
          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold">¿Qué necesitas?</span>
            <Segmento
              valor={tipo}
              onChange={setTipo}
              opciones={[
                ["productos", "Uno o varios productos"],
                ["categoria", "Una categoría completa"],
              ]}
            />
          </div>

          {tipo === "productos" ? (
            <div className="grid gap-1.5">
              <label htmlFor="pedir-q" className="text-[13px] font-semibold">
                Busca en Odoo <span className="text-xs font-normal text-slate-400">por código o nombre</span>
              </label>
              <input
                id="pedir-q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Ej: L8050 o impresora fotográfica"
                autoComplete="off"
                className={campo}
              />
              {(buscando || resultados.length > 0) && (
                <div className="max-h-[260px] overflow-y-auto rounded-2xl border border-slate-200">
                  {buscando && resultados.length === 0 ? (
                    <div className="flex justify-center p-4">
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    </div>
                  ) : (
                    resultados.map((p) => {
                      const ya = elegidos.some((e) => e.id === p.id);
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2 border-t border-slate-200 px-3 py-2.5 first:border-t-0">
                          <div className="min-w-0">
                            <b className="block truncate text-[13px]">{p.nombre}</b>
                            <small className="text-xs text-slate-500">
                              {[p.codigo, p.marca].filter(Boolean).join(", ")}
                            </small>
                            <div className="mt-0.5">
                              {p.flyerId ? (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                  Ya tiene flyer
                                </span>
                              ) : p.mia ? (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                  Ya lo pediste en {p.mia}
                                </span>
                              ) : p.otros > 0 ? (
                                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-600">
                                  {p.otros === 1 ? "Lo pidió 1 vendedor" : `Lo pidieron ${p.otros} vendedores`},{" "}
                                  {p.etapa === "en_desarrollo" ? "en desarrollo" : "por aprobar"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {p.flyerId ? (
                            <a
                              href={`/api/adminleads/banco-imagenes/image/${p.flyerId}`}
                              download
                              className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                            >
                              Descargar
                            </a>
                          ) : (
                            <button
                              type="button"
                              disabled={ya || !!p.mia}
                              onClick={() => setElegidos((prev) => [...prev, p])}
                              className="h-[30px] shrink-0 rounded-full border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400"
                            >
                              {ya ? "Agregado" : p.otros > 0 ? "Sumarme" : "Agregar"}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
              {elegidos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {elegidos.map((p) => (
                    <span key={p.id} className="inline-flex h-[30px] items-center gap-1 rounded-full bg-blue-50 pl-2.5 pr-1.5 text-xs font-semibold text-blue-600">
                      {p.codigo || p.nombre}
                      {p.otros > 0 && <span className="font-normal">(te sumas)</span>}
                      <button
                        type="button"
                        aria-label={`Quitar ${p.codigo || p.nombre}`}
                        onClick={() => setElegidos((prev) => prev.filter((e) => e.id !== p.id))}
                        className="grid h-[18px] w-[18px] place-items-center rounded-full"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-1.5">
              <label htmlFor="pedir-cat" className="text-[13px] font-semibold">
                Categoría
              </label>
              <select id="pedir-cat" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className={campo}>
                <option value="">{categorias.length ? "Elige una categoría" : "Cargando…"}</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.productos})
                  </option>
                ))}
              </select>
              <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-[13px] text-slate-600">
                {cat
                  ? `Al aprobarla se arma la lista con los productos de ${cat.nombre} que todavía no tienen flyer.`
                  : "Se piden los flyers de todos los productos de la categoría que todavía no tienen."}
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <span className="text-[13px] font-semibold">Urgencia</span>
            <Segmento
              valor={urgencia}
              onChange={setUrgencia}
              opciones={[
                ["normal", "Normal"],
                ["alta", "Alta"],
              ]}
            />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="pedir-fecha" className="text-[13px] font-semibold">
              ¿Para cuándo lo necesitas? <span className="text-xs font-normal text-slate-400">opcional</span>
            </label>
            <input id="pedir-fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
          </div>
          <div className="grid gap-1.5">
            <label htmlFor="pedir-motivo" className="text-[13px] font-semibold">
              ¿Para qué es?
            </label>
            <textarea
              id="pedir-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: campaña de regreso a clases para el cliente Librería Central"
              className={cn(campo, "h-20 resize-y py-2.5")}
            />
          </div>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3.5">
          <button
            type="button"
            onClick={onCerrar}
            className="h-9 rounded-full border border-slate-200 bg-white px-3.5 text-[13px] font-semibold text-slate-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0F172A] px-3.5 text-[13px] font-semibold text-white disabled:opacity-45"
          >
            {enviando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Enviar solicitud
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
