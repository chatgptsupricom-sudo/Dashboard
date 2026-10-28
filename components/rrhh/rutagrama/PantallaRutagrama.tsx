"use client";

import { BotonExcel } from "@/components/administracion/comunes";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { htmlPlanilla } from "@/lib/rutagrama/planilla";
import {
  DIAS,
  SEDES_RUTAGRAMA,
  describirTramo,
  mapaVacio,
  rutaVuelta,
  tramosVuelta,
  type Mapa as MapaRuta,
  type ResumenRutagrama,
  type Rutagrama,
} from "@/lib/rutagrama/tipos";
import { Check, Copy, Loader2, MapPinned, MessageCircle, Plus, Printer, RotateCcw, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Pastilla } from "../seleccion/comunes";
import { BuscadorGoogle } from "@/components/rutagrama/BuscadorGoogle";
import { CENTRO_SEDE, type Enfoque } from "@/components/rutagrama/Mapa";
import { MapaRuta as Mapa } from "@/components/rutagrama/MapaRuta";
import { hayGoogle, siGoogleFalla } from "@/lib/rutagrama/google";

/**
 * Rutagrama de los nuevos ingresos (lib/rutagrama/): RRHH crea el enlace de
 * cada trabajador, se lo manda y aquí ve lo que llenó, con el mapa, y lo
 * imprime en el formato de la planilla para estampar las huellas.
 */

const selCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
const inputCls = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none";

const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short", timeZone: "America/Caracas" }) : "—";

const enlace = (token: string) => `${window.location.origin}/es/mi-ruta/${token}`;

// Sin el nombre en el saludo: viene como "apellidos y nombres".
const mensajeWhatsapp = (token: string) =>
  `https://wa.me/?text=${encodeURIComponent(
    `Hola, bienvenido(a) a Supricom. Para Recursos Humanos necesitamos tu rutagrama (cómo vas y vuelves del trabajo, LOPCYMAT). Llénalo desde tu teléfono aquí: ${enlace(token)}`,
  )}`;

/** Imprime (o guarda como PDF) una página HTML desde un iframe oculto. */
function imprimirHtml(html: string) {
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    marco.contentWindow!.focus();
    marco.contentWindow!.print();
    setTimeout(() => marco.remove(), 1000);
  }, 400);
}

function BotonCopiar({ texto, etiqueta = "Copiar enlace" }: { texto: () => string; etiqueta?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(texto());
        setCopiado(true);
        setTimeout(() => setCopiado(false), 1800);
      }}
    >
      {copiado ? <Check className="mr-1.5 h-4 w-4 text-emerald-600" /> : <Copy className="mr-1.5 h-4 w-4" />}
      {copiado ? "Copiado" : etiqueta}
    </Button>
  );
}

export default function PantallaRutagrama() {
  const [sede, setSede] = useState(0);
  const [registros, setRegistros] = useState<ResumenRutagrama[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<"todos" | "pendiente" | "completado">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [sitios, setSitios] = useState(false);
  const [abierto, setAbierto] = useState<number | null>(null);

  const cargar = () => {
    setCargando(true);
    fetch(`/api/rrhh/rutagrama${sede ? `?sede=${sede}` : ""}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "No se pudo leer")))))
      .then((j) => setRegistros(j.registros || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  };
  useEffect(cargar, [sede]); // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return registros.filter(
      (r) => (filtro === "todos" || r.estado === filtro) && (!q || `${r.nombre} ${r.cedula} ${r.cargo}`.toLowerCase().includes(q)),
    );
  }, [registros, filtro, busqueda]);
  const pendientes = registros.filter((r) => r.estado === "pendiente").length;

  const hojas = () => [
    {
      nombre: "Rutagramas",
      filas: lista.map((r) => ({
        Nombre: r.nombre,
        Cédula: r.cedula,
        Cargo: r.cargo,
        Sede: SEDES_RUTAGRAMA[r.sede]?.nombre ?? r.sede,
        Estado: r.estado === "completado" ? "Completado" : "Pendiente",
        Enviado: fechaHora(r.enviado_at),
        "Creado por": r.created_by ?? "",
      })),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <MapPinned className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Rutagrama</h1>
            <p className="text-sm text-slate-500">Ruta casa–trabajo de los nuevos ingresos (LOPCYMAT, art. 69)</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={sede} onChange={(e) => setSede(Number(e.target.value))} aria-label="Sede" className={`${selCls} font-semibold`}>
            <option value={0}>Todas las sedes</option>
            {Object.entries(SEDES_RUTAGRAMA).map(([id, s]) => (
              <option key={id} value={id}>
                {s.nombre}
              </option>
            ))}
          </select>
          <Button variant="outline" onClick={() => setSitios(true)}>
            <MapPinned className="mr-1.5 h-4 w-4" />
            Sitio de trabajo
          </Button>
          <Button onClick={() => setNuevo(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo ingreso
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["todos", `Todos (${registros.length})`],
              ["pendiente", `Por llenar (${pendientes})`],
              ["completado", `Completados (${registros.length - pendientes})`],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filtro === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar nombre, cédula o cargo…" className={`${selCls} w-full pl-9`} />
        </div>
        <div className="ml-auto">
          <BotonExcel archivo="rutagramas" hojas={hojas} />
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Trabajador", "Cédula", "Cargo", "Sede", "Estado", "Enviado", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={7} className="py-8">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            )}
            {!cargando && !lista.length && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-400">
                  {registros.length ? "Sin resultados." : "Todavía no hay rutagramas. Crea el enlace de un nuevo ingreso con «Nuevo ingreso»."}
                </td>
              </tr>
            )}
            {!cargando &&
              lista.map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-blue-50/40" onClick={() => setAbierto(r.id)}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{r.nombre}</td>
                  <td className="px-3 py-2 tabular-nums text-slate-600">{r.cedula || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{r.cargo || "—"}</td>
                  <td className="px-3 py-2 text-slate-600">{SEDES_RUTAGRAMA[r.sede]?.nombre}</td>
                  <td className="px-3 py-2">
                    {r.estado === "completado" ? <Pastilla tono="verde">Completado</Pastilla> : <Pastilla tono="ambar">Por llenar</Pastilla>}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{fechaHora(r.enviado_at)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {r.estado === "pendiente" && <BotonCopiar texto={() => enlace(r.token)} />}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <NuevoIngreso abierto={nuevo} sedeInicial={sede || 9} onCerrar={() => setNuevo(false)} onCreado={cargar} />
      <SitiosSedes abierto={sitios} onCerrar={() => setSitios(false)} />
      {abierto != null && <Detalle id={abierto} onCerrar={() => setAbierto(null)} onCambio={cargar} />}
    </div>
  );
}

/* ------------------------------------------------------------ nuevo ingreso */

function NuevoIngreso({ abierto, sedeInicial, onCerrar, onCreado }: { abierto: boolean; sedeInicial: number; onCerrar: () => void; onCreado: () => void }) {
  const [f, setF] = useState({ nombre: "", cedula: "", cargo: "", sede: sedeInicial });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creado, setCreado] = useState<{ token: string; nombre: string } | null>(null);

  useEffect(() => {
    if (abierto) {
      setF({ nombre: "", cedula: "", cargo: "", sede: sedeInicial });
      setCreado(null);
      setError(null);
    }
  }, [abierto, sedeInicial]);

  const crear = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/rrhh/rutagrama", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo crear");
      setCreado({ token: j.token, nombre: f.nombre });
      onCreado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{creado ? "Enlace listo" : "Nuevo ingreso"}</DialogTitle>
          <DialogDescription>
            {creado
              ? `Mándale este enlace a ${creado.nombre}. Lo abre en el teléfono, llena su ruta y firma; cuando lo envíe aparece aquí como completado.`
              : "Crea el enlace personal para que el trabajador llene su rutagrama. Lo que no sepas lo completa él."}
          </DialogDescription>
        </DialogHeader>
        {creado ? (
          <div className="space-y-4">
            <p className="break-all rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">{enlace(creado.token)}</p>
            <div className="flex flex-wrap gap-2">
              <BotonCopiar texto={() => enlace(creado.token)} />
              <Button variant="outline" size="sm" asChild>
                <a href={mensajeWhatsapp(creado.token)} target="_blank" rel="noreferrer">
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  Enviar por WhatsApp
                </a>
              </Button>
              <Button size="sm" className="ml-auto" onClick={onCerrar}>
                Listo
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Apellidos y nombres</span>
              <input className={inputCls} value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} autoFocus />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Cédula (opcional)</span>
                <input className={inputCls} value={f.cedula} onChange={(e) => setF({ ...f, cedula: e.target.value })} />
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-semibold text-slate-600">Sede</span>
                <select className={`${inputCls} bg-white`} value={f.sede} onChange={(e) => setF({ ...f, sede: Number(e.target.value) })}>
                  {Object.entries(SEDES_RUTAGRAMA).map(([id, s]) => (
                    <option key={id} value={id}>
                      {s.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-600">Cargo (opcional)</span>
              <input className={inputCls} value={f.cargo} onChange={(e) => setF({ ...f, cargo: e.target.value })} />
            </label>
            {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onCerrar}>
                Cancelar
              </Button>
              <Button onClick={crear} disabled={guardando || f.nombre.trim().length < 3}>
                {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Crear enlace
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ detalle */

function Detalle({ id, onCerrar, onCambio }: { id: number; onCerrar: () => void; onCambio: () => void }) {
  const [r, setR] = useState<Rutagrama | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = () =>
    fetch(`/api/rrhh/rutagrama/${id}`)
      .then((x) => x.json().then((j) => (x.ok ? j : Promise.reject(new Error(j?.error || "No se pudo leer")))))
      .then((j) => setR(j.registro))
      .catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const accion = async (metodo: "PATCH" | "DELETE", confirmar: string) => {
    if (!confirm(confirmar)) return;
    setOcupado(true);
    const x = await fetch(`/api/rrhh/rutagrama/${id}`, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: metodo === "PATCH" ? JSON.stringify({ accion: "reabrir" }) : undefined,
    });
    setOcupado(false);
    if (!x.ok) return setError("No se pudo hacer el cambio.");
    onCambio();
    if (metodo === "DELETE") onCerrar();
    else cargar();
  };

  const completado = r?.estado === "completado";
  const vuelta = r ? rutaVuelta(r) : [];

  return (
    <Dialog open onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{r?.nombre ?? "Rutagrama"}</DialogTitle>
          <DialogDescription>
            {r
              ? `${SEDES_RUTAGRAMA[r.sede]?.nombre} · ${completado ? `enviado el ${fechaHora(r.enviado_at)}` : "todavía no lo ha llenado"}${r.versiones.length > 1 ? ` · ${r.versiones.length} envíos` : ""}`
              : "Cargando…"}
          </DialogDescription>
        </DialogHeader>
        {error && <p className="rounded-lg bg-red-50 p-2.5 text-sm text-red-700">{error}</p>}
        {!r && !error && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}
        {r && (
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {completado && (
                <Button size="sm" onClick={() => imprimirHtml(htmlPlanilla(r))}>
                  <Printer className="mr-1.5 h-4 w-4" />
                  Imprimir planilla
                </Button>
              )}
              {!completado && <BotonCopiar texto={() => enlace(r.token)} />}
              {!completado && (
                <Button variant="outline" size="sm" asChild>
                  <a href={mensajeWhatsapp(r.token)} target="_blank" rel="noreferrer">
                    <MessageCircle className="mr-1.5 h-4 w-4" />
                    WhatsApp
                  </a>
                </Button>
              )}
              {completado && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    accion(
                      "PATCH",
                      `¿Volver a abrir el enlace de ${r.nombre}? Podrá corregir lo que mandó (por ejemplo, si cambió de domicilio). El envío actual queda guardado como versión anterior.`,
                    )
                  }
                >
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  Permitir corregir
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-red-600 hover:text-red-700"
                disabled={ocupado}
                onClick={() => accion("DELETE", `¿Borrar el rutagrama de ${r.nombre}? Se pierde lo que haya llenado.`)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Borrar
              </Button>
            </div>

            {!completado && r.envios === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                Cuando {r.nombre} llene su rutagrama vas a ver aquí su ruta, el mapa y su firma.
              </p>
            ) : (
              <>
                {!completado && (
                  <p className="rounded-lg bg-amber-50 p-2.5 text-sm text-amber-800">
                    El enlace está abierto para que corrija. Abajo está lo último que mandó.
                  </p>
                )}
                <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  <Dato etiqueta="Cédula" valor={r.cedula} />
                  <Dato etiqueta="Cargo" valor={r.cargo} />
                  <Dato etiqueta="Turno" valor={r.turno} />
                  <Dato etiqueta="Días" valor={DIAS.filter((d) => r.dias.includes(d.id)).map((d) => d.nombre).join(", ")} />
                  <div className="sm:col-span-2">
                    <Dato etiqueta="Dirección" valor={r.direccion} />
                  </div>
                  <Dato etiqueta="Tiempo de traslado" valor={r.tiempo_min ? `${r.tiempo_min} minutos` : "—"} />
                </dl>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Tramos titulo="Ida: casa → trabajo" lista={r.ida.map(describirTramo)} referencias={r.referencias_ida} />
                  <Tramos
                    titulo={`Regreso: trabajo → casa${r.vuelta_igual ? " (mismo camino)" : ""}`}
                    lista={tramosVuelta(r).map(describirTramo)}
                    referencias={r.vuelta_igual ? "" : r.referencias_vuelta}
                  />
                </div>
                <Mapa mapa={r.mapa} rutaVuelta={r.vuelta_igual ? null : vuelta} centro={r.mapa.casa ?? CENTRO_SEDE[r.sede] ?? CENTRO_SEDE[9]} alto={320} />
                {r.firma && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500">Firma</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.firma} alt={`Firma de ${r.nombre}`} className="mt-1 h-24 rounded-lg border border-slate-200 bg-white object-contain p-2" />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500">{etiqueta}</dt>
      <dd className="text-slate-800">{valor || "—"}</dd>
    </div>
  );
}

function Tramos({ titulo, lista, referencias }: { titulo: string; lista: string[]; referencias: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
        {lista.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ol>
      {referencias && <p className="mt-2 text-xs text-slate-500">Referencias: {referencias}</p>}
    </div>
  );
}

/* ----------------------------------------------------- sitio de cada sede */

function SitiosSedes({ abierto, onCerrar }: { abierto: boolean; onCerrar: () => void }) {
  const [sede, setSede] = useState(9);
  const [sitios, setSitios] = useState<{ sede: number; lat: number; lng: number; direccion: string }[]>([]);
  const [mapa, setMapa] = useState<MapaRuta>(mapaVacio());
  const [direccion, setDireccion] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enfoque, setEnfoque] = useState<Enfoque | null>(null);
  const [conGoogle, setConGoogle] = useState(hayGoogle);
  useEffect(() => siGoogleFalla(() => setConGoogle(false)), []);

  useEffect(() => {
    if (!abierto) return;
    fetch("/api/rrhh/rutagrama/sedes")
      .then((r) => r.json())
      .then((j) => setSitios(j.sitios || []))
      .catch(() => {});
  }, [abierto]);

  useEffect(() => {
    const s = sitios.find((x) => x.sede === sede);
    setMapa({ ...mapaVacio(), trabajo: s ? [s.lat, s.lng] : null });
    setDireccion(s?.direccion ?? "");
    setAviso(null);
  }, [sede, sitios]);

  const guardar = async () => {
    if (!mapa.trabajo) return setAviso("Toca el mapa donde está la sede.");
    setGuardando(true);
    const r = await fetch("/api/rrhh/rutagrama/sedes", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sede, lat: mapa.trabajo[0], lng: mapa.trabajo[1], direccion }),
    });
    setGuardando(false);
    if (!r.ok) return setAviso("No se pudo guardar.");
    setSitios((xs) => [...xs.filter((x) => x.sede !== sede), { sede, lat: mapa.trabajo![0], lng: mapa.trabajo![1], direccion }]);
    setAviso("Guardado. Los trabajadores de esta sede ya lo ven marcado en su mapa.");
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sitio de trabajo de cada sede</DialogTitle>
          <DialogDescription>
            Marca dónde queda cada sede: el trabajador lo ve ya puesto en su mapa y solo marca su casa y el camino. Sin esto, lo marca él.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(SEDES_RUTAGRAMA).map(([id, s]) => {
              const listo = sitios.some((x) => x.sede === Number(id));
              return (
                <button
                  key={id}
                  onClick={() => setSede(Number(id))}
                  className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${sede === Number(id) ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600"}`}
                >
                  {s.nombre}
                  {listo && <Check className="ml-1 inline h-3.5 w-3.5 text-emerald-600" />}
                </button>
              );
            })}
          </div>
          {conGoogle && (
            <BuscadorGoogle
              key={`buscar-${sede}`}
              cerca={CENTRO_SEDE[sede]}
              onFalla={() => setConGoogle(false)}
              onElegir={(p, dir) => {
                setMapa({ ...mapaVacio(), trabajo: p });
                if (dir) setDireccion(dir.slice(0, 300));
                setEnfoque({ punto: p, zoom: 17, n: Date.now() });
              }}
            />
          )}
          <Mapa key={sede} mapa={mapa} modo="trabajo" onChange={setMapa} centro={mapa.trabajo ?? CENTRO_SEDE[sede]} enfoque={enfoque} alto={320} />
          <input className={inputCls} value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Dirección corta (la ve el trabajador), ej.: Zona Industrial Norte" />
          {aviso && <p className="text-sm text-slate-600">{aviso}</p>}
          <div className="flex justify-end">
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Guardar sitio de {SEDES_RUTAGRAMA[sede].nombre}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
