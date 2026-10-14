"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DESCRIPCION_PASO, ETIQUETA_PASO, NOMBRE_SEDE, PASOS, tieneFlujo, type PasoNC } from "@/lib/notas-credito/tipos";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type Datos = { aprobadores: Record<number, Record<PasoNC, string[]>>; usuarios: Record<string, string> };

/** SuperAdmin: quién preaprueba, aprueba y hace la nota en cada sede (por correo, el login del panel). */
export function Responsables() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [borrador, setBorrador] = useState<Record<number, Record<PasoNC, string>>>({});
  const [guardando, setGuardando] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<Record<number, string>>({});

  const cargar = async () => {
    const r = await fetch("/api/notas-credito/aprobadores");
    const j = await r.json();
    if (!r.ok) return;
    setDatos(j);
    const b: Record<number, Record<PasoNC, string>> = {};
    for (const sede of Object.keys(NOMBRE_SEDE).map(Number)) {
      b[sede] = Object.fromEntries(PASOS.map((p) => [p, (j.aprobadores[sede]?.[p] ?? []).join("\n")])) as Record<PasoNC, string>;
    }
    setBorrador(b);
  };

  useEffect(() => {
    cargar();
  }, []);

  const guardar = async (sede: number) => {
    setGuardando(sede);
    setMensaje((m) => ({ ...m, [sede]: "" }));
    try {
      const pasos = Object.fromEntries(PASOS.map((p) => [p, borrador[sede][p].split(/[\s,;]+/).filter(Boolean)]));
      const r = await fetch("/api/notas-credito/aprobadores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: sede, pasos }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setMensaje((m) => ({ ...m, [sede]: "Guardado." }));
      await cargar();
    } catch (e: any) {
      setMensaje((m) => ({ ...m, [sede]: e?.message || "No se pudo guardar" }));
    } finally {
      setGuardando(null);
    }
  };

  if (!datos) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Un correo por línea: el login del panel de cada persona (necesita un usuario del panel, con cualquier rol). El SuperAdmin ve
        todo, pero solo decide quien esté aquí.
      </p>
      {Object.keys(NOMBRE_SEDE)
        .map(Number)
        .map((sede) => (
          <div key={sede} className="rounded-3xl bg-white p-5 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{NOMBRE_SEDE[sede]}</h3>
              {tieneFlujo(sede) ? (
                <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">Flujo activo</Badge>
              ) : (
                <Badge className="border border-slate-200 bg-slate-50 text-slate-500">Sin flujo todavía: RMA le pide al Super Admin</Badge>
              )}
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {PASOS.map((p) => (
                <label key={p} className="block space-y-1">
                  <span className="text-sm font-semibold text-slate-800">{ETIQUETA_PASO[p]}</span>
                  <span className="block text-xs text-slate-500">{DESCRIPCION_PASO[p]}</span>
                  <Textarea
                    rows={3}
                    value={borrador[sede]?.[p] ?? ""}
                    onChange={(e) => setBorrador((b) => ({ ...b, [sede]: { ...b[sede], [p]: e.target.value } }))}
                    className="font-mono text-xs"
                  />
                  <span className="block text-xs text-slate-500">
                    {(datos.aprobadores[sede]?.[p] ?? []).map((c) => datos.usuarios[c] || `${c} (sin usuario del panel)`).join(" · ") || "—"}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button size="sm" disabled={guardando === sede} onClick={() => guardar(sede)}>
                {guardando === sede && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar {NOMBRE_SEDE[sede]}
              </Button>
              {mensaje[sede] && <span className="text-sm text-slate-600">{mensaje[sede]}</span>}
            </div>
          </div>
        ))}
    </div>
  );
}
