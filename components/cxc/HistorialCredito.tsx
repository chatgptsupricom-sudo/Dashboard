"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Download, History, Pencil, Search, Users } from "lucide-react";
import { descargarExcel } from "@/lib/excel";

// Pestaña Historial de Sobregiro (lib/cxc/historialCredito.ts): cambios de
// cupo, veces que cada cliente se pasó y el cupo/deuda de cualquier fecha,
// desde que el panel empezó a tomar la foto cada hora.

type Tipo = "cupo" | "excedio" | "normalizo";
type Evento = {
  id: number; sede: string; partnerId: number; companyId: number; cliente: string; tipo: Tipo;
  limiteAntes: number | null; limiteDespues: number | null; usado: number | null;
  usuario: string | null; cambiadoEl: string | null; dia: string; detectadoEl: string;
};
type ResumenCliente = {
  companyId: number; sede: string; partnerId: number; cliente: string;
  limiteInicio: number | null; limiteFin: number | null;
  cambiosCupo: number; vecesExcedido: number; diasExcedido: number; mayorExceso: number;
};
type Historial = {
  midiendoDesde: string | null; desde: string; hasta: string;
  eventos: Evento[]; clientes: ResumenCliente[];
  resumen: { cambiosCupo: number; vecesExcedido: number; clientesExcedidos: number; diasClienteExcedido: number };
};
type Foto = {
  companyId: number; sede: string; partnerId: number; cliente: string; rif: string; vendedor: string;
  limite: number; usado: number; vencido: number; estado: string; fecha: string;
};
type Vista = "clientes" | "cupos" | "excesos" | "fecha";

const usd = (v: number | null) =>
  v == null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fechaHora = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "short", timeStyle: "short" }) : "—";
const dia = (s: string) => s.split("-").reverse().join("/");
const hoyCaracas = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
const restarDias = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function HistorialCredito({ empresa, mostrarSede }: { empresa: string; mostrarSede: boolean }) {
  const [hasta, setHasta] = useState(hoyCaracas);
  const [desde, setDesde] = useState(() => restarDias(hoyCaracas(), 30));
  const [data, setData] = useState<Historial | null>(null);
  const [fecha, setFecha] = useState(() => restarDias(hoyCaracas(), 30));
  const [foto, setFoto] = useState<Foto[] | null>(null);
  const [vista, setVista] = useState<Vista>("clientes");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pedir = useCallback(async (extra: Record<string, string>) => {
    const params = new URLSearchParams(extra);
    if (empresa) params.set("empresa", empresa);
    const res = await fetch(`/api/superadmin/cuentas-por-cobrar/sobregiro/historial?${params}`);
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || "No se pudo cargar el historial");
    return json.data;
  }, [empresa]);

  useEffect(() => {
    let vivo = true;
    setLoading(true);
    setError(null);
    pedir({ desde, hasta })
      .then((d) => vivo && setData(d))
      .catch((e) => vivo && (setError(e.message), setData(null)))
      .finally(() => vivo && setLoading(false));
    return () => { vivo = false; };
  }, [pedir, desde, hasta]);

  useEffect(() => {
    if (vista !== "fecha") return;
    let vivo = true;
    setFoto(null);
    pedir({ fecha })
      .then((d) => vivo && setFoto(d.clientes))
      .catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, [pedir, vista, fecha]);

  const q = busqueda.trim().toLowerCase();
  const coincide = (c: { cliente: string; rif?: string }) => !q || c.cliente.toLowerCase().includes(q) || (c.rif || "").toLowerCase().includes(q);
  const clientes = useMemo(() => (data?.clientes || []).filter(coincide), [data, q]);
  const cupos = useMemo(() => (data?.eventos || []).filter((e) => e.tipo === "cupo" && coincide(e)), [data, q]);
  const excesos = useMemo(() => (data?.eventos || []).filter((e) => e.tipo !== "cupo" && coincide(e)), [data, q]);
  const fotoFiltrada = useMemo(() => (foto || []).filter(coincide).sort((a, b) => (b.usado - b.limite) - (a.usado - a.limite)), [foto, q]);

  const exportar = () => {
    if (!data) return;
    descargarExcel(`Historial_credito_${empresa || "todas"}_${data.desde}_a_${data.hasta}`, [
      {
        nombre: "Por cliente",
        filas: data.clientes.map((c) => ({
          Cliente: c.cliente, Sede: c.sede, [`Cupo al ${dia(data.desde)}`]: c.limiteInicio ?? "", [`Cupo al ${dia(data.hasta)}`]: c.limiteFin ?? "",
          "Cambios de cupo": c.cambiosCupo, "Veces que se pasó": c.vecesExcedido, "Días excedido": c.diasExcedido, "Mayor exceso": c.mayorExceso,
        })),
      },
      {
        nombre: "Cambios de cupo",
        filas: data.eventos.filter((e) => e.tipo === "cupo").map((e) => ({
          "Cambiado en Odoo": fechaHora(e.cambiadoEl), "Visto por el panel": fechaHora(e.detectadoEl), Cliente: e.cliente, Sede: e.sede,
          "Cupo anterior": e.limiteAntes ?? "", "Cupo nuevo": e.limiteDespues ?? "", "Debía": e.usado ?? "", "Cambiado por": e.usuario || "",
        })),
      },
      {
        nombre: "Excesos",
        filas: data.eventos.filter((e) => e.tipo !== "cupo").map((e) => ({
          Fecha: fechaHora(e.detectadoEl), Cliente: e.cliente, Sede: e.sede,
          Evento: e.tipo === "excedio" ? "Se pasó del cupo" : "Volvió a estar dentro del cupo", Cupo: e.limiteDespues ?? "", "Debía": e.usado ?? "",
        })),
      },
    ]);
  };

  const r = data?.resumen;
  const vistas: { id: Vista; label: string; n?: number }[] = [
    { id: "clientes", label: "Por cliente", n: data?.clientes.length },
    { id: "cupos", label: "Cambios de cupo", n: r?.cambiosCupo },
    { id: "excesos", label: "Excesos", n: excesos.length },
    { id: "fecha", label: "Cupo en una fecha" },
  ];
  const sinDatos = data && !data.midiendoDesde;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {sinDatos
            ? "Todavía no hay fotos: el panel toma la primera en la próxima hora en punto. Desde ahí se miden los cambios."
            : data?.midiendoDesde
              ? `Medido cada hora desde el ${dia(data.midiendoDesde)}. Odoo no guarda la historia del cupo; lo anterior no se puede recuperar.`
              : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-600">
            <CalendarDays size={14} className="text-slate-400" />
            Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => e.target.value && setDesde(e.target.value)} className="outline-none bg-transparent" />
          </label>
          <label className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-sm text-slate-600">
            Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => e.target.value && setHasta(e.target.value)} className="outline-none bg-transparent" />
          </label>
          <button onClick={exportar} disabled={!data} className="flex items-center gap-1 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 hover:bg-emerald-100 disabled:opacity-50">
            <Download size={14} />
            Excel
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {loading && !data ? (
        <div className="py-20 text-center text-slate-400">Cargando historial…</div>
      ) : r ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Dato titulo="Veces que se pasaron" valor={r.vecesExcedido} detalle="Cada vez que un cliente pasó de estar dentro a estar por encima de su cupo" icono={AlertTriangle} tono="text-red-600" />
            <Dato titulo="Clientes que se pasaron" valor={r.clientesExcedidos} detalle="Estuvieron excedidos algún día del período" icono={Users} tono="text-amber-600" />
            <Dato titulo="Días-cliente excedidos" valor={r.diasClienteExcedido} detalle="Suma de los días que cada cliente estuvo por encima del cupo" icono={History} tono="text-orange-600" />
            <Dato titulo="Cambios de cupo" valor={r.cambiosCupo} detalle="Cupos subidos, bajados, puestos o quitados en Odoo" icono={Pencil} tono="text-blue-600" />
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-lg p-1" role="group" aria-label="Vista del historial">
                {vistas.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setVista(v.id)}
                    aria-pressed={vista === v.id}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${vista === v.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                  >
                    {v.label} {v.n != null && <span className="text-slate-400">({v.n})</span>}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {vista === "fecha" && (
                  <label className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-600">
                    Fecha
                    <input type="date" value={fecha} max={hoyCaracas()} onChange={(e) => e.target.value && setFecha(e.target.value)} className="outline-none bg-transparent" />
                  </label>
                )}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-2 py-1.5">
                  <Search size={14} className="text-slate-400" />
                  <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Cliente o RIF" aria-label="Buscar cliente" className="text-sm outline-none bg-transparent w-44" />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {vista === "clientes" && (
                <Tabla
                  cabeza={["Cliente", ...(mostrarSede ? ["Sede"] : []), `Cupo al ${dia(data!.desde)}`, `Cupo al ${dia(data!.hasta)}`, "Cambios de cupo", "Veces que se pasó", "Días excedido", "Mayor exceso"]}
                  vacio="Ningún cliente se pasó ni cambió de cupo en el período."
                  filas={clientes.map((c) => [
                    <span key="c" className="font-medium text-slate-800">{c.cliente}</span>,
                    ...(mostrarSede ? [c.sede] : []),
                    usd(c.limiteInicio), usd(c.limiteFin),
                    c.cambiosCupo || "—",
                    <span key="v" className={c.vecesExcedido ? "text-red-600 font-semibold" : "text-slate-400"}>{c.vecesExcedido || "—"}</span>,
                    <span key="d" className={c.diasExcedido ? "text-orange-600" : "text-slate-400"}>{c.diasExcedido || "—"}</span>,
                    <span key="m" className={c.mayorExceso ? "text-red-600" : "text-slate-400"}>{c.mayorExceso ? usd(c.mayorExceso) : "—"}</span>,
                  ])}
                />
              )}
              {vista === "cupos" && (
                <Tabla
                  cabeza={["Cambiado en Odoo", "Cliente", ...(mostrarSede ? ["Sede"] : []), "Cupo anterior", "Cupo nuevo", "Debía", "Cambiado por"]}
                  vacio="No hubo cambios de cupo en el período."
                  filas={cupos.map((e) => [
                    fechaHora(e.cambiadoEl || e.detectadoEl),
                    <span key="c" className="font-medium text-slate-800">{e.cliente}</span>,
                    ...(mostrarSede ? [e.sede] : []),
                    usd(e.limiteAntes),
                    <span key="n" className={(e.limiteDespues ?? 0) > (e.limiteAntes ?? 0) ? "text-emerald-700 font-semibold" : "text-red-600 font-semibold"}>{usd(e.limiteDespues)}</span>,
                    usd(e.usado),
                    e.usuario || "—",
                  ])}
                />
              )}
              {vista === "excesos" && (
                <Tabla
                  cabeza={["Fecha", "Cliente", ...(mostrarSede ? ["Sede"] : []), "Qué pasó", "Cupo", "Debía"]}
                  vacio="Ningún cliente se pasó ni volvió a su cupo en el período."
                  filas={excesos.map((e) => [
                    fechaHora(e.detectadoEl),
                    <span key="c" className="font-medium text-slate-800">{e.cliente}</span>,
                    ...(mostrarSede ? [e.sede] : []),
                    e.tipo === "excedio"
                      ? <span key="t" className="border rounded px-1.5 py-px text-xs bg-red-50 text-red-700 border-red-200">Se pasó</span>
                      : <span key="t" className="border rounded px-1.5 py-px text-xs bg-emerald-50 text-emerald-700 border-emerald-200">Volvió al cupo</span>,
                    usd(e.limiteDespues), usd(e.usado),
                  ])}
                />
              )}
              {vista === "fecha" && (
                foto == null ? <div className="py-10 text-center text-slate-400">Cargando…</div> : (
                  <Tabla
                    cabeza={["Cliente", ...(mostrarSede ? ["Sede"] : []), "Vendedor", "Cupo", "Debía", "Vencido", "Disponible", "Foto del"]}
                    vacio={data?.midiendoDesde && fecha < data.midiendoDesde ? `No hay fotos antes del ${dia(data.midiendoDesde)}.` : "No hay clientes con ese filtro."}
                    filas={fotoFiltrada.map((f) => [
                      <span key="c" className="font-medium text-slate-800">{f.cliente}</span>,
                      ...(mostrarSede ? [f.sede] : []),
                      f.vendedor || "—", f.limite > 0 ? usd(f.limite) : "—", usd(f.usado), usd(f.vencido),
                      <span key="d" className={f.limite > 0 && f.usado > f.limite ? "text-red-600 font-semibold" : "text-slate-500"}>{f.limite > 0 ? usd(f.limite - f.usado) : "—"}</span>,
                      dia(f.fecha),
                    ])}
                  />
                )
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Dato({ titulo, valor, detalle, icono: Icono, tono }: { titulo: string; valor: number; detalle: string; icono: any; tono: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">{titulo}</span>
        <Icono size={16} className={tono} />
      </div>
      <div className={`text-2xl font-bold mt-2 ${tono}`}>{valor.toLocaleString("es-VE")}</div>
      <div className="text-xs text-slate-500 mt-1">{detalle}</div>
    </div>
  );
}

function Tabla({ cabeza, filas, vacio }: { cabeza: string[]; filas: React.ReactNode[][]; vacio: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-100 text-left text-xs text-slate-400 uppercase tracking-wide">
          {cabeza.map((c, i) => <th key={c} className={`py-2 px-3 font-medium ${i === 0 ? "pl-0" : ""}`}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
            {f.map((v, j) => <td key={j} className={`py-2.5 px-3 text-slate-600 ${j === 0 ? "pl-0" : ""}`}>{v}</td>)}
          </tr>
        ))}
        {filas.length === 0 && (
          <tr><td colSpan={cabeza.length} className="py-10 text-center text-slate-400">{vacio}</td></tr>
        )}
      </tbody>
    </table>
  );
}
