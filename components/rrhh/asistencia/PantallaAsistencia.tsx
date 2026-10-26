"use client";

import { SEDES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { Fingerprint } from "lucide-react";
import { useState } from "react";
import { Calendario } from "./Calendario";
import { CargarExcel } from "./CargarExcel";
import { Empleados } from "./Empleados";
import { Reporte } from "./Reporte";

type Vista = "reporte" | "cargar" | "calendario" | "empleados";

const VISTAS: [Vista, string][] = [
  ["reporte", "Reporte"],
  ["cargar", "Cargar Excel"],
  ["calendario", "Sábados de inventario y feriados"],
  ["empleados", "Empleados"],
];

/** Asistencia por biométrico (lib/asistencia/). */
export default function PantallaAsistencia() {
  const [vista, setVista] = useState<Vista>("reporte");
  const [sede, setSede] = useState(9);
  // Cambia cuando se carga o se toca el calendario: el reporte se vuelve a montar con lo nuevo.
  const [version, setVersion] = useState(0);
  const refrescar = () => setVersion((v) => v + 1);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <Fingerprint className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Asistencia</h1>
            <p className="text-sm text-slate-500">Retardos y ausencias a partir del biométrico</p>
          </div>
        </div>
        <select
          value={sede}
          onChange={(e) => setSede(Number(e.target.value))}
          aria-label="Sede"
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
        >
          {Object.entries(SEDES_ASISTENCIA).map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {VISTAS.map(([v, t]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2 text-sm ${
              vista === v ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {vista === "reporte" && <Reporte key={`${sede}-${version}`} sede={sede} />}
      {vista === "cargar" && <CargarExcel sede={sede} onCargado={refrescar} />}
      {vista === "calendario" && <Calendario sede={sede} onCambio={refrescar} />}
      {vista === "empleados" && <Empleados sede={sede} onCambio={refrescar} />}
    </div>
  );
}
