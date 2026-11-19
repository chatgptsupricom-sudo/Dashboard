"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Aviso, EstadoCarga, Pestanas, Tarjeta, fechaCorta, money } from "@/components/administracion/comunes";
import { TablaReporte, type Columna } from "@/components/inteligencia-negocio/reportes/comunes";
import {
  claveVendedor,
  consolidar,
  type ClienteCupo,
  type Consolidado,
  type EstadoCupo,
  type GrupoCupo,
  type PuntoHistorico,
  type VendedorHistorico,
  type ZonaCupo,
} from "@/lib/cupo-credito/tipos";

/**
 * Cupo de crédito (lib/cupo-credito): cuánto del límite de crédito usa cada
 * cliente. El vendedor ve su cartera y su histórico; la gerencia comercial su
 * sede con el consolidado por vendedor (equipo) y por zona; la directiva
 * (SuperAdmin) y BI eligen sede.
 */

type Pestana = "clientes" | "vendedores" | "zonas" | "historico";

interface Respuesta {
  sedes: number[];
  soloCartera: boolean;
  eligeSede: boolean;
  utilizacionAlta: number;
  resumen: Consolidado;
  clientes: ClienteCupo[];
  vendedores: GrupoCupo[];
  zonas: ZonaCupo[];
  actualizado: string;
}

interface Historico {
  midiendoDesde: string | null;
  desde: string;
  hasta: string;
  fechas: string[];
  total: PuntoHistorico[];
  vendedores: VendedorHistorico[];
  soloCartera: boolean;
}

const ESTADOS: Record<EstadoCupo, { label: string; chip: string; barra: string }> = {
  excedido: { label: "Excedido", chip: "bg-red-50 text-red-700 border-red-200", barra: "bg-red-500" },
  al_limite: { label: "Al límite", chip: "bg-amber-50 text-amber-700 border-amber-200", barra: "bg-amber-500" },
  en_uso: { label: "En uso", chip: "bg-emerald-50 text-emerald-700 border-emerald-200", barra: "bg-emerald-500" },
  sin_uso: { label: "Sin uso", chip: "bg-slate-50 text-slate-600 border-slate-200", barra: "bg-slate-300" },
  sin_limite: { label: "Sin límite", chip: "bg-violet-50 text-violet-700 border-violet-200", barra: "bg-violet-400" },
};

const SEDES = [
  { value: "todas", label: "Todas las sedes" },
  { value: "9", label: "Valencia" },
  { value: "10", label: "Caracas" },
  { value: "7", label: "Panamá" },
];

const PERIODOS = [
  { dias: 30, label: "30 días" },
  { dias: 90, label: "90 días" },
  { dias: 180, label: "6 meses" },
  { dias: 365, label: "1 año" },
];

const pct = (n: number | null | undefined) =>
  n == null ? "—" : `${n.toLocaleString("es-VE", { maximumFractionDigits: 1 })}%`;

function tonoUso(usoPct: number | null, alta: number) {
  if (usoPct == null) return "bg-slate-300";
  if (usoPct > 100) return "bg-red-500";
  if (usoPct >= alta) return "bg-amber-500";
  return "bg-emerald-500";
}

function BarraUso({ usoPct, alta }: { usoPct: number | null; alta: number }) {
  if (usoPct == null) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="w-16 sm:w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${tonoUso(usoPct, alta)}`} style={{ width: `${Math.max(0, Math.min(usoPct, 100))}%` }} />
      </div>
      <span className={`w-12 text-right font-semibold ${usoPct > 100 ? "text-red-600" : usoPct >= alta ? "text-amber-600" : "text-slate-600"}`}>
        {pct(usoPct)}
      </span>
    </div>
  );
}

const hoyCaracas = () => new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 10);
const restarDias = (s: string, n: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const diaCorto = (s: string) => s.slice(8, 10) + "/" + s.slice(5, 7);

/** Columnas comunes de un consolidado (vendedor o zona). */
function columnasConsolidado<T extends GrupoCupo>(titulo: string, alta: number): Columna<T & { usoOrden: number }>[] {
  return [
    { clave: "nombre", titulo },
    { clave: "conLimite", titulo: "Clientes con cupo", tipo: "numero", sumar: true },
    { clave: "limite", titulo: "Cupo asignado", tipo: "dinero", sumar: true },
    { clave: "usado", titulo: "Usado", tipo: "dinero", sumar: true },
    { clave: "disponible", titulo: "Disponible", tipo: "dinero", sumar: true },
    {
      clave: "usoOrden",
      titulo: "Uso",
      tipo: "porcentaje",
      mostrar: (f) => <BarraUso usoPct={f.usoPct} alta={alta} />,
      excel: (f) => f.usoPct,
    },
    {
      clave: "excedidos",
      titulo: "Excedidos",
      tipo: "numero",
      sumar: true,
      mostrar: (f) => (f.excedidos ? <span className="text-red-600 font-semibold">{f.excedidos}</span> : <span className="text-slate-300">—</span>),
    },
    { clave: "montoExcedido", titulo: "Monto excedido", tipo: "dinero", sumar: true },
    { clave: "alLimite", titulo: `Al límite (≥ ${alta}%)`, tipo: "numero", sumar: true },
    { clave: "vencido", titulo: "Vencido", tipo: "dinero", sumar: true },
    { clave: "sinLimite", titulo: "Deben sin cupo", tipo: "numero", sumar: true },
    { clave: "usadoSinLimite", titulo: "Deuda sin cupo", tipo: "dinero", sumar: true },
  ];
}

/** Uso de los totales de la tabla (lo filtrado): usado ÷ cupo, no el promedio de los %. */
const pieUso = <T extends Consolidado>(alta: number) => (visibles: T[]) => {
  const limite = visibles.reduce((s, f) => s + f.limite, 0);
  const usado = visibles.reduce((s, f) => s + f.usado, 0);
  return { usoOrden: <BarraUso usoPct={limite > 0 ? (usado / limite) * 100 : null} alta={alta} /> } as any;
};

export default function PantallaCupo() {
  const [sede, setSede] = useState("todas");
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [pestana, setPestana] = useState<Pestana>("clientes");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | EstadoCupo>("todos");
  const [vendedor, setVendedor] = useState("");

  const cargar = useCallback(
    async (refrescar = false) => {
      setCargando(true);
      setError(null);
      try {
        const params = new URLSearchParams({ sede });
        if (refrescar) params.set("refrescar", "1");
        const res = await fetch(`/api/cupo-credito?${params}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          setError({ mensaje: json.error || "No se pudo cargar el cupo de crédito", odooCaido: !!json.odooCaido });
          setData(null);
        } else setData(json.data);
      } catch {
        setError({ mensaje: "No se pudo conectar con el panel", odooCaido: false });
      } finally {
        setCargando(false);
      }
    },
    [sede],
  );

  useEffect(() => { cargar(); }, [cargar]);

  const alta = data?.utilizacionAlta ?? 80;
  const variasSedes = (data?.sedes.length ?? 0) > 1;
  const soloCartera = !!data?.soloCartera;

  const clientesFiltrados = useMemo(() => {
    const lista = data?.clientes || [];
    return lista
      .filter((c) => (filtroEstado === "todos" ? true : c.estado === filtroEstado) && (!vendedor || claveVendedor(c) === vendedor))
      .map((c) => ({ ...c, estadoTexto: ESTADOS[c.estado].label, zonaTexto: c.zona || "Sin ubicar", usoOrden: c.usoPct ?? -1 }));
  }, [data, filtroEstado, vendedor]);

  // Tarjetas: del vendedor elegido (gerencia) o de todo lo que ve.
  const resumen = useMemo(() => {
    if (!data) return null;
    return vendedor ? consolidar(data.clientes.filter((c) => claveVendedor(c) === vendedor)) : data.resumen;
  }, [data, vendedor]);

  const opcionesVendedor = useMemo(() => (data?.vendedores || []).map((v) => ({ clave: v.clave, nombre: v.nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [data]);

  const conteo = (e: EstadoCupo) => (data?.clientes || []).filter((c) => c.estado === e && (!vendedor || claveVendedor(c) === vendedor)).length;

  const columnasClientes: Columna<(typeof clientesFiltrados)[number]>[] = [
    {
      clave: "cliente",
      titulo: "Cliente",
      mostrar: (c) => (
        <div className="min-w-[180px] max-w-[300px]">
          <div className="font-medium text-slate-800 truncate" title={c.cliente}>{c.cliente}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            {c.rif && <span>{c.rif}</span>}
            {c.plazo && <span>· {c.plazo}</span>}
            <span className={`border rounded px-1.5 py-px ${ESTADOS[c.estado].chip}`}>{ESTADOS[c.estado].label}</span>
          </div>
        </div>
      ),
    },
    { clave: "rif", titulo: "RIF", soloExcel: true },
    { clave: "plazo", titulo: "Plazo de pago", soloExcel: true },
    { clave: "estadoTexto", titulo: "Estado", soloExcel: true },
    ...(variasSedes ? [{ clave: "sede" as const, titulo: "Sede" }] : []),
    ...(soloCartera ? [] : [{ clave: "vendedor" as const, titulo: "Vendedor" }]),
    { clave: "zonaTexto", titulo: "Zona" },
    { clave: "ciudad", titulo: "Ciudad", soloExcel: true },
    { clave: "limite", titulo: "Cupo", tipo: "dinero", sumar: true, mostrar: (c) => (c.limite > 0 ? money(c.limite, 2) : <span className="text-slate-300">—</span>) },
    { clave: "usado", titulo: "Usado", tipo: "dinero", sumar: true },
    {
      clave: "disponible",
      titulo: "Disponible",
      tipo: "dinero",
      mostrar: (c) =>
        c.limite > 0 ? <span className={c.disponible < 0 ? "text-red-600 font-semibold" : ""}>{money(c.disponible, 2)}</span> : <span className="text-slate-300">—</span>,
    },
    { clave: "usoOrden", titulo: "Uso", tipo: "porcentaje", mostrar: (c) => <BarraUso usoPct={c.usoPct} alta={alta} />, excel: (c) => c.usoPct },
    { clave: "excedido", titulo: "Excedido", tipo: "dinero", sumar: true },
    { clave: "vencido", titulo: "Vencido", tipo: "dinero", sumar: true },
    { clave: "diasVencido", titulo: "Días vencido", tipo: "numero" },
  ];

  const filtrosEstado: { id: "todos" | EstadoCupo; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "excedido", label: "Excedidos" },
    { id: "al_limite", label: "Al límite" },
    { id: "en_uso", label: "En uso" },
    { id: "sin_uso", label: "Sin uso" },
    { id: "sin_limite", label: "Deben sin cupo" },
  ];

  const pestanas: { value: Pestana; label: string }[] = [
    { value: "clientes", label: soloCartera ? "Mis clientes" : "Por cliente" },
    ...(soloCartera ? [] : [
      { value: "vendedores" as const, label: "Por vendedor (equipo)" },
      { value: "zonas" as const, label: "Por zona" },
    ]),
    { value: "historico", label: "Histórico" },
  ];

  const nombreVendedor = opcionesVendedor.find((v) => v.clave === vendedor)?.nombre;

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto tabular-nums space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Cupo de crédito</h1>
          <p className="text-sm text-slate-500 mt-1">
            {soloCartera
              ? "Cuánto usa cada cliente de tu cartera de su límite de crédito"
              : "Consumo del límite de crédito por cliente, por vendedor y por zona"}
            {data && <span className="ml-2 text-slate-400">· Actualizado {new Date(data.actualizado).toLocaleTimeString("es-VE")}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data?.eligeSede && (
            <select value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede" className="h-9 text-sm bg-white border border-slate-200 rounded-md px-2 text-slate-700">
              {SEDES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
          {!soloCartera && opcionesVendedor.length > 0 && pestana !== "historico" && (
            <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Vendedor" className="h-9 text-sm bg-white border border-slate-200 rounded-md px-2 text-slate-700 max-w-[220px]">
              <option value="">Todo el equipo</option>
              {opcionesVendedor.map((v) => <option key={v.clave} value={v.clave}>{v.nombre}</option>)}
            </select>
          )}
          {pestana !== "historico" && (
            <Button variant="outline" size="sm" className="h-9" onClick={() => cargar(true)} disabled={cargando}>
              <RefreshCw className={`h-4 w-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
              Actualizar
            </Button>
          )}
        </div>
      </div>

      <Pestanas opciones={pestanas} valor={pestana} onChange={setPestana} />

      {pestana === "historico" ? (
        <HistoricoCupo sede={sede} alta={alta} soloCartera={soloCartera} />
      ) : (
        <>
          <EstadoCarga cargando={cargando && !data} error={error} texto="Leyendo los límites de crédito de Odoo..." />
          {data && resumen && (
            <>
              {nombreVendedor && (
                <Aviso tono="azul">
                  Viendo la cartera de <strong>{nombreVendedor}</strong>.{" "}
                  <button className="underline" onClick={() => setVendedor("")}>Ver todo el equipo</button>
                </Aviso>
              )}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Tarjeta
                  titulo="Uso del cupo"
                  valor={pct(resumen.usoPct)}
                  detalle={`${money(resumen.usado, 0)} de ${money(resumen.limite, 0)} · ${resumen.conLimite} clientes con cupo`}
                  tono={resumen.usoPct != null && resumen.usoPct >= alta ? "ambar" : "azul"}
                />
                <Tarjeta titulo="Disponible" valor={money(resumen.disponible, 0)} detalle="Cupo asignado − usado" tono="verde" />
                <Tarjeta
                  titulo="Excedidos"
                  valor={resumen.excedidos}
                  detalle={`${money(resumen.montoExcedido, 0)} por encima del cupo`}
                  tono={resumen.excedidos ? "rojo" : "neutro"}
                />
                <Tarjeta titulo={`Al límite (≥ ${alta}%)`} valor={resumen.alLimite} detalle="Todavía no se pasan" tono={resumen.alLimite ? "ambar" : "neutro"} />
                <Tarjeta
                  titulo="Deben sin cupo"
                  valor={resumen.sinLimite}
                  detalle={`${money(resumen.usadoSinLimite, 0)} sin límite en Odoo · vencido total ${money(resumen.vencido, 0)}`}
                />
              </div>

              {pestana === "clientes" && (
                <>
                  <div className="flex flex-wrap items-center gap-1 bg-slate-100 rounded-lg p-1 w-fit" role="group" aria-label="Estado">
                    {filtrosEstado.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => setFiltroEstado(f.id)}
                        aria-pressed={filtroEstado === f.id}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${filtroEstado === f.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                      >
                        {f.label} {f.id !== "todos" && <span className="text-slate-400">({conteo(f.id)})</span>}
                      </button>
                    ))}
                  </div>
                  <TablaReporte
                    filas={clientesFiltrados}
                    columnas={columnasClientes}
                    buscarEn={(c) => `${c.cliente} ${c.rif} ${c.vendedor} ${c.zona} ${c.ciudad}`}
                    filtros={[
                      ...(variasSedes ? [{ clave: "sede" as const, titulo: "Sede" }] : []),
                      { clave: "zonaTexto" as const, titulo: "Zona" },
                    ]}
                    archivo={`Cupo_credito_clientes_${hoyCaracas()}`}
                    ordenInicial={{ clave: "usoOrden", desc: true }}
                  />
                </>
              )}

              {pestana === "vendedores" && (
                <>
                  <p className="text-xs text-slate-500">
                    Cada vendedor con la suma de su cartera. El uso es lo usado ÷ el cupo asignado de sus clientes con cupo
                    (un saldo a favor de un cliente no libera el cupo de otro). Toca un vendedor para ver sus clientes.
                  </p>
                  <TablaReporte
                    filas={data.vendedores.map((v) => ({ ...v, usoOrden: v.usoPct ?? -1 }))}
                    columnas={columnasConsolidado<GrupoCupo>("Vendedor", alta).map((c) =>
                      c.clave === "nombre"
                        ? {
                            ...c,
                            mostrar: (f: GrupoCupo) => (
                              <button
                                className="text-left font-medium text-blue-700 hover:underline"
                                onClick={() => { setVendedor(f.clave); setFiltroEstado("todos"); setPestana("clientes"); }}
                              >
                                {f.nombre}
                              </button>
                            ),
                          }
                        : c,
                    )}
                    buscarEn={(v) => v.nombre}
                    archivo={`Cupo_credito_vendedores_${hoyCaracas()}`}
                    ordenInicial={{ clave: "usoOrden", desc: true }}
                    pie={pieUso(alta)}
                  />
                </>
              )}

              {pestana === "zonas" && <ZonasCupo zonas={data.zonas} alta={alta} vendedor={vendedor} clientes={data.clientes} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ZonasCupo({ zonas: todas, alta, vendedor, clientes }: { zonas: ZonaCupo[]; alta: number; vendedor: string; clientes: ClienteCupo[] }) {
  const [abierta, setAbierta] = useState<string | null>(null);
  // Con un vendedor elegido, sus zonas (se arman igual que en el servidor).
  const zonas = useMemo(() => {
    if (!vendedor) return todas;
    const suyos = clientes.filter((c) => claveVendedor(c) === vendedor);
    const nombres = new Set(suyos.map((c) => c.zona || "Sin ubicar"));
    return todas
      .filter((z) => nombres.has(z.nombre))
      .map((z) => ({ ...z, ...consolidar(suyos.filter((c) => (c.zona || "Sin ubicar") === z.nombre)), ciudades: [] }));
  }, [todas, vendedor, clientes]);

  const grafico = zonas
    .filter((z) => z.limite > 0 || z.usado > 0)
    .slice(0, 15)
    .map((z) => ({ zona: z.nombre, Usado: Math.min(z.usado, z.limite), Excedido: Math.max(0, z.usado - z.limite), Disponible: Math.max(0, z.disponible) }));

  const filas = zonas.map((z) => ({ ...z, usoOrden: z.usoPct ?? -1 }));
  const zonaAbierta = zonas.find((z) => z.clave === abierta);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-sm font-medium text-slate-700 mb-1">Cupo por zona (las 15 con más uso)</p>
          <p className="text-xs text-slate-500 mb-3">Zona = estado del cliente en Odoo. Los clientes sin estado van en «Sin ubicar».</p>
          {grafico.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center">Sin clientes con cupo.</p>
          ) : (
            <div style={{ height: Math.max(220, grafico.length * 30 + 60) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafico} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => money(v, 0)} fontSize={11} />
                  <YAxis type="category" dataKey="zona" width={120} fontSize={11} />
                  <Tooltip formatter={(v: number) => money(v, 2)} />
                  <Legend />
                  <Bar dataKey="Usado" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="Excedido" stackId="a" fill="#ef4444" />
                  <Bar dataKey="Disponible" stackId="a" fill="#cbd5e1" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <TablaReporte
        filas={filas}
        columnas={columnasConsolidado<ZonaCupo>("Zona", alta).map((c) =>
          c.clave === "nombre" && !vendedor
            ? {
                ...c,
                mostrar: (f: ZonaCupo) => (
                  <button className="text-left font-medium text-blue-700 hover:underline" onClick={() => setAbierta(abierta === f.clave ? null : f.clave)}>
                    {f.nombre}
                  </button>
                ),
              }
            : c,
        )}
        buscarEn={(z) => `${z.nombre} ${z.ciudades.map((c) => c.nombre).join(" ")}`}
        archivo={`Cupo_credito_zonas_${hoyCaracas()}`}
        ordenInicial={{ clave: "usado", desc: true }}
        pie={pieUso(alta)}
      />

      {zonaAbierta && zonaAbierta.ciudades.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Ciudades de {zonaAbierta.nombre} con más uso</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b">
                  <th className="text-left py-1.5">Ciudad</th>
                  <th className="text-right py-1.5">Clientes con cupo</th>
                  <th className="text-right py-1.5">Cupo</th>
                  <th className="text-right py-1.5">Usado</th>
                  <th className="text-right py-1.5">Uso</th>
                </tr>
              </thead>
              <tbody>
                {zonaAbierta.ciudades.map((c) => (
                  <tr key={c.nombre} className="border-b border-slate-50">
                    <td className="py-1.5">{c.nombre}</td>
                    <td className="py-1.5 text-right">{c.clientes}</td>
                    <td className="py-1.5 text-right">{money(c.limite, 2)}</td>
                    <td className="py-1.5 text-right">{money(c.usado, 2)}</td>
                    <td className="py-1.5"><BarraUso usoPct={c.limite > 0 ? (c.usado / c.limite) * 100 : null} alta={alta} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function HistoricoCupo({ sede, alta, soloCartera }: { sede: string; alta: number; soloCartera: boolean }) {
  const [dias, setDias] = useState(90);
  const [data, setData] = useState<Historico | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ mensaje: string; odooCaido: boolean } | null>(null);
  const [vendedor, setVendedor] = useState("");

  useEffect(() => {
    let vigente = true;
    (async () => {
      setCargando(true);
      setError(null);
      try {
        const hasta = hoyCaracas();
        const params = new URLSearchParams({ sede, desde: restarDias(hasta, dias - 1), hasta });
        const res = await fetch(`/api/cupo-credito/historico?${params}`);
        const json = await res.json();
        if (!vigente) return;
        if (!res.ok || !json.success) {
          setError({ mensaje: json.error || "No se pudo cargar el histórico", odooCaido: false });
          setData(null);
        } else setData(json.data);
      } catch {
        if (vigente) setError({ mensaje: "No se pudo conectar con el panel", odooCaido: false });
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => { vigente = false; };
  }, [sede, dias]);

  const elegido = data?.vendedores.find((v) => v.clave === vendedor);
  const serie = elegido ? elegido.serie : data?.total || [];
  const primero = serie.find((p) => p.usoPct != null);
  const ultimo = [...serie].reverse().find((p) => p.usoPct != null);
  const cambio = primero && ultimo ? (ultimo.usoPct as number) - (primero.usoPct as number) : null;
  const diasConExcedidos = serie.filter((p) => p.excedidos > 0).length;
  const conUso = serie.filter((p) => p.usoPct != null);
  const promedio = conUso.length ? conUso.reduce((s, p) => s + (p.usoPct as number), 0) / conUso.length : null;

  const filasVend = (data?.vendedores || []).map((v) => ({
    ...v,
    usoInicio: v.inicio?.usoPct ?? null,
    usoFin: v.fin?.usoPct ?? null,
    usadoFin: v.fin?.usado ?? null,
    limiteFin: v.fin?.limite ?? null,
    excedidosFin: v.fin?.excedidos ?? null,
  }));
  type FilaVend = (typeof filasVend)[number];
  const columnasVend: Columna<FilaVend>[] = [
    {
      clave: "nombre",
      titulo: "Vendedor",
      mostrar: (v) => (
        <button className={`text-left font-medium hover:underline ${vendedor === v.clave ? "text-blue-800" : "text-blue-700"}`} onClick={() => setVendedor(vendedor === v.clave ? "" : v.clave)}>
          {v.nombre}
        </button>
      ),
    },
    { clave: "usoInicio", titulo: "Uso al inicio", tipo: "porcentaje", mostrar: (v) => pct(v.usoInicio) },
    { clave: "usoFin", titulo: "Uso al final", tipo: "porcentaje", mostrar: (v) => <BarraUso usoPct={v.usoFin} alta={alta} />, excel: (v) => v.usoFin },
    {
      clave: "cambioPts",
      titulo: "Cambio (pts)",
      tipo: "numero",
      mostrar: (v) =>
        v.cambioPts == null ? <span className="text-slate-300">—</span> : (
          <span className={v.cambioPts > 0 ? "text-red-600" : v.cambioPts < 0 ? "text-emerald-600" : "text-slate-500"}>
            {v.cambioPts > 0 ? "+" : ""}{v.cambioPts.toLocaleString("es-VE", { maximumFractionDigits: 1 })}
          </span>
        ),
    },
    { clave: "usoPromedio", titulo: "Uso promedio", tipo: "porcentaje", mostrar: (v) => pct(v.usoPromedio) },
    { clave: "limiteFin", titulo: "Cupo al final", tipo: "dinero", sumar: true },
    { clave: "usadoFin", titulo: "Usado al final", tipo: "dinero", sumar: true },
    { clave: "excedidosFin", titulo: "Excedidos al final", tipo: "numero", sumar: true },
    { clave: "diasConExcedidos", titulo: "Días con excedidos", tipo: "numero" },
    { clave: "maxExcedidos", titulo: "Máx. excedidos en un día", tipo: "numero" },
  ];

  const grafico = serie.map((p) => ({
    fecha: p.fecha,
    "Uso %": p.usoPct,
    Usado: p.usado,
    Cupo: p.limite,
    Excedidos: p.excedidos,
    "Al límite": p.alLimite,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              onClick={() => setDias(p.dias)}
              aria-pressed={dias === p.dias}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${dias === p.dias ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {!soloCartera && (data?.vendedores.length ?? 0) > 0 && (
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} aria-label="Vendedor" className="h-8 text-sm bg-white border border-slate-200 rounded-md px-2 text-slate-700 max-w-[220px]">
            <option value="">Todo el equipo</option>
            {[...(data?.vendedores || [])].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((v) => (
              <option key={v.clave} value={v.clave}>{v.nombre}</option>
            ))}
          </select>
        )}
      </div>

      <EstadoCarga cargando={cargando && !data} error={error} texto="Leyendo el histórico..." />

      {data && (
        <>
          {data.midiendoDesde ? (
            data.midiendoDesde > data.desde && (
              <Aviso tono="azul">
                El panel guarda el cupo de cada cliente desde el {fechaCorta(data.midiendoDesde)} (Odoo no guarda la historia del
                límite de crédito): antes de esa fecha no hay datos.
              </Aviso>
            )
          ) : (
            <Aviso>Todavía no hay fotos del cupo guardadas. El panel las toma cada hora.</Aviso>
          )}

          {serie.length > 0 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tarjeta titulo={elegido ? `Uso hoy · ${elegido.nombre}` : "Uso al final del período"} valor={pct(ultimo?.usoPct)} detalle={ultimo ? `${money(ultimo.usado, 0)} de ${money(ultimo.limite, 0)}` : undefined} tono="azul" />
                <Tarjeta
                  titulo="Cambio en el período"
                  valor={cambio == null ? "—" : `${cambio > 0 ? "+" : ""}${cambio.toLocaleString("es-VE", { maximumFractionDigits: 1 })} pts`}
                  detalle={primero ? `Empezó en ${pct(primero.usoPct)} el ${fechaCorta(primero.fecha)}` : undefined}
                  tono={cambio != null && cambio > 0 ? "ambar" : "verde"}
                />
                <Tarjeta titulo="Uso promedio" valor={pct(promedio)} detalle={`${serie.length} días con foto`} />
                <Tarjeta titulo="Días con clientes excedidos" valor={diasConExcedidos} detalle={`Máximo ${serie.reduce((m, p) => Math.max(m, p.excedidos), 0)} excedidos en un día`} tono={diasConExcedidos ? "rojo" : "neutro"} />
              </div>

              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Cupo, usado y % de uso por día{elegido ? ` · ${elegido.nombre}` : ""}</p>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={grafico} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="fecha" tickFormatter={diaCorto} fontSize={11} minTickGap={20} />
                        <YAxis yAxisId="m" tickFormatter={(v) => money(v, 0)} fontSize={11} width={80} />
                        <YAxis yAxisId="p" orientation="right" tickFormatter={(v) => `${v}%`} fontSize={11} width={45} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} />
                        <Tooltip
                          labelFormatter={(l) => fechaCorta(String(l))}
                          formatter={(v: number, n: string) => (n === "Uso %" ? pct(v) : money(v, 2))}
                        />
                        <Legend />
                        <Area yAxisId="m" type="monotone" dataKey="Cupo" stroke="#94a3b8" fill="#e2e8f0" fillOpacity={0.5} />
                        <Area yAxisId="m" type="monotone" dataKey="Usado" stroke="#3b82f6" fill="#bfdbfe" fillOpacity={0.6} />
                        <Line yAxisId="p" type="monotone" dataKey="Uso %" stroke="#f59e0b" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium text-slate-700 mb-3">Clientes excedidos y al límite por día</p>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={grafico} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="fecha" tickFormatter={diaCorto} fontSize={11} minTickGap={20} />
                        <YAxis allowDecimals={false} fontSize={11} width={40} />
                        <Tooltip labelFormatter={(l) => fechaCorta(String(l))} />
                        <Legend />
                        <Bar dataKey="Excedidos" stackId="e" fill="#ef4444" />
                        <Bar dataKey="Al límite" stackId="e" fill="#f59e0b" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {!soloCartera && filasVend.length > 0 && (
            <>
              <p className="text-xs text-slate-500">
                Cómo cambió el uso del cupo de la cartera de cada vendedor entre el primer y el último día del período. Toca
                un vendedor para ver su curva.
              </p>
              <TablaReporte
                filas={filasVend}
                columnas={columnasVend}
                buscarEn={(v) => v.nombre}
                archivo={`Cupo_credito_historico_${data.desde}_${data.hasta}`}
                ordenInicial={{ clave: "usoFin", desc: true }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
