"use client";

import { Loader2, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  type Actividad,
  type Estado,
  type ItemChecklist,
  type PersonaVisible,
  type Prioridad,
  ESTADOS,
  LARGO_ITEM,
  LIMITE_CHECKLIST,
  NOMBRE_SEDE,
  atajosFecha,
} from "@/lib/actividades/tipos";
import { ESTILO_PRIORIDAD } from "./comunes";

export interface DatosFormulario {
  title: string;
  description: string;
  observacion: string;
  due_date: string | null;
  priority: Prioridad;
  status: Estado;
  checklist: ItemChecklist[];
  user_id: number;
}

const nuevoId = () => Math.random().toString(36).slice(2, 10);

const etiqueta = "mb-1.5 block text-xs font-semibold text-slate-600";
const campo =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-slate-400 disabled:bg-slate-50 disabled:text-slate-500";

export default function FormActividad({
  abierto,
  actividad,
  hoy,
  yo,
  usuarioInicial,
  personas,
  puedeAsignar,
  onCerrar,
  onGuardar,
  onBorrar,
}: {
  abierto: boolean;
  /** null = nueva. */
  actividad: Actividad | null;
  hoy: string;
  yo: number;
  /** Para quién va una nueva (la persona que se está mirando). */
  usuarioInicial: number;
  personas: PersonaVisible[];
  puedeAsignar: boolean;
  onCerrar: () => void;
  onGuardar: (datos: DatosFormulario) => Promise<boolean>;
  onBorrar: (id: number) => Promise<boolean>;
}) {
  const nueva = !actividad;
  const soloLectura = !!actividad && !actividad.puede_editar;
  const [d, setD] = useState<DatosFormulario>(() => vacio());
  const [paso, setPaso] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [confirmarBorrar, setConfirmarBorrar] = useState(false);
  const refPaso = useRef<HTMLInputElement>(null);

  function vacio(): DatosFormulario {
    return {
      title: "",
      description: "",
      observacion: "",
      due_date: hoy,
      priority: "media",
      status: "pending",
      checklist: [],
      user_id: usuarioInicial || yo,
    };
  }

  useEffect(() => {
    if (!abierto) return;
    setPaso("");
    setD(
      actividad
        ? {
            title: actividad.title,
            description: actividad.description ?? "",
            observacion: actividad.observacion ?? "",
            due_date: actividad.due_date,
            priority: actividad.priority,
            status: actividad.status,
            checklist: actividad.checklist,
            user_id: actividad.user_id ?? yo,
          }
        : vacio(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, actividad?.id]);

  const set = <K extends keyof DatosFormulario>(k: K, v: DatosFormulario[K]) => setD((x) => ({ ...x, [k]: v }));

  const porSede = useMemo(() => {
    const m = new Map<string, PersonaVisible[]>();
    for (const p of personas) {
      const s = p.cids != null ? NOMBRE_SEDE[p.cids] ?? `Sede ${p.cids}` : "Sin sede";
      if (!m.has(s)) m.set(s, []);
      m.get(s)!.push(p);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [personas]);

  const agregarPaso = () => {
    const t = paso.trim();
    if (!t || d.checklist.length >= LIMITE_CHECKLIST) return;
    set("checklist", [...d.checklist, { id: nuevoId(), texto: t.slice(0, LARGO_ITEM), hecho: false }]);
    setPaso("");
    refPaso.current?.focus();
  };

  const guardar = async () => {
    if (!d.title.trim() || guardando || soloLectura) return;
    // Un paso escrito y sin "Enter" también se guarda.
    const datos = paso.trim()
      ? { ...d, checklist: [...d.checklist, { id: nuevoId(), texto: paso.trim().slice(0, LARGO_ITEM), hecho: false }] }
      : d;
    setGuardando(true);
    const ok = await onGuardar(datos);
    setGuardando(false);
    if (ok) onCerrar();
  };

  const chip = (activo: boolean) =>
    `rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
      activo ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    }`;

  const hechos = d.checklist.filter((i) => i.hecho).length;

  return (
    <>
      <Dialog open={abierto} onOpenChange={(v) => !v && onCerrar()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{nueva ? "Nueva actividad" : soloLectura ? "Actividad" : "Editar actividad"}</DialogTitle>
            {actividad && (
              <p className="text-xs text-slate-500">
                {actividad.user_name ? `De ${actividad.user_name}` : ""}
                {actividad.assigned_by ? ` · asignada por ${actividad.assigned_by}` : ""}
                {actividad.created_at
                  ? ` · creada el ${new Date(actividad.created_at).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" })}`
                  : ""}
              </p>
            )}
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void guardar();
            }}
          >
            <div>
              <label className={etiqueta} htmlFor="act-titulo">
                ¿Qué hay que hacer?
              </label>
              <input
                id="act-titulo"
                autoFocus={nueva}
                value={d.title}
                onChange={(e) => set("title", e.target.value)}
                maxLength={255}
                disabled={soloLectura}
                placeholder="Ej. Llamar a los clientes con facturas vencidas"
                className={campo}
              />
            </div>

            <div>
              <label className={etiqueta} htmlFor="act-desc">
                Detalle <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <textarea
                id="act-desc"
                rows={2}
                value={d.description}
                onChange={(e) => set("description", e.target.value)}
                disabled={soloLectura}
                className={campo}
              />
            </div>

            {puedeAsignar && personas.length > 0 && (
              <div>
                <label className={etiqueta} htmlFor="act-persona">
                  Responsable
                </label>
                <select
                  id="act-persona"
                  value={String(d.user_id)}
                  onChange={(e) => set("user_id", Number(e.target.value))}
                  disabled={soloLectura}
                  className={campo}
                >
                  {porSede.map(([sede, lista]) => (
                    <optgroup key={sede} label={sede}>
                      {lista.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.id === yo ? `${p.name} (yo)` : p.name}
                          {p.role ? ` — ${p.role}` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <span className={etiqueta}>Fecha de culminación</span>
                <input
                  type="date"
                  value={d.due_date ?? ""}
                  onChange={(e) => set("due_date", e.target.value || null)}
                  disabled={soloLectura}
                  className={campo}
                  aria-label="Fecha de culminación"
                />
                {!soloLectura && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {atajosFecha(hoy).map((a) => (
                      <button key={a.etiqueta} type="button" className={chip(d.due_date === a.fecha)} onClick={() => set("due_date", a.fecha)}>
                        {a.etiqueta}
                      </button>
                    ))}
                    <button type="button" className={chip(d.due_date === null)} onClick={() => set("due_date", null)}>
                      Sin fecha
                    </button>
                  </div>
                )}
              </div>
              <div>
                <span className={etiqueta}>Prioridad</span>
                <div className="flex gap-1.5">
                  {(["alta", "media", "baja"] as Prioridad[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      disabled={soloLectura}
                      className={`${chip(d.priority === p)} flex-1 py-2`}
                      onClick={() => set("priority", p)}
                    >
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${ESTILO_PRIORIDAD[p].punto}`} />
                      {ESTILO_PRIORIDAD[p].etiqueta}
                    </button>
                  ))}
                </div>
                {!nueva && (
                  <>
                    <span className={`${etiqueta} mt-4`}>Estado</span>
                    <div className="flex gap-1.5">
                      {ESTADOS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={soloLectura}
                          className={`${chip(d.status === s.id)} flex-1 py-2`}
                          onClick={() => set("status", s.id)}
                        >
                          {s.etiqueta}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div>
              <span className={etiqueta}>
                Pasos{" "}
                {d.checklist.length > 0 && (
                  <span className="font-normal text-slate-400">
                    ({hechos}/{d.checklist.length})
                  </span>
                )}
              </span>
              {d.checklist.length > 0 && (
                <>
                  <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${(hechos / d.checklist.length) * 100}%` }}
                    />
                  </div>
                  <ul className="mb-2 space-y-1">
                    {d.checklist.map((item) => (
                      <li key={item.id} className="group flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-slate-50">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-emerald-600"
                          checked={item.hecho}
                          disabled={soloLectura}
                          onChange={() =>
                            set(
                              "checklist",
                              d.checklist.map((i) => (i.id === item.id ? { ...i, hecho: !i.hecho } : i)),
                            )
                          }
                          aria-label={`Paso: ${item.texto}`}
                        />
                        <input
                          value={item.texto}
                          disabled={soloLectura}
                          maxLength={LARGO_ITEM}
                          onChange={(e) =>
                            set(
                              "checklist",
                              d.checklist.map((i) => (i.id === item.id ? { ...i, texto: e.target.value } : i)),
                            )
                          }
                          className={`min-w-0 flex-1 bg-transparent text-sm outline-none ${item.hecho ? "text-slate-400 line-through" : "text-slate-700"}`}
                        />
                        {!soloLectura && (
                          <button
                            type="button"
                            onClick={() => set("checklist", d.checklist.filter((i) => i.id !== item.id))}
                            className="rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-red-600"
                            aria-label="Quitar paso"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {!soloLectura && d.checklist.length < LIMITE_CHECKLIST && (
                <div className="flex items-center gap-2">
                  <input
                    ref={refPaso}
                    value={paso}
                    onChange={(e) => setPaso(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        agregarPaso();
                      }
                    }}
                    maxLength={LARGO_ITEM}
                    placeholder="Agregar un paso y Enter"
                    className={campo}
                  />
                  <Button type="button" variant="outline" size="icon" onClick={agregarPaso} disabled={!paso.trim()} aria-label="Agregar paso">
                    <Plus size={16} />
                  </Button>
                </div>
              )}
            </div>

            {!nueva && (
              <div>
                <label className={etiqueta} htmlFor="act-obs">
                  Observaciones / avance
                </label>
                <textarea
                  id="act-obs"
                  rows={3}
                  value={d.observacion}
                  onChange={(e) => set("observacion", e.target.value)}
                  disabled={soloLectura}
                  placeholder="Cómo va, qué falta, con quién se habló…"
                  className={campo}
                />
              </div>
            )}

            <DialogFooter className="flex-row items-center gap-2 pt-2 sm:justify-between">
              <div>
                {actividad?.puede_borrar && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setConfirmarBorrar(true)}
                  >
                    <Trash2 size={15} className="mr-1.5" /> Borrar
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onCerrar}>
                  {soloLectura ? "Cerrar" : "Cancelar"}
                </Button>
                {!soloLectura && (
                  <Button type="submit" disabled={!d.title.trim() || guardando}>
                    {guardando && <Loader2 size={15} className="mr-1.5 animate-spin" />}
                    {nueva ? "Crear" : "Guardar"}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmarBorrar} onOpenChange={setConfirmarBorrar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar esta actividad?</AlertDialogTitle>
            <AlertDialogDescription>
              «{actividad?.title}» se borra para siempre, con sus pasos y observaciones.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!actividad) return;
                const ok = await onBorrar(actividad.id);
                if (ok) onCerrar();
              }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
