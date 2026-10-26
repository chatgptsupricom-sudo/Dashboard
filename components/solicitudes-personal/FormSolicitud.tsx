"use client";

import { inputCls } from "@/components/rrhh/seleccion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SEDES_SELECCION } from "@/lib/seleccion/tipos";
import { MOTIVOS, URGENCIAS, type Motivo, type Solicitud, type Urgencia } from "@/lib/solicitudes-personal/tipos";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export const AREAS_SUGERIDAS = [
  "Administración",
  "Almacén",
  "Compras",
  "Cuentas por Cobrar",
  "Marketing",
  "Operaciones",
  "RMA / Servicio Técnico",
  "Seguridad",
  "Tecnología",
  "Ventas",
];

export async function enviar(url: string, method: string, cuerpo?: object) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
  return j;
}

function Etiqueta({ texto, ayuda, children }: { texto: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{texto}</span>
      {children}
      {ayuda && <span className="block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  );
}

const vacio = (sede: number) => ({
  cargo: "",
  area: "",
  sede,
  cantidad: 1,
  motivo: "nuevo" as Motivo,
  reemplaza: "",
  urgencia: "media" as Urgencia,
  fecha_deseada: "",
  perfil: "",
  requisitos: "",
  salario: "",
});

/** Crear (solicitud = null) o editar una pendiente propia. `sedeFija` = el cids del gerente. */
export function FormSolicitud({
  abierto,
  solicitud,
  sedeFija,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  solicitud: Solicitud | null;
  sedeFija: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState(vacio(sedeFija ?? 9));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setF(solicitud ? { ...vacio(solicitud.sede), ...solicitud, fecha_deseada: solicitud.fecha_deseada ?? "" } : vacio(sedeFija ?? 9));
  }, [abierto, solicitud, sedeFija]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      await enviar(solicitud ? `/api/solicitudes-personal/${solicitud.id}` : "/api/solicitudes-personal", solicitud ? "PUT" : "POST", f);
      onGuardado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{solicitud ? `Editar solicitud SP-${solicitud.id}` : "Nueva solicitud de personal"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <Etiqueta texto="Cargo *">
            <input className={inputCls} value={f.cargo} onChange={(e) => set("cargo", e.target.value)} maxLength={160} />
          </Etiqueta>
          <Etiqueta texto="Área o unidad">
            <input className={inputCls} value={f.area} onChange={(e) => set("area", e.target.value)} list="sp-areas" maxLength={120} />
            <datalist id="sp-areas">
              {AREAS_SUGERIDAS.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
          </Etiqueta>
          <Etiqueta texto="Sede *" ayuda={sedeFija ? "La de tu usuario" : undefined}>
            <select className={inputCls} value={f.sede} disabled={!!sedeFija} onChange={(e) => set("sede", Number(e.target.value))}>
              {Object.entries(SEDES_SELECCION).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </Etiqueta>
          <Etiqueta texto="Cantidad de personas *">
            <input type="number" min={1} max={50} className={inputCls} value={f.cantidad} onChange={(e) => set("cantidad", Number(e.target.value))} />
          </Etiqueta>

          <Etiqueta texto="Motivo *">
            <select className={inputCls} value={f.motivo} onChange={(e) => set("motivo", e.target.value as Motivo)}>
              {(Object.keys(MOTIVOS) as Motivo[]).map((m) => (
                <option key={m} value={m}>
                  {MOTIVOS[m]}
                </option>
              ))}
            </select>
          </Etiqueta>
          {f.motivo === "reemplazo" ? (
            <Etiqueta texto="¿A quién reemplaza? *">
              <input className={inputCls} value={f.reemplaza} onChange={(e) => set("reemplaza", e.target.value)} maxLength={160} />
            </Etiqueta>
          ) : (
            <div className="hidden sm:block" />
          )}

          <Etiqueta texto="Urgencia *" ayuda={`Meta de RRHH para cubrirla: ${URGENCIAS[f.urgencia].dias} días`}>
            <div className="flex gap-2">
              {(Object.keys(URGENCIAS) as Urgencia[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => set("urgencia", u)}
                  aria-pressed={f.urgencia === u}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                    f.urgencia === u ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {URGENCIAS[u].etiqueta}
                </button>
              ))}
            </div>
          </Etiqueta>
          <Etiqueta texto="Fecha deseada de ingreso">
            <input type="date" className={inputCls} value={f.fecha_deseada} onChange={(e) => set("fecha_deseada", e.target.value)} />
          </Etiqueta>

          <div className="sm:col-span-2">
            <Etiqueta texto="Perfil y funciones *" ayuda="Qué va a hacer la persona y qué se espera de ella">
              <textarea className={`${inputCls} min-h-24`} value={f.perfil} onChange={(e) => set("perfil", e.target.value)} maxLength={4000} />
            </Etiqueta>
          </div>
          <div className="sm:col-span-2">
            <Etiqueta texto="Requisitos" ayuda="Estudios, experiencia, conocimientos">
              <textarea className={`${inputCls} min-h-20`} value={f.requisitos} onChange={(e) => set("requisitos", e.target.value)} maxLength={4000} />
            </Etiqueta>
          </div>
          <Etiqueta texto="Salario o rango" ayuda="Opcional">
            <input className={inputCls} value={f.salario} onChange={(e) => set("salario", e.target.value)} maxLength={120} />
          </Etiqueta>
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {solicitud ? "Guardar cambios" : "Enviar al SuperAdmin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
