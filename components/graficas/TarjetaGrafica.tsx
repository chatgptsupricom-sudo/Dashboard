"use client";

import { useRef, useState } from "react";
import { Download, Maximize2, Table2, BarChart3 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Grafica as TGrafica } from "@/lib/graficas/tipos";
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

/** Tarjeta de una gráfica: cambiar de medida (monto / unidades), ver como tabla, ampliar y bajar en PNG. */
export function TarjetaGrafica({ grafica: original, contexto }: { grafica: TGrafica; contexto: string }) {
  const [alterna, setAlterna] = useState(false);
  const grafica: TGrafica = alterna && original.alterna
    ? { ...original, datos: original.alterna.datos, formato: original.alterna.formato, detalle: original.alterna.detalle }
    : original;
  // Barra elegida con un clic: abre lo que la compone (ej. productos de esa marca).
  const [barra, setBarra] = useState<string | null>(null);
  const filasBarra = barra ? grafica.detalle?.filas[barra] : undefined;
  const graficaBarra: TGrafica | null = filasBarra && grafica.detalle
    ? {
        id: `${grafica.id}-detalle`,
        titulo: `${grafica.detalle.que} de ${barra}`,
        tipo: "barras_h",
        formato: grafica.formato,
        datos: filasBarra,
        series: [{ clave: "valor", etiqueta: grafica.series.length === 1 ? grafica.series[0].etiqueta : "Total", color: grafica.series[0].color }],
      }
    : null;
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
          {grafica.detalle && (
            <p className="text-[11px] text-blue-600 mt-0.5">Clic en una barra para ver sus {grafica.detalle.que.toLowerCase()}.</p>
          )}
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
      {tabla ? <TablaGrafica grafica={grafica} /> : <Grafica grafica={grafica} onBarra={setBarra} />}

      <Dialog open={!!graficaBarra} onOpenChange={(abierto) => !abierto && setBarra(null)}>
        <DialogContent className="max-w-[min(1100px,95vw)] sm:max-w-[min(1100px,95vw)]">
          {graficaBarra && (
            <>
              <DialogHeader>
                <DialogTitle>{graficaBarra.titulo}</DialogTitle>
                <DialogDescription>
                  {grafica.titulo}. {filasBarra!.length >= 30 ? "Los 30 con más peso." : `${filasBarra!.length} en total.`}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 lg:grid-cols-[1fr_380px] max-h-[75vh] overflow-y-auto">
                <Grafica grafica={graficaBarra} />
                <TablaGrafica grafica={graficaBarra} />
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
            <Grafica grafica={grafica} alto={Math.max(420, Math.min(640, grafica.datos.length * 30 + 60))} onBarra={(b) => { setAmpliada(false); setBarra(b); }} />
            <TablaGrafica grafica={grafica} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
