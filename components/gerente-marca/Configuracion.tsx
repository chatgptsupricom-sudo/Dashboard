"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, Plus, Settings2, X } from "lucide-react";
import { LINEAS, type Asignacion, type Linea } from "@/lib/gerente-marca/tipos";
import { Aviso, Encabezado } from "./comunes";

/**
 * Configuración de Gerencia de Marca (solo SuperAdmin): qué marcas de Odoo
 * lleva cada usuario con el rol Gerente de Marca, enteras o solo su línea de
 * Cómputo Corporativo. API: /api/gerente-marca/asignaciones.
 */

interface Gerente {
  email: string;
  nombre: string;
  asignaciones: Asignacion[];
}

function TarjetaGerente({ g, marcas, onGuardado }: { g: Gerente; marcas: { id: number; nombre: string }[]; onGuardado: (a: Asignacion[]) => void }) {
  const [lista, setLista] = useState<Asignacion[]>(g.asignaciones);
  const [nueva, setNueva] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  useEffect(() => setLista(g.asignaciones), [g.asignaciones]);

  const cambiado = JSON.stringify(lista.map((a) => [a.marcaId, a.linea]).sort()) !== JSON.stringify(g.asignaciones.map((a) => [a.marcaId, a.linea]).sort());
  const disponibles = marcas.filter((m) => !lista.some((a) => a.marcaId === m.id));

  const agregar = () => {
    const m = marcas.find((x) => String(x.id) === nueva);
    if (!m) return;
    setLista([...lista, { marcaId: m.id, marca: m.nombre, linea: "todo" }]);
    setNueva("");
  };

  const guardar = async () => {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await fetch("/api/gerente-marca/asignaciones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: g.email, asignaciones: lista.map((a) => ({ marcaId: a.marcaId, linea: a.linea })) }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.success) throw new Error(j?.error || "No se pudo guardar");
      onGuardado(j.asignaciones);
      setMensaje({ ok: true, texto: "Guardado" });
    } catch (e: any) {
      setMensaje({ ok: false, texto: e?.message || "No se pudo guardar" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-bold text-slate-900">{g.nombre}</p>
          <p className="text-xs text-slate-500">{g.email}</p>
        </div>
        <div className="flex items-center gap-2">
          {mensaje && <span className={`text-xs font-semibold ${mensaje.ok ? "text-emerald-600" : "text-red-600"}`}>{mensaje.texto}</span>}
          <button
            onClick={guardar}
            disabled={!cambiado || guardando}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-900 text-white text-xs font-bold disabled:opacity-30"
          >
            {guardando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Guardar
          </button>
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-slate-400">Sin marcas asignadas: entra pero no ve nada.</p>
      ) : (
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl">
          {lista.map((a) => (
            <div key={a.marcaId} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <span className="font-semibold text-slate-800 min-w-[120px]">{a.marca}</span>
              <div className="flex rounded-lg border border-slate-200 p-0.5 text-xs" role="group" aria-label={`Línea de ${a.marca}`}>
                {(Object.keys(LINEAS) as Linea[]).map((l) => (
                  <button
                    key={l}
                    onClick={() => setLista(lista.map((x) => (x.marcaId === a.marcaId ? { ...x, linea: l } : x)))}
                    className={`px-2.5 py-1 rounded-md font-semibold ${a.linea === l ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                  >
                    {LINEAS[l]}
                  </button>
                ))}
              </div>
              <button onClick={() => setLista(lista.filter((x) => x.marcaId !== a.marcaId))} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Quitar ${a.marca}`}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <select value={nueva} onChange={(e) => setNueva(e.target.value)} aria-label="Marca para agregar" className="h-9 flex-1 max-w-xs rounded-lg border border-slate-200 px-2 text-sm bg-white">
          <option value="">Agregar marca de Odoo…</option>
          {disponibles.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <button onClick={agregar} disabled={!nueva} className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40">
          <Plus size={14} /> Agregar
        </button>
      </div>
    </div>
  );
}

export function Configuracion() {
  const [gerentes, setGerentes] = useState<Gerente[] | null>(null);
  const [marcas, setMarcas] = useState<{ id: number; nombre: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    setError(null);
    fetch("/api/gerente-marca/asignaciones?marcas=1")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.success) throw new Error(j?.error || "No se pudo cargar");
        setGerentes(j.gerentes);
        setMarcas(j.marcas ?? []);
      })
      .catch((e) => setError(e?.message || "No se pudo cargar"));
  }, [vuelta]);

  const ordenadas = useMemo(() => [...marcas].sort((a, b) => a.nombre.localeCompare(b.nombre)), [marcas]);

  return (
    <div className="space-y-6">
      <Encabezado icono={Settings2} titulo="Gerencia de Marca · Configuración" subtitulo="Qué marcas lleva cada gerente. Cada uno ve solo las suyas, en Valencia y Caracas." />

      <div className="bg-blue-50 border border-blue-100 text-blue-900 rounded-xl px-4 py-3 text-xs leading-relaxed">
        Aquí salen los usuarios con el rol <b>Gerente de Marca</b> (se asigna en SuperAdmin › Usuarios).
        <b> {LINEAS.computo}</b> = todo lo de la marca menos impresoras, consumibles y papelería (PCs, laptops, monitores y accesorios).
      </div>

      {error && <Aviso error={error} onReintentar={() => setVuelta((v) => v + 1)} />}

      {!gerentes && !error ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Cargando…</p>
      ) : gerentes && gerentes.length === 0 ? (
        <p className="text-sm text-slate-500">Todavía nadie tiene el rol Gerente de Marca.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {gerentes?.map((g) => (
            <TarjetaGerente
              key={g.email}
              g={g}
              marcas={ordenadas}
              onGuardado={(a) => setGerentes((lista) => lista?.map((x) => (x.email === g.email ? { ...x, asignaciones: a } : x)) ?? null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
