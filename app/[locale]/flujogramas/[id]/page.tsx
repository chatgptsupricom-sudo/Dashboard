"use client";

import { Lienzo, type Seleccion } from "@/components/flujogramas/Lienzo";
import {
  ALTO_MIN,
  nuevoId,
  type Conexion,
  type Flujograma,
  type Meta,
  type Paso,
  type TipoPaso,
} from "@/lib/flujogramas/tipos";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Check,
  Circle,
  Diamond,
  Download,
  Loader2,
  Pencil,
  Save,
  Spline,
  Square,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Datos = Pick<Flujograma, "proceso" | "subproceso" | "meta" | "pasos" | "conexiones">;

const boton =
  "flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50";

/** Celda del encabezado / pie: texto fijo al ver, campo al editar. */
function Campo({
  valor,
  editable,
  onCambio,
  className,
  placeholder,
}: {
  valor: string;
  editable: boolean;
  onCambio: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  if (!editable) return <span className={className}>{valor}</span>;
  return (
    <input
      value={valor}
      onChange={(e) => onCambio(e.target.value)}
      placeholder={placeholder}
      className={cn("w-full rounded border border-slate-300 bg-white px-1 py-0.5 outline-none focus:border-blue-500", className)}
    />
  );
}

export default function FlujogramaPage() {
  const { locale, id } = useParams<{ locale: string; id: string }>();
  const router = useRouter();
  const buscar = useSearchParams();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editando, setEditando] = useState(buscar.get("editar") === "1");
  const [cambios, setCambios] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [seleccion, setSeleccion] = useState<Seleccion>(null);
  const [conectando, setConectando] = useState<{ desde: string | null } | null>(null);
  const hoja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/flujogramas/${id}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then(({ flujograma }: { flujograma: Flujograma }) => setDatos(flujograma))
      .catch((e) => setError(e.message));
  }, [id]);

  // Avisa antes de salir con cambios sin guardar.
  useEffect(() => {
    if (!cambios) return;
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aviso);
    return () => window.removeEventListener("beforeunload", aviso);
  }, [cambios]);

  const cambiar = useCallback((f: (d: Datos) => Datos) => {
    setDatos((d) => (d ? f(d) : d));
    setCambios(true);
  }, []);
  const setMeta = (k: keyof Meta, v: string) => cambiar((d) => ({ ...d, meta: { ...d.meta, [k]: v } }));

  const guardar = async () => {
    if (!datos) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch(`/api/flujogramas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setDatos(j.flujograma);
      setCambios(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!datos || !confirm(`¿Eliminar el flujograma «${datos.subproceso || datos.proceso}»? No se puede deshacer.`)) return;
    const r = await fetch(`/api/flujogramas/${id}`, { method: "DELETE" });
    if (r.ok) router.replace(`/${locale}/flujogramas`);
    else setError("No se pudo eliminar.");
  };

  // Agrega una figura debajo de la seleccionada (y la une con una flecha), o al final.
  const agregar = (tipo: TipoPaso) => {
    if (!datos) return;
    const base = seleccion?.tipo === "paso" ? datos.pasos.find((p) => p.id === seleccion.id) : undefined;
    const paso: Paso = {
      id: nuevoId("p"),
      tipo,
      texto: tipo === "terminal" ? "FIN" : tipo === "decision" ? "¿CONDICIÓN?" : "NUEVA ACTIVIDAD",
      x: base ? base.x : 40,
      y: base
        ? base.y + ALTO_MIN[base.tipo] + 60
        : Math.max(0, ...datos.pasos.map((p) => p.y + ALTO_MIN[p.tipo])) + 60,
    };
    cambiar((d) => ({
      ...d,
      pasos: [...d.pasos, paso],
      conexiones: base ? [...d.conexiones, { id: nuevoId("k"), desde: base.id, hasta: paso.id, etiqueta: "" }] : d.conexiones,
    }));
    setSeleccion({ tipo: "paso", id: paso.id });
  };

  const borrarSeleccion = useCallback(() => {
    if (!seleccion) return;
    cambiar((d) =>
      seleccion.tipo === "paso"
        ? {
            ...d,
            pasos: d.pasos.filter((p) => p.id !== seleccion.id),
            conexiones: d.conexiones.filter((c) => c.desde !== seleccion.id && c.hasta !== seleccion.id),
          }
        : { ...d, conexiones: d.conexiones.filter((c) => c.id !== seleccion.id) },
    );
    setSeleccion(null);
  }, [seleccion, cambiar]);

  // Supr borra lo seleccionado; Esc cancela la flecha que se está trazando.
  useEffect(() => {
    if (!editando) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "Escape") setConectando(null);
      if (e.key === "Delete") borrarSeleccion();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [editando, borrarSeleccion]);

  // En modo Conectar: primer clic = de dónde sale, segundo = a dónde llega.
  const seleccionar = (s: Seleccion) => {
    if (conectando && s?.tipo === "paso") {
      if (!conectando.desde) return setConectando({ desde: s.id });
      if (conectando.desde !== s.id) {
        const nueva: Conexion = { id: nuevoId("k"), desde: conectando.desde, hasta: s.id, etiqueta: "" };
        cambiar((d) => ({ ...d, conexiones: [...d.conexiones, nueva] }));
        setSeleccion({ tipo: "conexion", id: nueva.id });
      }
      return setConectando(null);
    }
    setSeleccion(s);
  };

  const conexionSel = seleccion?.tipo === "conexion" ? datos?.conexiones.find((c) => c.id === seleccion.id) : undefined;
  const nombre = (datos?.subproceso || datos?.proceso || "flujograma").replace(/[\\/:*?"<>|]/g, "-");

  /** Foto de la hoja (encabezado, diagrama y pie) sin selección ni controles. */
  const exportar = async (formato: "png" | "pdf") => {
    setExportando(true);
    setSeleccion(null);
    setConectando(null);
    try {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const nodo = hoja.current!;
      const { toPng } = await import("html-to-image");
      const png = await toPng(nodo, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        filter: (el) => !(el instanceof HTMLElement && el.dataset?.exportar === "no"),
      });
      if (formato === "png") {
        const a = document.createElement("a");
        a.href = png;
        a.download = `${nombre}.png`;
        a.click();
        return;
      }
      // PDF: la imagen impresa en una hoja vertical desde un iframe; el navegador ofrece "Guardar como PDF".
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(
        `<!doctype html><html><head><title>${nombre}</title><style>@page{size:portrait;margin:8mm}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:auto}</style></head><body><img src="${png}"></body></html>`,
      );
      doc.close();
      const img = doc.querySelector("img")!;
      await (img.complete ? Promise.resolve() : new Promise((r) => (img.onload = r)));
      iframe.contentWindow!.focus();
      iframe.contentWindow!.print();
      setTimeout(() => iframe.remove(), 60_000);
    } catch (e: any) {
      setError(`No se pudo generar el archivo: ${e?.message || e}`);
    } finally {
      setExportando(false);
    }
  };

  if (!datos)
    return (
      <div className="p-8">
        {error ? <p className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</p> : <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
      </div>
    );

  const ed = editando && !exportando;
  const m = datos.meta;

  return (
    <div className="space-y-4 p-4 sm:p-8">
      {/* Barra */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/${locale}/flujogramas`} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Flujogramas
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {error && <span className="text-sm text-red-600">{error}</span>}
          {cambios && <span className="text-sm text-amber-600">Cambios sin guardar</span>}
          <button onClick={() => exportar("png")} disabled={exportando} className={boton}>
            {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} PNG
          </button>
          <button onClick={() => exportar("pdf")} disabled={exportando} className={boton}>
            <Download className="h-4 w-4" /> PDF
          </button>
          {editando && (
            <button onClick={eliminar} className={cn(boton, "text-red-600 hover:border-red-300")}>
              <Trash2 className="h-4 w-4" /> Eliminar
            </button>
          )}
          {editando && (
            <button
              onClick={guardar}
              disabled={guardando || !cambios}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
            </button>
          )}
          <button
            onClick={() => {
              if (editando && cambios && !confirm("Hay cambios sin guardar. ¿Salir de la edición igual? (se pierden)")) return;
              if (editando && cambios) window.location.reload();
              setEditando((v) => !v);
              setSeleccion(null);
              setConectando(null);
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold text-white",
              editando ? "bg-emerald-600 hover:bg-emerald-700" : "bg-blue-600 hover:bg-blue-700",
            )}
          >
            {editando ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />} {editando ? "Terminar edición" : "Editar"}
          </button>
        </div>
      </div>

      {/* Herramientas de edición */}
      {editando && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
          <button onClick={() => agregar("actividad")} className={boton} title="Actividad (debajo de la figura seleccionada)">
            <Square className="h-4 w-4" /> Actividad
          </button>
          <button onClick={() => agregar("decision")} className={boton} title="Decisión con salidas SI / NO">
            <Diamond className="h-4 w-4" /> Decisión
          </button>
          <button onClick={() => agregar("terminal")} className={boton} title="Inicio, fin o cierre">
            <Circle className="h-4 w-4" /> Inicio / Fin
          </button>
          <button
            onClick={() => setConectando((c) => (c ? null : { desde: null }))}
            aria-pressed={!!conectando}
            className={cn(boton, conectando && "border-blue-500 bg-blue-50 text-blue-700")}
            title="Trazar una flecha: clic en la figura de origen y luego en la de destino"
          >
            <Spline className="h-4 w-4" /> Conectar
          </button>
          {conexionSel && (
            <label className="flex items-center gap-1.5 text-sm text-slate-600">
              Etiqueta
              <input
                value={conexionSel.etiqueta}
                onChange={(e) =>
                  cambiar((d) => ({
                    ...d,
                    conexiones: d.conexiones.map((c) => (c.id === conexionSel.id ? { ...c, etiqueta: e.target.value } : c)),
                  }))
                }
                placeholder="SI / NO"
                list="etiquetas-flujo"
                className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
              <datalist id="etiquetas-flujo">
                <option value="SI" />
                <option value="NO" />
              </datalist>
            </label>
          )}
          {seleccion && (
            <button onClick={borrarSeleccion} className={cn(boton, "text-red-600 hover:border-red-300")} title="Supr">
              <Trash2 className="h-4 w-4" /> Quitar {seleccion.tipo === "paso" ? "figura" : "flecha"}
            </button>
          )}
          <span className="ml-auto text-xs text-slate-500">
            {conectando
              ? conectando.desde
                ? "Ahora clic en la figura a la que llega la flecha (Esc cancela)."
                : "Clic en la figura de donde sale la flecha."
              : "Arrastra las figuras · Doble clic edita el texto · Clic en una flecha para ponerle SI / NO."}
          </span>
        </div>
      )}

      {/* Hoja: formato "Diagrama de procesos" */}
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div ref={hoja} className="mx-auto w-fit min-w-[760px] space-y-5 bg-white p-6 text-slate-900">
          <table className="w-full border-collapse border-2 border-slate-800 text-xs">
            <tbody>
              <tr>
                <td rowSpan={4} className="w-1/3 border-2 border-slate-800 p-2 text-center">
                  <img src="/Supricom-logo.png" alt="SUPRICOM" className="mx-auto max-h-12" />
                </td>
                <td rowSpan={4} className="w-1/3 border-2 border-slate-800 p-2 text-center text-sm font-bold text-blue-900">
                  DIAGRAMA DE PROCESOS
                </td>
                <td className="border border-slate-800 px-2 py-0.5">
                  <span className="flex gap-1">Fecha: <Campo valor={m.fecha} editable={ed} onCambio={(v) => setMeta("fecha", v)} /></span>
                </td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-0.5">
                  <span className="flex gap-1">Código: <Campo valor={m.codigo} editable={ed} onCambio={(v) => setMeta("codigo", v)} /></span>
                </td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-0.5">
                  <span className="flex gap-1">Versión: <Campo valor={m.version} editable={ed} onCambio={(v) => setMeta("version", v)} /></span>
                </td>
              </tr>
              <tr>
                <td className="border border-slate-800 px-2 py-0.5">Página: 1 de 1</td>
              </tr>
            </tbody>
          </table>

          <div className="space-y-3">
            <div className="text-right text-xl font-black uppercase leading-tight">
              <Campo
                valor={datos.proceso}
                editable={ed}
                onCambio={(v) => cambiar((d) => ({ ...d, proceso: v }))}
                placeholder="Proceso"
                className="text-right"
              />
            </div>
            <div>
              <p className="text-base font-black uppercase">Sub. proceso</p>
              <div className="text-base font-black uppercase underline">
                <Campo
                  valor={datos.subproceso}
                  editable={ed}
                  onCambio={(v) => cambiar((d) => ({ ...d, subproceso: v }))}
                  placeholder="Subproceso"
                />
              </div>
            </div>
          </div>

          <Lienzo
            pasos={datos.pasos}
            conexiones={datos.conexiones}
            editable={ed}
            seleccion={exportando ? null : seleccion}
            conectandoDesde={conectando?.desde ?? null}
            onSeleccionar={seleccionar}
            onMover={(pid, x, y) => cambiar((d) => ({ ...d, pasos: d.pasos.map((p) => (p.id === pid ? { ...p, x, y } : p)) }))}
            onTexto={(pid, texto) => cambiar((d) => ({ ...d, pasos: d.pasos.map((p) => (p.id === pid ? { ...p, texto } : p)) }))}
          />

          <table className="w-full border-collapse border-2 border-slate-800 text-xs">
            <tbody>
              <tr>
                {(
                  [
                    ["Elaborado por", "elaboradoPor", "elaboradoFecha"],
                    ["Revisado por", "revisadoPor", "revisadoFecha"],
                    ["Aprobado por", "aprobadoPor", "aprobadoFecha"],
                  ] as const
                ).map(([etq, quien, cuando]) => (
                  <td key={quien} className="w-1/3 border border-slate-800 px-2 py-1 align-top">
                    <span className="flex gap-1">{etq}: <Campo valor={m[quien]} editable={ed} onCambio={(v) => setMeta(quien, v)} /></span>
                    <span className="flex gap-1">Fecha: <Campo valor={m[cuando]} editable={ed} onCambio={(v) => setMeta(cuando, v)} /></span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
