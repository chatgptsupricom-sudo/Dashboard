"use client";

import { AlertTriangle, Loader2, MapPin, Pencil, Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";

// Quién recibe los leads de cada estado (/api/adminleads/rotacion-estados).
// Cada cambio queda en la Auditoría del SuperAdmin (audit_logs, ROTACION_ESTADO).

type VendedorFila = {
  fila: number;
  seller_id: number;
  nombre: string;
  existe: boolean;
  activo: boolean;
  asignacion: number | null;
};
type Estado = { estado: string; tabla: string; vendedores: VendedorFila[] };
type Vendedor = { id: number; nombre: string; cids: number };
const NOMBRES: Record<string, string> = {
  anzoategui: "Anzoátegui",
  bolivar: "Bolívar",
  falcon: "Falcón",
  guarico: "Guárico",
  merida: "Mérida",
  tachira: "Táchira",
};
const nombreEstado = (e: string) => NOMBRES[e] ?? e.replace(/\b\w/g, (c) => c.toUpperCase());
const SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas" };

export default function RotacionEstados() {
  const [estados, setEstados] = useState<Estado[] | null>(null);
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [filtro, setFiltro] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState("");

  const cargar = () =>
    fetch("/api/adminleads/rotacion-estados")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error);
        setEstados(j.estados || []);
        setVendedores(j.vendedores || []);
      })
      .catch((e) => setError(e?.message || "No se pudo cargar la rotación por estados."));

  useEffect(() => {
    cargar();
  }, []);

  const enviar = async (clave: string, method: string, body: object) => {
    setOcupado(clave);
    setError("");
    try {
      const r = await fetch("/api/adminleads/rotacion-estados", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar. Reintenta.");
      setEditando(null);
      await cargar();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setOcupado(null);
    }
  };

  const q = filtro.trim().toLowerCase();
  const visibles = (estados || []).filter(
    (e) =>
      !q ||
      nombreEstado(e.estado).toLowerCase().includes(q) ||
      e.estado.includes(q) ||
      e.vendedores.some((v) => v.nombre.toLowerCase().includes(q)),
  );
  const grupos = [
    { titulo: "Caracas y Carabobo", nota: "Rotación propia: pesa también la efectividad de cierre", carcar: true },
    { titulo: "Resto del país", nota: "", carcar: false },
  ];
  // La rotación salta a los vendedores inactivos o borrados; si no queda
  // ninguno activo, el lead entra sin vendedor. Un contador vacío (NULL) va
  // siempre primero y no sube: ese vendedor se lleva todos los leads.
  const sinActivo = (e: Estado) => !e.vendedores.some((v) => v.existe && v.activo);
  const acapara = (v: VendedorFila) => v.existe && v.activo && v.asignacion == null;
  const problemas = (estados || []).filter((e) => sinActivo(e) || e.vendedores.some(acapara)).length;

  const opciones = (excluir: number[]) =>
    vendedores
      .filter((v) => !excluir.includes(v.id))
      .map((v) => (
        <option key={v.id} value={v.id}>
          {v.nombre} · {SEDE[v.cids] ?? ""}
        </option>
      ));

  return (
    <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-zinc-50 flex flex-wrap items-center gap-3">
        <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center">
          <MapPin className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-zinc-800">Estados por vendedor</h2>
          <p className="text-xs text-zinc-400">
            Quién recibe los leads nuevos de cada estado. Si hay varios, se turnan.
          </p>
        </div>
        {problemas > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
            <AlertTriangle className="w-3.5 h-3.5" /> {problemas} {problemas === 1 ? "estado para revisar" : "estados para revisar"}
          </span>
        )}
      </div>

      <div className="px-6 pt-4">
        <label className="relative block">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-300" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Buscar estado o vendedor (ej. Danyely)"
            className="w-full h-10 pl-9 pr-3 rounded-xl border border-zinc-200 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-300"
          />
        </label>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      {!estados ? (
        <p className="text-sm text-zinc-300 text-center py-8">{error ? "" : "Cargando rotación..."}</p>
      ) : (
        grupos.map((g) => {
          const lista = visibles.filter((e) => (e.tabla === "rotacion_caracas_y_carabobo") === g.carcar);
          if (!lista.length) return null;
          return (
            <div key={g.titulo} className="pb-2">
              <p className="px-6 pt-5 pb-1 text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                {g.titulo}
                {g.nota && <span className="ml-2 normal-case tracking-normal font-medium">· {g.nota}</span>}
              </p>
              <div className="divide-y divide-zinc-50">
                {lista.map((e) => (
                  <div key={e.estado} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-6 py-3">
                    <p className="sm:w-36 shrink-0 text-sm font-semibold text-zinc-800">{nombreEstado(e.estado)}</p>
                    <div className="flex flex-wrap items-center gap-1.5 flex-1">
                      {sinActivo(e) && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                          <AlertTriangle className="w-3.5 h-3.5" /> Sin vendedor activo: sus leads entran sin vendedor
                        </span>
                      )}
                      {e.vendedores.map((v) =>
                        editando === v.fila ? (
                          <select
                            key={v.fila}
                            autoFocus
                            defaultValue=""
                            disabled={ocupado === `f${v.fila}`}
                            onBlur={() => setEditando(null)}
                            onChange={(ev) =>
                              ev.target.value && enviar(`f${v.fila}`, "PATCH", { fila: v.fila, seller_id: Number(ev.target.value) })
                            }
                            className="h-8 rounded-full border border-emerald-300 bg-white px-3 text-xs outline-none"
                          >
                            <option value="" disabled>
                              Poner en lugar de {v.nombre}…
                            </option>
                            {opciones(e.vendedores.map((x) => x.seller_id))}
                          </select>
                        ) : (
                          <span
                            key={v.fila}
                            className={`group inline-flex items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border text-xs font-medium ${
                              acapara(v)
                                ? "border-red-200 bg-red-50 text-red-800"
                                : !v.existe || !v.activo
                                  ? "border-zinc-200 bg-white text-zinc-400 line-through decoration-zinc-300"
                                  : "border-zinc-200 bg-zinc-50 text-zinc-700"
                            }`}
                            title={
                              acapara(v)
                                ? "Contador vacío: este vendedor se lleva todos los leads del estado. Usa Cambiar para corregirlo."
                                : !v.existe || !v.activo
                                  ? "La rotación lo salta: no recibe leads"
                                  : `${v.asignacion} leads asignados por esta rotación`
                            }
                          >
                            {!v.existe ? `${v.nombre} · ya no existe` : v.activo ? v.nombre : `${v.nombre} · inactivo`}
                            <span className={acapara(v) ? "font-semibold" : "text-zinc-400 no-underline"}>
                              {acapara(v) ? "se lleva todos" : (v.asignacion ?? 0)}
                            </span>
                            {ocupado === `f${v.fila}` ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin mx-1" />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditando(v.fila)}
                                  title="Cambiar por otro vendedor"
                                  aria-label={`Cambiar a ${v.nombre} en ${nombreEstado(e.estado)}`}
                                  className="h-6 w-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-zinc-700 hover:bg-white"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    confirm(`¿Quitar a ${v.nombre} de ${nombreEstado(e.estado)}? Dejará de recibir sus leads.`) &&
                                    enviar(`f${v.fila}`, "DELETE", { fila: v.fila })
                                  }
                                  title="Quitar de este estado"
                                  aria-label={`Quitar a ${v.nombre} de ${nombreEstado(e.estado)}`}
                                  className="h-6 w-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-red-600 hover:bg-white"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </span>
                        ),
                      )}
                      <label className="relative inline-flex items-center">
                        {ocupado === `e${e.estado}` ? (
                          <Loader2 className="w-4 h-4 animate-spin text-emerald-600 mx-2" />
                        ) : (
                          <Plus className="w-3.5 h-3.5 absolute left-2.5 text-emerald-600 pointer-events-none" />
                        )}
                        <select
                          value=""
                          disabled={ocupado === `e${e.estado}`}
                          onChange={(ev) =>
                            ev.target.value && enviar(`e${e.estado}`, "POST", { estado: e.estado, seller_id: Number(ev.target.value) })
                          }
                          aria-label={`Agregar vendedor a ${nombreEstado(e.estado)}`}
                          className="h-8 rounded-full border border-dashed border-emerald-300 bg-white pl-7 pr-3 text-xs font-medium text-emerald-700 outline-none cursor-pointer appearance-none"
                        >
                          <option value="">Agregar</option>
                          {opciones(e.vendedores.map((x) => x.seller_id))}
                        </select>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
