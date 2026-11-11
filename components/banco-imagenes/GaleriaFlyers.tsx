"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import DescargaMultiple from "@/components/banco-imagenes/DescargaMultiple";
import { EditorFlyer, dinero, type ProductImage } from "@/components/banco-imagenes/EditorFlyer";
import { armarFlyer, descargarFlyer } from "@/lib/banco-imagenes/descargas";
import { cn } from "@/lib/utils";

export const SOMBRA = "shadow-[0_1px_2px_rgba(15,23,42,.04),0_10px_30px_rgba(15,23,42,.06)]";
const chip =
  "inline-flex h-[34px] items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600";
const chipOn = "border-transparent bg-blue-600 text-white";

const esNuevo = (fecha: string) => Date.now() - new Date(String(fecha).replace(" ", "T")).getTime() < 7 * 86400000;

/**
 * Galería del Banco de Flyers (vendedor y admin): filtros por marca y
 * categoría, tarjetas con precio, selección para revisar precios o bajar
 * varios, y el editor. El texto de búsqueda llega del buscador de la cabecera.
 */
export function GaleriaFlyers({
  busqueda,
  onQuitarBusqueda,
  admin = false,
  recarga = 0,
  onCambio,
  pie,
}: {
  busqueda: string;
  onQuitarBusqueda: () => void;
  /** Admin: muestra quién lo subió y deja eliminar. */
  admin?: boolean;
  /** Cambiar el número vuelve a pedir la galería (después de subir un flyer). */
  recarga?: number;
  /** Se borró un flyer: la cabecera actualiza sus números. */
  onCambio?: () => void;
  /** Lo que va debajo de la galería; recibe cuántos flyers salieron. */
  pie?: (total: number) => ReactNode;
}) {
  const [imagenes, setImagenes] = useState<ProductImage[]>([]);
  const [cargando, setCargando] = useState(true);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [paginas, setPaginas] = useState(1);
  const [marca, setMarca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [soloPrecio, setSoloPrecio] = useState(false);
  const [orden, setOrden] = useState("new");
  const [marcas, setMarcas] = useState<{ nombre: string; n: number }[]>([]);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [seleccion, setSeleccion] = useState<Map<number, ProductImage>>(new Map());
  const [editando, setEditando] = useState<ProductImage[]>([]);
  const [descargando, setDescargando] = useState<number | null>(null);
  const [borrar, setBorrar] = useState<ProductImage | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [recargaPropia, setRecargaPropia] = useState(0);

  useEffect(() => {
    fetch("/api/adminleads/banco-imagenes/categories")
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        setCategorias(d.categories || []);
        setMarcas(d.brands || []);
      })
      .catch(() => {});
  }, [recarga, recargaPropia]);

  useEffect(() => setPagina(1), [busqueda, marca, categoria, soloPrecio, orden]);

  useEffect(() => {
    const p = new URLSearchParams({ page: String(pagina), limit: "24", orden });
    if (busqueda.trim()) p.set("search", busqueda.trim());
    if (marca) p.set("brand", marca);
    if (categoria) p.set("category", categoria);
    if (soloPrecio) p.set("precio", admin ? "sin" : "con");
    let vigente = true;
    setCargando(true);
    // Un tecleo rápido no dispara una consulta por letra.
    const t = setTimeout(() => {
      fetch(`/api/adminleads/banco-imagenes?${p}`)
        .then((r) => r.json())
        .then((d) => {
          if (!vigente || !d.success) return;
          setImagenes(d.images || []);
          setTotal(d.total || 0);
          setPaginas(d.totalPages || 1);
        })
        .catch(() => {})
        .finally(() => vigente && setCargando(false));
    }, 250);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [pagina, busqueda, marca, categoria, soloPrecio, orden, admin, recarga, recargaPropia]);

  const alternar = (img: ProductImage) =>
    setSeleccion((prev) => {
      const next = new Map(prev);
      if (next.has(img.id)) next.delete(img.id);
      else next.set(img.id, img);
      return next;
    });

  async function bajar(img: ProductImage) {
    setDescargando(img.id);
    try {
      await descargarFlyer(armarFlyer(img, undefined, Number(img.price) > 0));
    } catch (e) {
      console.error("Descarga de flyer:", e);
      alert("No se pudo descargar el flyer. Intenta de nuevo.");
    } finally {
      setDescargando(null);
    }
  }

  async function eliminar() {
    if (!borrar) return;
    setBorrando(true);
    try {
      const r = await fetch(`/api/adminleads/banco-imagenes?id=${borrar.id}`, { method: "DELETE" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(d?.error || "No se pudo eliminar el flyer");
        return;
      }
      setSeleccion((prev) => {
        const next = new Map(prev);
        next.delete(borrar.id);
        return next;
      });
      setBorrar(null);
      setRecargaPropia((n) => n + 1);
      onCambio?.();
    } finally {
      setBorrando(false);
    }
  }

  const activos: [string, string, () => void][] = [];
  if (busqueda.trim()) activos.push(["q", `“${busqueda.trim()}”`, onQuitarBusqueda]);
  if (marca) activos.push(["marca", marca, () => setMarca("")]);
  if (categoria) activos.push(["categoria", categoria, () => setCategoria("")]);
  if (soloPrecio) activos.push(["precio", admin ? "Sin precio" : "Con precio", () => setSoloPrecio(false)]);
  const titulo = [marca, categoria].filter(Boolean).join(", ") || (busqueda.trim() ? "Resultados de la búsqueda" : "Todos los flyers");

  return (
    <div className="grid gap-[18px]">
      <section className={cn("grid min-w-0 gap-3 rounded-[22px] bg-white px-4 py-3.5", SOMBRA)} aria-label="Filtros">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="w-full flex-none text-xs font-semibold text-slate-400 sm:w-[72px]">Marca</span>
          {[{ nombre: "", n: marcas.reduce((s, m) => s + m.n, 0) }, ...marcas].map((m) => (
            <button
              key={m.nombre || "todas"}
              type="button"
              aria-pressed={marca === m.nombre}
              onClick={() => setMarca(m.nombre)}
              className={cn(chip, marca === m.nombre && chipOn)}
            >
              {m.nombre || "Todas"}
              <span
                className={cn(
                  "rounded-full px-1.5 text-[11px]",
                  marca === m.nombre ? "bg-white/20 text-white" : "bg-slate-50 text-slate-400",
                )}
              >
                {m.n}
              </span>
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="w-full flex-none text-xs font-semibold text-slate-400 sm:w-[72px]">Categoría</span>
          {["", ...categorias].map((c) => (
            <button
              key={c || "todas"}
              type="button"
              aria-pressed={categoria === c}
              onClick={() => setCategoria(c)}
              className={cn(chip, categoria === c && chipOn)}
            >
              {c || "Todas"}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-500">
            {activos.length === 0 ? (
              <span>Elige una marca o categoría, o escribe arriba.</span>
            ) : (
              <>
                {activos.map(([k, etiqueta, quitar]) => (
                  <span key={k} className="inline-flex h-[26px] items-center gap-1 rounded-full bg-blue-50 pl-2.5 pr-1.5 text-xs font-semibold text-blue-600">
                    {etiqueta}
                    <button type="button" onClick={quitar} aria-label={`Quitar ${etiqueta}`} className="grid h-[18px] w-[18px] place-items-center rounded-full">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  className="text-[13px] font-semibold text-blue-600"
                  onClick={() => {
                    activos.forEach(([, , quitar]) => quitar());
                  }}
                >
                  Quitar filtros
                </button>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <label className="inline-flex cursor-pointer select-none items-center gap-2 text-[13px] text-slate-500">
              <input
                type="checkbox"
                checked={soloPrecio}
                onChange={(e) => setSoloPrecio(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
              {admin ? "Solo sin precio" : "Solo con precio"}
            </label>
            <select
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
              aria-label="Ordenar"
              className="h-[34px] rounded-full border border-slate-200 bg-white px-3 text-[13px] text-slate-600"
            >
              <option value="new">Más recientes</option>
              <option value="az">Nombre A–Z</option>
              <option value="pa">Precio menor a mayor</option>
              <option value="pd">Precio mayor a menor</option>
            </select>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-slate-900">{titulo}</h2>
        <div className="flex items-center gap-3 text-[13px] text-slate-400">
          {(marca || categoria) && imagenes.length > 0 && (
            <button
              type="button"
              className="font-semibold text-blue-600"
              onClick={() =>
                setSeleccion((prev) => {
                  const next = new Map(prev);
                  imagenes.forEach((img) => next.set(img.id, img));
                  return next;
                })
              }
            >
              Seleccionar los {imagenes.length}
            </button>
          )}
          <span>
            {total} {total === 1 ? "flyer" : "flyers"}
          </span>
        </div>
      </div>

      {cargando ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        imagenes.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(210px,1fr))] sm:gap-4">
            {imagenes.map((img) => {
              const marcado = seleccion.has(img.id);
              const conPrecio = Number(img.price) > 0;
              return (
                <article
                  key={img.id}
                  className={cn(
                    "group flex min-w-0 flex-col overflow-hidden rounded-[22px] border-2 bg-white transition duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
                    SOMBRA,
                    marcado ? "border-blue-600" : "border-transparent",
                  )}
                >
                  <div className="relative aspect-[4/5] cursor-zoom-in overflow-hidden bg-slate-50" onClick={() => setEditando([img])}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.image_path}
                      alt={`Flyer de ${img.model || img.product_code || "producto"}`}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                    />
                    <button
                      type="button"
                      aria-pressed={marcado}
                      aria-label={`Seleccionar ${img.model || img.product_code || "flyer"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        alternar(img);
                      }}
                      className={cn(
                        "absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full border-2 text-white",
                        marcado ? "border-blue-600 bg-blue-600" : "border-white bg-slate-900/30",
                      )}
                    >
                      <Check className={cn("h-3.5 w-3.5", !marcado && "opacity-0")} strokeWidth={3} />
                    </button>
                    {esNuevo(img.created_at) && (
                      <span className="absolute right-2.5 top-3 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                        Nuevo
                      </span>
                    )}
                    <span
                      className={cn(
                        "absolute bottom-2.5 right-2.5 rounded-full px-2.5 py-1 text-[13px] font-bold shadow-[0_4px_12px_rgba(15,23,42,.18)]",
                        conPrecio ? "bg-white text-slate-900" : "bg-amber-50 text-amber-700",
                      )}
                    >
                      {conPrecio ? dinero(Number(img.price)) : "Sin precio"}
                    </span>
                  </div>
                  <div className="grid gap-0.5 px-3.5 pb-1 pt-3">
                    <b className="truncate text-sm font-semibold text-slate-900" title={img.model || ""}>
                      {img.model || img.product_code || "Flyer"}
                    </b>
                    <small className="truncate text-xs text-slate-500">
                      {[img.brand, img.product_code, admin && img.created_by ? `subido por ${img.created_by}` : null]
                        .filter(Boolean)
                        .join(", ")}
                    </small>
                  </div>
                  <div className={cn("grid gap-1.5 px-3 pb-3 pt-2.5", admin ? "grid-cols-[1fr_auto_auto]" : "grid-cols-[1fr_auto]")}>
                    <button
                      type="button"
                      onClick={() => bajar(img)}
                      disabled={descargando === img.id}
                      className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-full bg-[#0F172A] px-3 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {descargando === img.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span className="truncate">{conPrecio ? "Descargar" : "Descargar sin precio"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditando([img])}
                      aria-label="Personalizar precio"
                      title="Personalizar precio"
                      className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-slate-50 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Pencil className="h-[15px] w-[15px]" />
                    </button>
                    {admin && (
                      <button
                        type="button"
                        onClick={() => setBorrar(img)}
                        aria-label="Eliminar flyer"
                        title="Eliminar"
                        className="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-slate-50 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-[15px] w-[15px]" />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )
      )}

      {paginas > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Página {pagina} de {paginas}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="rounded-full" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {!cargando && pie?.(total)}

      {seleccion.size > 0 && (
        <div className="fixed bottom-[calc(16px+env(safe-area-inset-bottom,0px))] left-1/2 z-20 flex max-w-[calc(100vw-32px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-full bg-[#0F172A] py-2 pl-4 pr-2 text-white shadow-[0_14px_40px_rgba(15,23,42,.35)]">
          <b className="text-[13px]">
            {seleccion.size} {seleccion.size === 1 ? "seleccionado" : "seleccionados"}
          </b>
          <button
            type="button"
            onClick={() => setEditando(Array.from(seleccion.values()))}
            className="h-9 rounded-full bg-blue-600 px-3.5 text-[13px] font-semibold"
          >
            Revisar precios
          </button>
          <DescargaMultiple
            obtenerFlyers={(conPrecio) => Array.from(seleccion.values()).map((img) => armarFlyer(img, undefined, conPrecio))}
            etiqueta="Descargar todos"
            className="h-9 rounded-full border-0 bg-white/15 px-3.5 text-[13px] font-semibold text-white hover:bg-white/25"
          />
          <button
            type="button"
            aria-label="Quitar selección"
            onClick={() => setSeleccion(new Map())}
            className="grid h-9 w-9 place-items-center rounded-full text-slate-300 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <EditorFlyer flyers={editando} onClose={() => setEditando([])} />

      <Dialog open={borrar !== null} onOpenChange={(o) => !o && setBorrar(null)}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Eliminar flyer</DialogTitle>
            <DialogDescription>
              ¿Eliminar el flyer de {borrar?.model || borrar?.product_code}? No se puede deshacer. Si completaba una
              solicitud, ese producto vuelve a quedar pendiente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setBorrar(null)}>
              Cancelar
            </Button>
            <Button className="rounded-full bg-red-600 hover:bg-red-700" onClick={eliminar} disabled={borrando}>
              {borrando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
