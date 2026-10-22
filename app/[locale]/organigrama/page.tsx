"use client";

import { Organigrama, type EdicionRapida } from "@/components/organigrama/Organigrama";
import s from "@/components/organigrama/organigrama.module.css";
import { PanelCargo } from "@/components/organigrama/PanelCargo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RecorridoGuiado, useRecorrido, type PasoRecorrido } from "@/components/ui/recorrido-guiado";
import { cadenaDeMando, hijosPorPadre, ORGANIGRAMAS, type Nodo, type Organigrama as Org } from "@/lib/organigrama/tipos";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Download,
  FileImage,
  FileSpreadsheet,
  FileText,
  Hand,
  Loader2,
  Maximize2,
  Minus,
  Network,
  Pencil,
  Plus,
  Search,
  Check,
  CircleHelp,
  LayoutGrid,
  Move,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;
const limitarZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));
const esperarPintado = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

// Recorrido guiado: sale cada vez que se entra, hasta "No volver a mostrar".
// Los pasos de edición prenden el modo Editar para que se vean sus botones.
function pasosOrganigrama(setEditando: (v: boolean) => void): PasoRecorrido[] {
  const lectura = () => setEditando(false);
  return [
    {
      selector: '[data-tour="org-pestanas"]',
      titulo: "Dos organigramas",
      texto: "«Organigrama actual» es cómo está hoy la empresa; «Organigrama propuesto», la estructura hacia la que se quiere ir. Cada uno se edita por separado.",
      antes: lectura,
    },
    {
      selector: '[data-tour="org-lienzo"]',
      titulo: "Cada recuadro es un cargo",
      texto: "Las franjas son los niveles: el nivel sale de a quién reporta cada cargo. Haz clic en un recuadro para ver su propósito y sus actividades.",
      antes: lectura,
    },
    {
      selector: '[data-tour="org-buscar"]',
      titulo: "Buscar",
      texto: "Escribe un cargo o el nombre de una persona y se resalta en el organigrama.",
    },
    {
      selector: '[data-tour="org-vista"]',
      titulo: "Moverse y acercar",
      texto: "Con la manito (o Ctrl + arrastrar) te mueves por el organigrama. Los botones o Ctrl + rueda acercan y alejan; el último lo ajusta al ancho de la pantalla.",
    },
    {
      selector: '[data-tour="org-descargar"]',
      titulo: "Descargar",
      texto: "Sácalo en imagen o en PDF tal como se ve, o baja las actividades de todos los cargos en Excel.",
    },
    {
      selector: '[data-tour="org-editar"]',
      titulo: "Editar",
      texto: "Al entrar está en solo lectura para que nada se mueva por accidente. «Editar» habilita los cambios y «Terminar edición» vuelve a solo lectura.",
      antes: lectura,
    },
    {
      selector: '[data-tour="org-lienzo"]',
      titulo: "Mover y cambiar cargos",
      texto: "Editando, arrastra un recuadro dentro de su franja (Mayús: con sus subordinados). Doble clic edita el nombre y las personas; el clic abre el panel con «Reporta a», que es la única forma de cambiarlo de nivel.",
      antes: () => setEditando(true),
    },
    {
      selector: '[data-tour="org-ordenar"]',
      titulo: "Ordenar y agregar",
      texto: "«Ordenar automáticamente» vuelve a acomodar todo solo (se pierde dónde moviste los recuadros). «Cargo sin superior» agrega uno que no reporta a nadie.",
      antes: () => setEditando(true),
    },
    {
      titulo: "Listo",
      texto: "Este recorrido sale cada vez que entras, hasta que marques «No volver a mostrar». También lo abres con «¿Cómo funciona?».",
      antes: lectura,
    },
  ];
}

export default function OrganigramaPage() {
  // Pestañas: un organigrama por pestaña. Se entra en solo lectura; «Editar» habilita los cambios.
  const [org, setOrg] = useState<Org>("actual");
  const [editando, setEditando] = useState(false);
  // El recorrido arranca la primera vez que hay organigrama (no al cambiar de pestaña).
  const [listoTour, setListoTour] = useState(false);
  const recorrido = useRecorrido("tour-organigrama-v1", listoTour, { cadaVez: true });
  const pasosTour = useMemo(() => pasosOrganigrama(setEditando), []);
  const [nodos, setNodos] = useState<Nodo[]>([]);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    if (!cargando && nodos.length) setListoTour(true);
  }, [cargando, nodos.length]);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<{ id: number; tab?: "actividades" | "datos" } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [zoom, setZoom] = useState(1);
  const [creando, setCreando] = useState(false);
  const [exportando, setExportando] = useState<null | "png" | "pdf">(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const objetivoExportar = useRef<HTMLDivElement>(null);
  const ajustado = useRef(false);

  // Desplazarse arrastrando: con la manito activada, con Ctrl apretado o con
  // el botón central del mouse.
  const [mano, setMano] = useState(false);
  // Modo libre: el recuadro se suelta en cualquier nivel (solo cambia dónde se dibuja, no a quién reporta).
  const [libre, setLibre] = useState(false);
  const [ctrl, setCtrl] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const arrastre = useRef<{ x: number; y: number; left: number; top: number; movio: boolean; id: number } | null>(null);
  const suprimirClic = useRef(false);

  const recargar = useCallback(async () => {
    const r = await fetch(`/api/organigrama?organigrama=${org}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error || "No se pudo cargar el organigrama");
    setNodos(j.nodos || []);
  }, [org]);

  useEffect(() => {
    setCargando(true);
    setError(null);
    recargar()
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [recargar]);

  const cambiarOrganigrama = (o: Org) => {
    if (o === org) return;
    setSeleccion(null);
    setEditando(false);
    setNodos([]);
    ajustado.current = false; // el otro organigrama se vuelve a ajustar al ancho
    setOrg(o);
  };

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => setCtrl(e.ctrlKey);
    const fuera = () => setCtrl(false);
    window.addEventListener("keydown", tecla);
    window.addEventListener("keyup", tecla);
    window.addEventListener("blur", fuera);
    return () => {
      window.removeEventListener("keydown", tecla);
      window.removeEventListener("keyup", tecla);
      window.removeEventListener("blur", fuera);
    };
  }, []);

  // Ctrl + rueda: zoom del organigrama (no de la página).
  const hayOrganigrama = nodos.length > 0;
  useEffect(() => {
    const c = contenedor.current;
    if (!c) return;
    const rueda = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => limitarZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    c.addEventListener("wheel", rueda, { passive: false });
    return () => c.removeEventListener("wheel", rueda);
  }, [hayOrganigrama]);

  const alPresionar = (e: React.PointerEvent<HTMLDivElement>) => {
    const central = e.button === 1;
    if (!(central || (e.button === 0 && (mano || e.ctrlKey)))) return;
    if ((e.target as HTMLElement).closest("input, textarea, select")) return;
    const c = contenedor.current!;
    arrastre.current = { x: e.clientX, y: e.clientY, left: c.scrollLeft, top: c.scrollTop, movio: false, id: e.pointerId };
    // Sin esto el arrastre selecciona texto de los recuadros; el clic igual llega.
    e.preventDefault();
  };
  const alMover = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.movio) {
      if (Math.hypot(dx, dy) < 4) return;
      // Recién al moverse se captura el puntero: así un clic sin arrastrar
      // sigue abriendo el cargo.
      a.movio = true;
      setArrastrando(true);
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // El puntero ya se soltó: se sigue moviendo igual mientras dure.
      }
    }
    contenedor.current!.scrollLeft = a.left - dx;
    contenedor.current!.scrollTop = a.top - dy;
  };
  const alSoltar = () => {
    if (arrastre.current?.movio) {
      suprimirClic.current = true;
      setTimeout(() => (suprimirClic.current = false), 0);
    }
    arrastre.current = null;
    setArrastrando(false);
  };

  /** Zoom para que el organigrama entero quepa a lo ancho. */
  const ajustar = useCallback(() => {
    const c = contenedor.current;
    const l = lienzo.current;
    if (!c || !l) return;
    const natural = l.getBoundingClientRect().width / zoom;
    if (!natural) return;
    setZoom(Math.max(ZOOM_MIN, Math.min(1, (c.clientWidth - 8) / natural)));
  }, [zoom]);

  // El lienzo ocupa lo que queda de pantalla y se desplaza por dentro. Sin un
  // alto fijo crecía con el organigrama: el que bajaba era el panel entero y
  // la manito solo podía mover a los lados.
  const [alto, setAlto] = useState<number | null>(null);
  useLayoutEffect(() => {
    const c = contenedor.current;
    if (!c) return;
    const medir = () => {
      const arriba = c.getBoundingClientRect().top + window.scrollY;
      setAlto(Math.max(360, window.innerHeight - arriba - 24));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [hayOrganigrama, error]);

  // La primera vez que hay organigrama, se ajusta al ancho de la pantalla.
  useLayoutEffect(() => {
    if (!ajustado.current && nodos.length) {
      ajustado.current = true;
      ajustar();
    }
  }, [nodos, ajustar]);

  const crear = async (body: Record<string, unknown>, tab: "actividades" | "datos" = "datos") => {
    setCreando(true);
    setError(null);
    try {
      const r = await fetch("/api/organigrama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      await recargar();
      if (j.id) setSeleccion({ id: j.id, tab });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreando(false);
    }
  };

  /** Edición en el mismo recuadro (doble clic o lápiz). */
  const editarRapido = async (id: number, cambios: EdicionRapida) => {
    setError(null);
    try {
      const r = await fetch(`/api/organigrama/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      await recargar();
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  };

  /** Dónde quedaron los recuadros arrastrados. */
  const guardarPosiciones = async (posiciones: { id: number; x: number; y: number }[]) => {
    setError(null);
    try {
      const r = await fetch("/api/organigrama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ posiciones }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar la posición");
      await recargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  /** Borra las posiciones guardadas: el organigrama vuelve a acomodarse solo. */
  const ordenarSolo = async () => {
    if (!window.confirm("¿Acomodar todo automáticamente? Se pierde dónde moviste cada recuadro en este organigrama.")) return;
    setError(null);
    try {
      const r = await fetch("/api/organigrama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acomodar: true, organigrama: org }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "No se pudo acomodar");
      await recargar();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const nombreArchivo = (ext: string) =>
    `organigrama-${org === "actual" ? "supricom" : `${org}-supricom`}-${new Date().toISOString().slice(0, 10)}.${ext}`;

  const bajar = (href: string, nombre: string) => {
    const a = document.createElement("a");
    a.href = href;
    a.download = nombre;
    a.click();
  };

  /**
   * Foto del organigrama tal como está ahora (con los cambios guardados), a
   * tamaño real y sin los botones de edición. Se saca con zoom 100 % para que
   * salga nítido aunque en pantalla se vea reducido.
   */
  const foto = async (): Promise<string> => {
    const zoomAntes = zoom;
    setSeleccion(null);
    setZoom(1);
    await esperarPintado();
    try {
      const nodo = objetivoExportar.current!;
      const { toPng } = await import("html-to-image");
      return await toPng(nodo, {
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        width: nodo.scrollWidth,
        height: nodo.scrollHeight,
        filter: (el) => !(el instanceof HTMLElement && el.dataset?.exportar === "no"),
      });
    } finally {
      setZoom(zoomAntes);
    }
  };

  const exportar = async (formato: "png" | "pdf") => {
    setExportando(formato);
    setError(null);
    try {
      const png = await foto();
      if (formato === "png") {
        bajar(png, nombreArchivo("png"));
        return;
      }
      // PDF: se imprime la imagen en una página horizontal desde un iframe
      // oculto; el navegador ofrece "Guardar como PDF".
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      document.body.appendChild(iframe);
      const doc = iframe.contentDocument!;
      doc.open();
      doc.write(
        `<!doctype html><html><head><title>${nombreArchivo("pdf").replace(".pdf", "")}</title>` +
          `<style>@page{size:landscape;margin:8mm}html,body{margin:0}img{display:block;max-width:100%;max-height:100vh;margin:auto}</style>` +
          `</head><body><img src="${png}"></body></html>`,
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
      setExportando(null);
    }
  };

  /** Todas las actividades en un CSV (abre en Excel), en el orden del organigrama. */
  const exportarActividades = () => {
    const mapa = hijosPorPadre(nodos);
    const filas: string[][] = [["Área", "Cargo", "Reporta a", "Personas", "Propósito", "N.º", "Actividad", "Detalle"]];
    const recorrer = (padre: number | null) => {
      for (const n of mapa.get(padre) || []) {
        const sup = cadenaDeMando(nodos, n.id).at(-2)?.cargo || "";
        const base = [n.area, n.cargo, sup, n.personas.join(", "), n.proposito];
        if (!n.actividades.length) filas.push([...base, "", "", ""]);
        n.actividades.forEach((a, i) =>
          filas.push([...base, String(i + 1), a.texto, a.detalle]),
        );
        recorrer(n.id);
      }
    };
    recorrer(null);
    const csv = filas.map((f) => f.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    bajar(url, `organigrama-${org}-actividades-${new Date().toISOString().slice(0, 10)}.csv`);
    URL.revokeObjectURL(url);
  };

  const nodoSeleccionado = seleccion ? nodos.find((n) => n.id === seleccion.id) || null : null;
  const conActividades = nodos.filter((n) => n.actividades.length).length;
  const boton =
    "flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300";

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#1e3a5f]">
            <Network className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
              Organigrama
              <button
                type="button"
                onClick={recorrido.abrir}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-blue-50 hover:text-blue-700"
              >
                <CircleHelp className="h-4 w-4" /> ¿Cómo funciona?
              </button>
            </h1>
            <p className="text-sm text-slate-500">
              {editando
                ? "Editando · Arrastra los recuadros dentro de su nivel (Mayús: con sus subordinados) · Doble clic: editar nombre y personas"
                : "Solo lectura · Clic: ver las actividades del cargo"}
              {nodos.length > 0 && (
                <span className="text-slate-400">
                  {" "}
                  · {conActividades} de {nodos.length} cargos con actividades
                </span>
              )}
            </p>
          </div>
        </div>
        {nodos.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <div data-tour="org-buscar" className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar cargo o persona…"
                className="w-56 rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 text-sm"
              />
            </div>
            <div data-tour="org-vista" className="flex items-center gap-2">
            <button
              onClick={() => setMano((m) => !m)}
              aria-pressed={mano}
              title="Manito: arrastra para moverte por el organigrama (también Ctrl + arrastrar, o el botón central del mouse)"
              className={cn(
                "rounded-xl border p-2",
                mano ? "border-blue-500 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:text-slate-900",
              )}
            >
              <Hand className="h-4 w-4" />
            </button>
            <div className="flex items-center rounded-xl border border-slate-200 bg-white">
              <button onClick={() => setZoom((z) => limitarZoom(z - 0.1))} className="p-2 text-slate-600 hover:text-slate-900" title="Alejar (Ctrl + rueda)">
                <Minus className="h-4 w-4" />
              </button>
              <button onClick={() => setZoom(1)} className="w-12 text-center text-xs font-semibold text-slate-600" title="Tamaño real">
                {Math.round(zoom * 100)}%
              </button>
              <button onClick={() => setZoom((z) => limitarZoom(z + 0.1))} className="p-2 text-slate-600 hover:text-slate-900" title="Acercar (Ctrl + rueda)">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={ajustar} className="border-l border-slate-200 p-2 text-slate-600 hover:text-slate-900" title="Ajustar al ancho">
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={boton} disabled={!!exportando} data-tour="org-descargar">
                  {exportando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Descargar
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs font-normal text-slate-500">
                  Sale tal como está ahora, con los últimos cambios
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => exportar("png")}>
                  <FileImage className="h-4 w-4" /> Organigrama en imagen (PNG)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => exportar("pdf")}>
                  <FileText className="h-4 w-4" /> Organigrama en PDF
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={exportarActividades}>
                  <FileSpreadsheet className="h-4 w-4" /> Actividades (Excel / CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {editando && (
              <button
                onClick={() => setLibre((v) => !v)}
                aria-pressed={libre}
                className={cn(boton, libre && "border-blue-500 bg-blue-50 text-blue-700")}
                title="Modo libre: arrastra un recuadro a cualquier nivel. Solo cambia dónde se dibuja; a quién reporta se cambia en el panel del cargo."
              >
                <Move className="h-4 w-4" /> Modo libre {libre ? "activado" : ""}
              </button>
            )}
            {editando && (
              <button
                onClick={ordenarSolo}
                data-tour="org-ordenar"
                className={boton}
                title="Vuelve a acomodar todos los recuadros solos (se pierde dónde los moviste)"
              >
                <LayoutGrid className="h-4 w-4" /> Ordenar automáticamente
              </button>
            )}
            {editando && (
              <button
                onClick={() =>
                  crear({ parentId: null, cargo: "Nuevo cargo", tipo: "direccion", disposicion: "fila", organigrama: org })
                }
                disabled={creando}
                className={boton}
                title="Un cargo que no reporta a nadie (ej. Junta Directiva). Para ponerlo encima de la cabeza, en el panel de esta usa «Agregar superior»."
              >
                <Plus className="h-4 w-4" /> Cargo sin superior
              </button>
            )}
            <button
              onClick={() => setEditando((e) => !e)}
              data-tour="org-editar"
              aria-pressed={editando}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold",
                editando ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-blue-600 text-white hover:bg-blue-700",
              )}
              title={editando ? "Volver a solo lectura" : "Habilitar la edición de este organigrama"}
            >
              {editando ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
              {editando ? "Terminar edición" : "Editar"}
            </button>
          </div>
        )}
      </div>

      <div data-tour="org-pestanas" className="flex gap-1 rounded-2xl bg-slate-100 p-1 w-fit" role="tablist" aria-label="Organigramas">
        {(Object.keys(ORGANIGRAMAS) as Org[]).map((o) => (
          <button
            key={o}
            role="tab"
            aria-selected={org === o}
            onClick={() => cambiarOrganigrama(o)}
            className={cn(
              "rounded-xl px-4 py-1.5 text-sm font-semibold transition",
              org === o ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {ORGANIGRAMAS[o]}
          </button>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cargando && <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-slate-400" />}

      {!cargando && !error && nodos.length === 0 && (
        <div className="mx-auto mt-6 max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-bold text-slate-800">El {ORGANIGRAMAS[org].toLowerCase()} está vacío</h2>
          <p className="mt-1 text-sm text-slate-500">
            {org === "actual"
              ? "Puedes cargar el organigrama actual de SUPRICOM (octubre 2026) y ajustarlo, o empezar desde cero."
              : "Puedes cargar el organigrama propuesto (estructura hacia el futuro) y ajustarlo, o empezar desde cero."}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => crear({ inicial: true, organigrama: org })}
              disabled={creando}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {creando && <Loader2 className="h-4 w-4 animate-spin" />}
              Cargar {ORGANIGRAMAS[org].toLowerCase()}
            </button>
            <button
              onClick={() =>
                crear({ parentId: null, area: "Gerencia General", cargo: "Gerente General", tipo: "direccion", disposicion: "fila", organigrama: org })
              }
              disabled={creando}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50"
            >
              Empezar en blanco
            </button>
          </div>
        </div>
      )}

      {nodos.length > 0 && (
        <div
          ref={contenedor}
          data-tour="org-lienzo"
          onPointerDown={alPresionar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onClickCapture={(e) => {
            if (suprimirClic.current) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          onAuxClick={(e) => e.button === 1 && e.preventDefault()}
          style={{ height: alto ?? "70vh" }}
          className={cn(
            "overflow-auto overscroll-contain rounded-2xl border border-slate-200 bg-slate-50/70",
            arrastrando ? s.arrastrando : (mano || ctrl) && s.modoMano,
          )}
        >
          <div ref={lienzo} style={{ zoom }} className="w-max min-w-full">
            <div ref={objetivoExportar} className="w-max min-w-full bg-transparent">
              {exportando && (
                <div className="flex items-baseline justify-between px-8 pt-6">
                  <p className="text-xl font-black text-[#1e3a5f]">{org === "actual" ? "Organigrama SUPRICOM" : `${ORGANIGRAMAS[org]} SUPRICOM`}</p>
                  <p className="text-xs text-slate-500">{new Date().toLocaleDateString("es-VE", { dateStyle: "long" })}</p>
                </div>
              )}
              <Organigrama
                nodos={nodos}
                seleccionado={exportando ? null : (seleccion?.id ?? null)}
                busqueda={exportando ? "" : busqueda}
                onSeleccionar={(id) => setSeleccion({ id })}
                onAgregarSubordinado={(padre) => crear({ parentId: padre, cargo: "Nuevo cargo" })}
                onEditar={editarRapido}
                soloLectura={!editando}
                arrastrable={editando && !mano && !exportando}
                libre={libre}
                zoom={zoom}
                onMover={guardarPosiciones}
              />
            </div>
          </div>
        </div>
      )}

      <PanelCargo
        nodo={nodoSeleccionado}
        nodos={nodos}
        tabInicial={seleccion?.tab}
        onCerrar={() => setSeleccion(null)}
        onSeleccionar={(id, tab) => setSeleccion({ id, tab })}
        onRecargar={recargar}
        soloLectura={!editando}
      />

      <RecorridoGuiado
        pasos={pasosTour}
        abierto={recorrido.abierto}
        onCerrar={(nuncaMas) => {
          recorrido.cerrar(nuncaMas);
          setEditando(false);
        }}
      />
    </div>
  );
}
