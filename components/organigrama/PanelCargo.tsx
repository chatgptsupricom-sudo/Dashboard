"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  cadenaDeMando,
  descendientes,
  hijosPorPadre,
  type Actividad,
  type Nodo,
} from "@/lib/organigrama/tipos";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  ListPlus,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";

type Props = {
  nodo: Nodo | null;
  nodos: Nodo[];
  tabInicial?: "actividades" | "datos";
  onCerrar: () => void;
  onSeleccionar: (id: number, tab?: "actividades" | "datos") => void;
  /** Vuelve a leer el organigrama después de cada cambio. */
  onRecargar: () => Promise<void>;
  /** Solo lectura: se ven el propósito y las actividades, sin editar. */
  soloLectura?: boolean;
};

const pedir = async (url: string, method: string, body?: unknown) => {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
  return j;
};

const nuevaActividad = (): Actividad => ({
  id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  texto: "",
  detalle: "",
});

const input =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100";
const etiqueta = "mb-1 block text-xs font-semibold text-slate-600";

/** Solo lectura: propósito y actividades del cargo, sin controles de edición. */
function Lectura({ nodo }: { nodo: Nodo }) {
  return (
    <div className="flex-1 space-y-5 p-5">
      <div>
        <p className={etiqueta}>Propósito del cargo</p>
        <p className="whitespace-pre-line text-sm text-slate-700">{nodo.proposito || "Sin propósito anotado."}</p>
      </div>
      <div className="space-y-2">
        <p className={etiqueta}>Actividades que desarrolla ({nodo.actividades.length})</p>
        {nodo.actividades.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            Todavía no hay actividades anotadas para este cargo.
          </p>
        )}
        {nodo.actividades.map((a, i) => (
          <div key={a.id} className="flex gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="w-5 shrink-0 text-right text-xs font-bold text-slate-400">{i + 1}.</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-line text-sm text-slate-800">{a.texto}</p>
              {a.detalle && <p className="mt-1 whitespace-pre-line text-xs text-slate-500">{a.detalle}</p>}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400">Solo lectura. Para cambiar el cargo o sus actividades, pulsa «Editar» arriba del organigrama.</p>
    </div>
  );
}

/** Panel lateral de un cargo: sus actividades y, en otra pestaña, sus datos y su lugar en el organigrama. */
export function PanelCargo(props: Props) {
  const { nodo, onCerrar } = props;
  return (
    <Sheet open={!!nodo} onOpenChange={(abierto) => !abierto && onCerrar()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-xl">
        {nodo && <Contenido key={nodo.id} {...props} nodo={nodo} />}
      </SheetContent>
    </Sheet>
  );
}

function Contenido({ nodo, nodos, tabInicial, onCerrar, onSeleccionar, onRecargar, soloLectura }: Props & { nodo: Nodo }) {
  const [tab, setTab] = useState<string>(tabInicial || "actividades");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Actividades
  const [proposito, setProposito] = useState(nodo.proposito);
  const [actividades, setActividades] = useState<Actividad[]>(nodo.actividades);
  const [conDetalle, setConDetalle] = useState<Set<string>>(
    () => new Set(nodo.actividades.filter((a) => a.detalle).map((a) => a.id)),
  );
  const actividadesCambiadas =
    proposito !== nodo.proposito || JSON.stringify(actividades) !== JSON.stringify(nodo.actividades);

  // Datos del cargo
  const [datos, setDatos] = useState({
    cargo: nodo.cargo,
    area: nodo.area,
    nota: nodo.nota,
    personas: nodo.personas.join("\n"),
    tipo: nodo.tipo,
    staff: nodo.staff,
    disposicion: nodo.disposicion,
    parentId: nodo.parentId == null ? "" : String(nodo.parentId),
  });
  const datosOriginales = useMemo(
    () => ({
      cargo: nodo.cargo,
      area: nodo.area,
      nota: nodo.nota,
      personas: nodo.personas.join("\n"),
      tipo: nodo.tipo,
      staff: nodo.staff,
      disposicion: nodo.disposicion,
      parentId: nodo.parentId == null ? "" : String(nodo.parentId),
    }),
    [nodo],
  );
  const datosCambiados = JSON.stringify(datos) !== JSON.stringify(datosOriginales);

  const mapa = useMemo(() => hijosPorPadre(nodos), [nodos]);
  const cadena = useMemo(() => cadenaDeMando(nodos, nodo.id).slice(0, -1), [nodos, nodo.id]);
  const subordinados = mapa.get(nodo.id) || [];
  const hermanos = mapa.get(nodo.parentId) || [];
  const posicion = hermanos.findIndex((h) => h.id === nodo.id);
  const padre = nodos.find((n) => n.id === nodo.parentId);
  const enFila = padre?.disposicion === "fila" && !nodo.staff;

  // Opciones de "Reporta a": todo menos el propio cargo y lo que cuelga de él, con sangría.
  const opcionesSuperior = useMemo(() => {
    const fuera = descendientes(nodos, nodo.id);
    const lista: { id: number; texto: string }[] = [];
    const recorrer = (padreId: number | null, nivel: number) => {
      for (const n of mapa.get(padreId) || []) {
        if (fuera.has(n.id)) continue;
        const quien = n.personas.length ? ` (${n.personas.slice(0, 2).join(", ")}${n.personas.length > 2 ? "…" : ""})` : "";
        lista.push({ id: n.id, texto: `${"   ".repeat(nivel)}${n.cargo}${quien}` });
        recorrer(n.id, nivel + 1);
      }
    };
    recorrer(null, 0);
    return lista;
  }, [nodos, nodo.id, mapa]);

  const ejecutar = async (accion: () => Promise<unknown>) => {
    setGuardando(true);
    setError(null);
    try {
      await accion();
      await onRecargar();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar");
    } finally {
      setGuardando(false);
    }
  };

  // Se guarda lo mismo que limpia el servidor, y eso queda en pantalla: así,
  // después de guardar, el formulario ya no se ve "con cambios".
  const guardarActividades = () => {
    const limpias = actividades
      .map((a) => ({ ...a, texto: a.texto.trim(), detalle: a.detalle.trim() }))
      .filter((a) => a.texto);
    const p = proposito.trim();
    return ejecutar(async () => {
      await pedir(`/api/organigrama/${nodo.id}`, "PUT", { proposito: p, actividades: limpias });
      setProposito(p);
      setActividades(limpias);
    });
  };

  const guardarDatos = () => {
    const personas = datos.personas.split("\n").map((p) => p.trim()).filter(Boolean);
    const limpios = {
      ...datos,
      cargo: datos.cargo.trim(),
      area: datos.area.trim(),
      nota: datos.nota.trim(),
      personas: personas.join("\n"),
    };
    return ejecutar(async () => {
      await pedir(`/api/organigrama/${nodo.id}`, "PUT", {
        ...limpios,
        personas,
        parentId: datos.parentId === "" ? null : Number(datos.parentId),
      });
      setDatos(limpios);
    });
  };

  const crear = async (body: Record<string, unknown>) => {
    setGuardando(true);
    setError(null);
    try {
      const { id } = await pedir("/api/organigrama", "POST", body);
      await onRecargar();
      onSeleccionar(id, "datos");
    } catch (e: any) {
      setError(e?.message || "No se pudo crear");
    } finally {
      setGuardando(false);
    }
  };

  const borrar = () => {
    const aviso = subordinados.length
      ? `¿Eliminar "${nodo.cargo}"? Sus ${subordinados.length} subordinado(s) pasarán a reportar a ${padre ? `"${padre.cargo}"` : "la cabeza del organigrama"}. Sus actividades se pierden.`
      : `¿Eliminar "${nodo.cargo}" y sus actividades?`;
    if (!window.confirm(aviso)) return;
    ejecutar(() => pedir(`/api/organigrama/${nodo.id}`, "DELETE")).then(onCerrar);
  };

  const cambiarDeCargo = (id: number) => {
    if ((actividadesCambiadas || datosCambiados) && !window.confirm("Hay cambios sin guardar en este cargo. ¿Salir sin guardar?"))
      return;
    onSeleccionar(id);
  };

  const editarActividad = (i: number, cambio: Partial<Actividad>) =>
    setActividades((l) => l.map((a, j) => (j === i ? { ...a, ...cambio } : a)));
  const moverActividad = (i: number, d: -1 | 1) =>
    setActividades((l) => {
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const set = <K extends keyof typeof datos>(k: K, v: (typeof datos)[K]) => setDatos((d) => ({ ...d, [k]: v }));

  return (
    <div className="flex min-h-full flex-col">
      <SheetHeader className="border-b border-slate-100 bg-slate-50 p-5 pr-12">
        {cadena.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
            {cadena.map((c, i) => (
              <span key={c.id} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <button className="hover:text-blue-600 hover:underline" onClick={() => cambiarDeCargo(c.id)}>
                  {c.cargo}
                </button>
              </span>
            ))}
          </div>
        )}
        {nodo.area && <p className="text-[11px] uppercase tracking-[0.14em] text-slate-500">{nodo.area}</p>}
        <SheetTitle className="text-xl font-black text-slate-900">{nodo.cargo}</SheetTitle>
        <SheetDescription className="text-sm text-slate-600">
          {nodo.personas.length ? nodo.personas.join(" · ") : "Sin personas asignadas"}
          {nodo.nota && <span className="text-slate-400"> — {nodo.nota}</span>}
        </SheetDescription>
        {subordinados.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {subordinados.map((h) => (
              <button
                key={h.id}
                onClick={() => cambiarDeCargo(h.id)}
                className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 hover:border-blue-300 hover:text-blue-700"
              >
                {h.staff ? "Staff · " : ""}
                {h.cargo}
              </button>
            ))}
          </div>
        )}
      </SheetHeader>

      {error && <p className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {soloLectura ? (
        <Lectura nodo={nodo} />
      ) : (
      <Tabs value={tab} onValueChange={setTab} className="flex-1 p-5">
        <TabsList className="w-full">
          <TabsTrigger value="actividades" className="flex-1">
            Actividades{actividades.length ? ` (${actividades.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="datos" className="flex-1">
            Datos y estructura
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------ Actividades */}
        <TabsContent value="actividades" className="mt-4 space-y-4">
          <div>
            <label className={etiqueta}>Propósito del cargo</label>
            <textarea
              value={proposito}
              onChange={(e) => setProposito(e.target.value)}
              rows={3}
              placeholder="¿Para qué existe este cargo? Ej.: Garantizar que la mercancía salga del almacén completa y a tiempo."
              className={input}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className={etiqueta}>Actividades que desarrolla</span>
              <span className="text-[11px] text-slate-400">{actividades.length} anotada(s)</span>
            </div>
            {actividades.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Todavía no hay actividades anotadas para este cargo.
              </p>
            )}
            {actividades.map((a, i) => (
              <div key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex gap-2">
                  <span className="mt-2 w-5 shrink-0 text-right text-xs font-bold text-slate-400">{i + 1}.</span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <textarea
                      value={a.texto}
                      onChange={(e) => editarActividad(i, { texto: e.target.value })}
                      rows={2}
                      autoFocus={!a.texto && i === actividades.length - 1}
                      placeholder="Describe la actividad…"
                      className={input}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {!conDetalle.has(a.id) && (
                        <button
                          onClick={() => setConDetalle((s) => new Set(s).add(a.id))}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          + Detalle / cómo se hace
                        </button>
                      )}
                      <div className="ml-auto flex gap-0.5">
                        <BotonIcono titulo="Subir" onClick={() => moverActividad(i, -1)} disabled={i === 0}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </BotonIcono>
                        <BotonIcono
                          titulo="Bajar"
                          onClick={() => moverActividad(i, 1)}
                          disabled={i === actividades.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </BotonIcono>
                        <BotonIcono
                          titulo="Quitar"
                          peligro
                          onClick={() => setActividades((l) => l.filter((_, j) => j !== i))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </BotonIcono>
                      </div>
                    </div>
                    {conDetalle.has(a.id) && (
                      <textarea
                        value={a.detalle}
                        onChange={(e) => editarActividad(i, { detalle: e.target.value })}
                        rows={3}
                        placeholder="Pasos, herramientas, con quién se coordina, entregable…"
                        className={cn(input, "text-xs")}
                      />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <button
              onClick={() => setActividades((l) => [...l, nuevaActividad()])}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600"
            >
              <ListPlus className="h-4 w-4" /> Agregar actividad
            </button>
          </div>

          <BarraGuardar
            cambiado={actividadesCambiadas}
            guardando={guardando}
            onGuardar={guardarActividades}
            onDescartar={() => {
              setProposito(nodo.proposito);
              setActividades(nodo.actividades);
            }}
            texto="Guardar actividades"
          />
        </TabsContent>

        {/* ------------------------------------------------ Datos y estructura */}
        <TabsContent value="datos" className="mt-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={etiqueta}>Cargo</label>
              <input value={datos.cargo} onChange={(e) => set("cargo", e.target.value)} className={input} />
            </div>
            <div>
              <label className={etiqueta}>Área (etiqueta superior)</label>
              <input
                value={datos.area}
                onChange={(e) => set("area", e.target.value)}
                placeholder="Ej.: Ventas"
                className={input}
              />
            </div>
            <div>
              <label className={etiqueta}>Nota</label>
              <input
                value={datos.nota}
                onChange={(e) => set("nota", e.target.value)}
                placeholder="Ej.: Coordinador"
                className={input}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={etiqueta}>Personas en el cargo (una por línea)</label>
              <textarea
                value={datos.personas}
                onChange={(e) => set("personas", e.target.value)}
                rows={Math.min(8, Math.max(2, datos.personas.split("\n").length + 1))}
                className={input}
              />
            </div>
            <div>
              <label className={etiqueta}>Estilo del recuadro</label>
              <select value={datos.tipo} onChange={(e) => set("tipo", e.target.value as Nodo["tipo"])} className={input}>
                <option value="direccion">Dirección (oscuro)</option>
                <option value="area">Jefatura / área</option>
                <option value="cargo">Cargo</option>
              </select>
            </div>
            <div>
              <label className={etiqueta}>Subordinados en</label>
              <select
                value={datos.disposicion}
                onChange={(e) => set("disposicion", e.target.value as Nodo["disposicion"])}
                className={input}
              >
                <option value="columna">Columna (lista hacia abajo)</option>
                <option value="fila">Fila (uno al lado del otro)</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={etiqueta}>Reporta a</label>
              <select value={datos.parentId} onChange={(e) => set("parentId", e.target.value)} className={input}>
                <option value="">— Nadie (cabeza del organigrama) —</option>
                {opcionesSuperior.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.texto}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex cursor-pointer items-start gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={datos.staff}
                onChange={(e) => set("staff", e.target.checked)}
                className="mt-0.5 h-4 w-4"
              />
              <span className="text-sm text-slate-700">
                Es staff de su superior
                <span className="block text-xs text-slate-500">
                  Asesora o apoya directamente al superior: se dibuja a su lado, no debajo.
                </span>
              </span>
            </label>
          </div>

          <BarraGuardar
            cambiado={datosCambiados}
            guardando={guardando}
            onGuardar={guardarDatos}
            onDescartar={() => setDatos(datosOriginales)}
            texto="Guardar datos"
          />

          <div className="space-y-2 border-t border-slate-100 pt-4">
            <p className={etiqueta}>Organigrama</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <BotonAccion
                onClick={() => crear({ parentId: nodo.id, cargo: "Nuevo cargo" })}
                disabled={guardando}
                icono={<Plus className="h-4 w-4" />}
                texto="Agregar subordinado"
              />
              <BotonAccion
                onClick={() => crear({ parentId: nodo.id, cargo: "Nuevo staff", staff: true })}
                disabled={guardando}
                icono={<UserPlus className="h-4 w-4" />}
                texto="Agregar staff"
              />
              <BotonAccion
                onClick={() =>
                  crear({ parentId: nodo.parentId, encimaDe: nodo.id, cargo: "Nuevo cargo directivo", tipo: "area" })
                }
                disabled={guardando}
                icono={<Users className="h-4 w-4" />}
                texto="Agregar superior (insertar arriba)"
              />
              {hermanos.length > 1 && (
                <div className="flex gap-2">
                  <BotonAccion
                    onClick={() => ejecutar(() => pedir(`/api/organigrama/${nodo.id}`, "PUT", { mover: -1 }))}
                    disabled={guardando || posicion <= 0}
                    icono={enFila ? <ArrowLeft className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                    texto={enFila ? "Izquierda" : "Subir"}
                  />
                  <BotonAccion
                    onClick={() => ejecutar(() => pedir(`/api/organigrama/${nodo.id}`, "PUT", { mover: 1 }))}
                    disabled={guardando || posicion >= hermanos.length - 1}
                    icono={enFila ? <ArrowRight className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                    texto={enFila ? "Derecha" : "Bajar"}
                  />
                </div>
              )}
            </div>
            <button
              onClick={borrar}
              disabled={guardando}
              className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" /> Eliminar este cargo
            </button>
          </div>
        </TabsContent>
      </Tabs>
      )}

      {nodo.updatedAt && (
        <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-400">
          Última modificación {new Date(nodo.updatedAt).toLocaleString("es-VE")}
          {nodo.updatedBy ? ` por ${nodo.updatedBy}` : ""}
        </p>
      )}
    </div>
  );
}

function BotonIcono({
  titulo,
  onClick,
  disabled,
  peligro,
  children,
}: {
  titulo: string;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30",
        peligro ? "hover:text-red-600" : "hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function BotonAccion({
  onClick,
  disabled,
  icono,
  texto,
}: {
  onClick: () => void;
  disabled?: boolean;
  icono: React.ReactNode;
  texto: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 disabled:opacity-40"
    >
      {icono}
      {texto}
    </button>
  );
}

function BarraGuardar({
  cambiado,
  guardando,
  onGuardar,
  onDescartar,
  texto,
}: {
  cambiado: boolean;
  guardando: boolean;
  onGuardar: () => void;
  onDescartar: () => void;
  texto: string;
}) {
  return (
    <div className="sticky bottom-0 -mx-5 flex items-center justify-end gap-2 border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
      {cambiado && <span className="mr-auto text-xs font-semibold text-amber-600">Cambios sin guardar</span>}
      {cambiado && (
        <button onClick={onDescartar} disabled={guardando} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          Descartar
        </button>
      )}
      <button
        onClick={onGuardar}
        disabled={!cambiado || guardando}
        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
      >
        {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
        {texto}
      </button>
    </div>
  );
}
