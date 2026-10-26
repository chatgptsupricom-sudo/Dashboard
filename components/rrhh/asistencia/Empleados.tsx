"use client";

import { type Empleado } from "@/lib/asistencia/tipos";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { fechaCorta } from "../seleccion/comunes";

/**
 * Los empleados salen solos de los Excel cargados (código del biométrico).
 * Aquí se corrige el nombre y se marca quién ya no trabaja: a un inactivo no
 * se le cuentan ausencias después de su última marca.
 */
export function Empleados({ sede, onCambio }: { sede: number; onCambio: () => void }) {
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    fetch(`/api/rrhh/asistencia/empleados?sede=${sede}`)
      .then((r) => r.json())
      .then((j) => setEmpleados(j.empleados || []))
      .finally(() => setCargando(false));
  }, [sede]);

  const guardar = async (e: Empleado, cambios: Partial<Empleado>) => {
    setEmpleados((xs) => xs.map((x) => (x.codigo === e.codigo ? { ...x, ...cambios } : x)));
    const r = await fetch("/api/rrhh/asistencia/empleados", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sede, codigo: e.codigo, ...cambios }),
    });
    if (!r.ok) {
      setEmpleados((xs) => xs.map((x) => (x.codigo === e.codigo ? e : x)));
      setError(`No se pudo guardar a ${e.nombre || e.codigo}.`);
      return;
    }
    onCambio();
  };

  const q = busqueda.trim().toLowerCase();
  const lista = empleados.filter((e) => !q || `${e.codigo} ${e.nombre}`.toLowerCase().includes(q));

  return (
    <div className="space-y-3">
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar empleado o código…"
        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-72"
      />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Código", "Nombre", "Primera marca", "Última marca", "Activo"].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="py-6">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            )}
            {!cargando && !lista.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Sin empleados: aparecen al cargar el Excel del biométrico.
                </td>
              </tr>
            )}
            {lista.map((e) => (
              <tr key={e.codigo} className="border-t border-slate-100">
                <td className="px-3 py-2 font-mono text-xs">{e.codigo}</td>
                <td className="px-3 py-1.5">
                  <input
                    defaultValue={e.nombre}
                    onBlur={(ev) => ev.target.value.trim() !== e.nombre && guardar(e, { nombre: ev.target.value.trim() })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-slate-200 focus:border-blue-300 focus:outline-none"
                  />
                </td>
                <td className="px-3 py-2 tabular-nums">{fechaCorta(e.primera_fecha)}</td>
                <td className="px-3 py-2 tabular-nums">{fechaCorta(e.ultima_fecha)}</td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={e.activo} onChange={(ev) => guardar(e, { activo: ev.target.checked })} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
