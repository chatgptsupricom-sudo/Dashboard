"use client";

import { useRef, useState } from "react";
import { BarChart3, ChevronRight, Download, Loader2, Maximize2, Table2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SEP, type Grafica as TGrafica, type NodoDetalle } from "@/lib/graficas/tipos";
import { Grafica, TablaGrafica } from "./Grafica";

function Boton({ titulo, onClick, children, activo }: { titulo: string; onClick: () => void; children: React.ReactNode; activo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-label={titulo}
      className={`h-7 w-7 inline-flex items-center justify-center rounded-lg transition ${activo ? "bg-slate-900 text-white" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
    >
      {children}
    </button>
  );
}

export type PedirDetalle = (graficaId: string, alterna: boolean, ruta: string[]) => Promise<NodoDetalle>;

/**
 * Tarjeta de una gráfica: cambiar de medida (monto / unidades), ver como
 * tabla, ampliar, bajar en PNG y abrir el detalle de una barra (lo pide al
 * servidor con `pedirDetalle`, nivel por nivel).
 */
export function TarjetaGrafica({ grafica: original, contexto, pedirDetalle }: { grafica: TGrafica; contexto: string; pedirDetalle?: PedirDetalle }) {
  const [alterna, setAlterna] = useState(false);
  const grafica: TGrafica = alterna && original.alterna
    ? { ...original, datos: original.alterna.datos, formato: original.alterna.formato, conDetalle: original.alterna.conDetalle }
    : original;
  // Camino de clics: [barra] → lo que la compone; [barra, fila] → lo que compone esa fila, y así.
  const [ruta, setRuta] = useState<string[]>([]);
  const [nodos, setNodos] = useState<Record<string, NodoDetalle>>({});
  const [cargando, setCargando] = useState<string | null>(null);
  const [errorDetalle, setErrorDetalle] = useState<string | null>(null);
  const llave = (r: string[]) => `${alterna ? "u" : "m"}${SEP}${r.join(SEP)}`;
  const nivel = ruta.length ? nodos[llave(ruta)] : undefined;
  const conDetalle = new Set(grafica.conDetalle ?? []);
  const tieneDetalle = (r: string[]) =>
    r.length === 1 ? conDetalle.has(r[0]) : !!nodos[llave(r.slice(0, -1))]?.conDetalle.includes(r[r.length - 1]);
  const abrir = async (r: string[]) => {
    if (!pedirDetalle || !tieneDetalle(r)) return;
    setErrorDetalle(null);
    if (!nodos[llave(r)]) {
      setCargando(r[r.length - 1]);
      try {
        const n = await pedirDetalle(grafica.id, alterna, r);
        setNodos((prev) => ({ ...prev, [llave(r)]: n }));
      } catch (e: any) {
        setErrorDetalle(e?.message || "No se pudo abrir el detalle.");
        return;
      } finally {
        setCargando(null);
      }
    }
    setRuta(r);
  };
  const bajar = (etiqueta: string) => abrir([...ruta, etiqueta]);
  const graficaNivel: TGrafica | null = nivel
    ? {
        id: `${grafica.id}-detalle`,
        titulo: `${nivel.que} de ${ruta[ruta.length - 1]}`,
        tipo: "barras_h",
        formato: grafica.formato,
        datos: nivel.filas,
        series: [{ clave: "valor", etiqueta: grafica.series.length === 1 ? grafica.series[0].etiqueta : "Total", color: grafica.series[0].color }],
      }
    : null;
  const filaClicable = (etiqueta: string) => !!nivel?.conDetalle.includes(etiqueta);
  const [tabla, setTabla] = useState(false);
  const [ampliada, setAmpliada] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const descargar = async () => {
    if (!ref.current) return;
    const { toPng } = await import("html-to-image");
    const url = await toPng(ref.current, { backgroundColor: "#ffffff", pixelRatio: 2, filter: (n: HTMLElement) => !n.dataset?.noExportar });
    const a = document.createElement("a");
    a.href = url;
    a.download = `${grafica.id}${alterna ? "-unidades" : ""}-${contexto}.png`;
    a.click();
  };

  return (
    <div
      ref={ref}
      className={`group rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.18)] ${grafica.ancho === 2 ? "lg:col-span-2" : ""}`}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-900 leading-tight">{grafica.titulo}</h3>
          {grafica.descripcion && <p className="text-xs text-slate-500 mt-0.5">{grafica.descripcion}</p>}
          {pedirDetalle && conDetalle.size > 0 && (
            <p className="text-[11px] text-blue-600 mt-0.5 flex items-center gap-1" data-no-exportar="1">
              {cargando ? <><Loader2 className="h-3 w-3 animate-spin" /> Abriendo {cargando}…</> : "Clic en una barra para ver su detalle."}
            </p>
          )}
          {errorDetalle && <p className="text-[11px] text-red-600 mt-0.5">{errorDetalle}</p>}
        </div>
        {original.alterna && (
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs" role="radiogroup" aria-label="Medida">
            {[false, true].map((alt) => (
              <button
                key={String(alt)}
                type="button"
                role="radio"
                aria-checked={alterna === alt}
                onClick={() => setAlterna(alt)}
                className={`rounded-md px-2 py-0.5 font-medium transition ${alterna === alt ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
              >
                {alt ? original.alterna!.etiqueta : original.etiquetaPrincipal || "Monto"}
              </button>
            ))}
          </div>
        )}
        <div data-no-exportar="1" className="flex gap-0.5 opacity-60 group-hover:opacity-100 transition">
          <Boton titulo={tabla ? "Ver gráfica" : "Ver tabla"} onClick={() => setTabla((t) => !t)} activo={tabla}>
            {tabla ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          </Boton>
          <Boton titulo="Ampliar" onClick={() => setAmpliada(true)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </Boton>
          <Boton titulo="Descargar PNG" onClick={descargar}>
            <Download className="h-3.5 w-3.5" />
          </Boton>
        </div>
      </div>
      {tabla ? (
        <TablaGrafica grafica={grafica} onFila={pedirDetalle ? (e) => abrir([e]) : undefined} clicable={(e) => conDetalle.has(e)} />
      ) : (
        <Grafica grafica={grafica} onBarra={pedirDetalle && conDetalle.size ? (e) => abrir([e]) : undefined} />
      )}

      <Dialog open={!!graficaNivel} onOpenChange={(abierto) => !abierto && setRuta([])}>
        <DialogContent className="max-w-[min(1100px,95vw)] sm:max-w-[min(1100px,95vw)]">
          {graficaNivel && nivel && (
            <>
              <DialogHeader>
                {/* Migas: cada paso vuelve a ese nivel. */}
                <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500" aria-label="Camino">
                  <button type="button" className="hover:text-blue-600 hover:underline" onClick={() => setRuta([])}>{grafica.titulo}</button>
                  {ruta.map((paso, i) => (
                    <span key={i} className="flex items-center gap-1">
                      <ChevronRight className="h-3 w-3" />
                      {i === ruta.length - 1 ? (
                        <span className="font-medium text-slate-700">{paso}</span>
                      ) : (
                        <button type="button" className="hover:text-blue-600 hover:underline" onClick={() => setRuta(ruta.slice(0, i + 1))}>{paso}</button>
                      )}
                    </span>
                  ))}
                </nav>
                <DialogTitle>{graficaNivel.titulo}</DialogTitle>
                <DialogDescription>
                  {nivel.filas.length >= 15 ? `Los ${nivel.filas.length} con más peso.` : `${nivel.filas.length} en total.`}
                  {nivel.filas.some((f) => filaClicable(f.etiqueta)) && " Clic en una fila para seguir bajando."}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 lg:grid-cols-[1fr_380px] max-h-[70vh] overflow-y-auto">
                <Grafica grafica={graficaNivel} onBarra={nivel.filas.some((f) => filaClicable(f.etiqueta)) ? bajar : undefined} />
                <TablaGrafica grafica={graficaNivel} onFila={bajar} clicable={filaClicable} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ampliada} onOpenChange={setAmpliada}>
        <DialogContent className="max-w-[min(1200px,95vw)] sm:max-w-[min(1200px,95vw)]">
          <DialogHeader>
            <DialogTitle>{grafica.titulo}</DialogTitle>
            {grafica.descripcion && <DialogDescription>{grafica.descripcion}</DialogDescription>}
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <Grafica grafica={grafica} alto={Math.max(420, Math.min(640, grafica.datos.length * 30 + 60))} onBarra={pedirDetalle && conDetalle.size ? (b) => { if (conDetalle.has(b)) { setAmpliada(false); void abrir([b]); } } : undefined} />
            <TablaGrafica grafica={grafica} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
