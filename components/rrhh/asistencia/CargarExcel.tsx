"use client";

import { Button } from "@/components/ui/button";
import {
  adivinarMapeo,
  detectarOrden,
  extraerMarcas,
  leerArchivo,
  type Hoja,
  type Mapeo,
  type OrdenFecha,
} from "@/lib/asistencia/excel";
import { SEDES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { CheckCircle2, FileSpreadsheet, Loader2, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { fechaCorta } from "../seleccion/comunes";

type Carga = {
  id: number;
  sede: number;
  archivo: string;
  marcas: number;
  nuevas: number;
  desde: string | null;
  hasta: string | null;
  usuario: string | null;
  created_at: string | null;
};

const selCls = "rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-700";

export function CargarExcel({ sede, onCargado }: { sede: number; onCargado: () => void }) {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [hojas, setHojas] = useState<Hoja[]>([]);
  const [hojaIdx, setHojaIdx] = useState(0);
  const [mapeo, setMapeo] = useState<Mapeo | null>(null);
  const [orden, setOrden] = useState<OrdenFecha>("dmy");
  const [leyendo, setLeyendo] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [cargas, setCargas] = useState<Carga[]>([]);

  const cargarHistorial = () =>
    fetch("/api/rrhh/asistencia/cargas")
      .then((r) => r.json())
      .then((j) => setCargas(j.cargas || []))
      .catch(() => {});

  useEffect(() => {
    cargarHistorial();
  }, []);

  const hoja = hojas[hojaIdx];

  const elegirHoja = (h: Hoja | undefined) => {
    if (!h) return;
    const m = adivinarMapeo(h.encabezados);
    setMapeo(m);
    setOrden(detectarOrden(h, m));
  };

  const abrir = async (f: File | undefined) => {
    if (!f) return;
    setArchivo(f);
    setError(null);
    setResultado(null);
    setLeyendo(true);
    try {
      const hs = await leerArchivo(f);
      if (!hs.length) throw new Error("El archivo no tiene datos.");
      setHojas(hs);
      setHojaIdx(0);
      elegirHoja(hs[0]);
    } catch (e: any) {
      setHojas([]);
      setMapeo(null);
      setError(e?.message || "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  };

  const listo = mapeo && mapeo.codigo >= 0 && mapeo.horas.length > 0;
  const lectura = useMemo(() => (hoja && listo ? extraerMarcas(hoja, mapeo!, orden) : null), [hoja, mapeo, orden, listo]);
  const zk = hoja?.zkteco;
  const resumen = useMemo(() => {
    if (!lectura) return null;
    const conMarcas = new Set(lectura.marcas.map((m) => m.codigo));
    if (zk) {
      const sinMarcas = zk.empleados.filter((e) => !conMarcas.has(e.codigo)).length;
      return { empleados: zk.empleados.length, sinMarcas, desde: zk.desde, hasta: zk.hasta };
    }
    if (!lectura.marcas.length) return null;
    const fechas = lectura.marcas.map((m) => m.fecha).sort();
    return { empleados: conMarcas.size, sinMarcas: 0, desde: fechas[0], hasta: fechas[fechas.length - 1] };
  }, [lectura, zk]);

  const subir = async () => {
    if (!lectura || !resumen || !archivo) return;
    setSubiendo(true);
    setError(null);
    try {
      const r = await fetch("/api/rrhh/asistencia/cargas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sede,
          archivo: archivo.name,
          marcas: lectura.marcas,
          ...(zk && { periodo: { desde: zk.desde, hasta: zk.hasta }, empleados: zk.empleados }),
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar");
      setResultado(
        `Listo: ${j.nuevas} marcas nuevas de ${j.empleados} empleados${j.repetidas ? ` (${j.repetidas} ya estaban cargadas)` : ""}.`,
      );
      setArchivo(null);
      setHojas([]);
      setMapeo(null);
      cargarHistorial();
      onCargado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubiendo(false);
    }
  };

  const deshacer = async (c: Carga) => {
    if (!confirm(`¿Deshacer la carga de «${c.archivo}»? Se borran las ${c.nuevas} marcas que entraron con ella.`)) return;
    const r = await fetch(`/api/rrhh/asistencia/cargas?id=${c.id}`, { method: "DELETE" });
    if (!r.ok) setError("No se pudo deshacer la carga.");
    cargarHistorial();
    onCargado();
  };

  const columna = (clave: "codigo" | "nombre" | "fecha", etiqueta: string, opcional: boolean) => (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{etiqueta}</span>
      <select
        className={`${selCls} w-full`}
        value={mapeo?.[clave] ?? -1}
        onChange={(e) => setMapeo((m) => (m ? { ...m, [clave]: Number(e.target.value) } : m))}
      >
        <option value={-1}>{opcional ? "— No tiene —" : "— Elegir —"}</option>
        {hoja?.encabezados.map((h, i) => (
          <option key={i} value={i}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Subir el Excel del biométrico de {SEDES_ASISTENCIA[sede]}</h3>
        <p className="mt-1 text-xs text-slate-500">
          Sirve el registro de marcas tal como lo exporta el equipo (Excel o CSV). Se puede subir el mismo período otra vez: las marcas
          repetidas no se duplican.
        </p>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm text-slate-600 hover:border-blue-400 hover:bg-blue-50/40">
          {leyendo ? <Loader2 className="h-6 w-6 animate-spin text-slate-400" /> : <FileSpreadsheet className="h-6 w-6 text-slate-400" />}
          <span className="font-semibold">{archivo ? archivo.name : "Elegir archivo (.xlsx, .xls, .csv)"}</span>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              abrir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {hoja && mapeo && (
          <div className="mt-5 space-y-4">
            {zk && (
              <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">
                Reporte del biométrico ZKTeco: se toma la hoja «{hoja.nombre}» con las marcas de cada empleado; las demás hojas del archivo
                (resumen, anormal, detalle) no hacen falta. Los días del período en que alguien no marcó cuentan como ausencia.
              </p>
            )}

            {!zk && hojas.length > 1 && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Hoja
                <select
                  className={selCls}
                  value={hojaIdx}
                  onChange={(e) => {
                    setHojaIdx(Number(e.target.value));
                    elegirHoja(hojas[Number(e.target.value)]);
                  }}
                >
                  {hojas.map((h, i) => (
                    <option key={i} value={i}>
                      {h.nombre}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {!zk && (
              <>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {columna("codigo", "Código del empleado", false)}
                  {columna("nombre", "Nombre", true)}
                  {columna("fecha", "Fecha (si va aparte de la hora)", true)}
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-600">Orden de la fecha</span>
                    <select className={`${selCls} w-full`} value={orden} onChange={(e) => setOrden(e.target.value as OrdenFecha)}>
                      <option value="dmy">Día/mes/año</option>
                      <option value="mdy">Mes/día/año</option>
                    </select>
                  </label>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-600">Columnas con la hora de las marcas (o fecha y hora juntas)</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {hoja.encabezados.map((h, i) => {
                      const marcado = mapeo.horas.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() =>
                            setMapeo((m) => (m ? { ...m, horas: marcado ? m.horas.filter((x) => x !== i) : [...m.horas, i].sort((a, b) => a - b) } : m))
                          }
                          className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                            marcado ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                          }`}
                        >
                          {marcado ? "✓ " : ""}
                          {h}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    {hoja.encabezados.map((h, i) => (
                      <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-semibold text-slate-600">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hoja.filas.slice(0, 5).map((f, r) => (
                    <tr key={r}>
                      {hoja.encabezados.map((_, i) => (
                        <td key={i} className="whitespace-nowrap border-t border-slate-100 px-2 py-1 text-slate-600">
                          {f[i] == null ? "" : String(f[i])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {!listo ? (
              <p className="text-sm text-amber-700">Elige la columna del código y al menos una columna con la hora.</p>
            ) : resumen ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <span>
                  <b>{lectura!.marcas.length}</b> marcas de <b>{resumen.empleados}</b> empleados, del {fechaCorta(resumen.desde)} al{" "}
                  {fechaCorta(resumen.hasta)}
                  {resumen.sinMarcas > 0 && (
                    <span className="text-slate-500">
                      {" "}
                      · {resumen.sinMarcas} {resumen.sinMarcas === 1 ? "no marcó" : "no marcaron"} en todo el período
                    </span>
                  )}
                  {lectura!.omitidas > 0 && <span className="text-slate-500"> · {lectura!.omitidas} filas sin código o sin hora no se toman</span>}
                </span>
                <Button onClick={subir} disabled={subiendo}>
                  {subiendo ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />}
                  Cargar en {SEDES_ASISTENCIA[sede]}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-amber-700">Con estas columnas no salió ninguna marca: revisa la fecha y la hora.</p>
            )}
          </div>
        )}

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {resultado && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {resultado}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h3 className="p-4 pb-2 text-sm font-bold text-slate-800">Cargas anteriores</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Fecha", "Sede", "Archivo", "Período", "Marcas nuevas", "Subió", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!cargas.length && (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                    Todavía no se ha cargado ningún archivo.
                  </td>
                </tr>
              )}
              {cargas.map((c) => (
                <tr key={c.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {c.created_at ? new Date(c.created_at).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : ""}
                  </td>
                  <td className="px-3 py-2">{SEDES_ASISTENCIA[c.sede]}</td>
                  <td className="max-w-[220px] truncate px-3 py-2" title={c.archivo}>
                    {c.archivo}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                    {fechaCorta(c.desde)} – {fechaCorta(c.hasta)}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {c.nuevas} <span className="text-xs text-slate-400">de {c.marcas}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{c.usuario}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => deshacer(c)} className="text-slate-400 hover:text-red-600" title="Deshacer esta carga">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
