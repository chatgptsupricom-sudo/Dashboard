"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  AlertTriangle,
  Banknote,
  ChevronDown,
  ChevronRight,
  Loader2,
  Receipt,
  TrendingDown,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertaAdmin,
  EstatusAlerta,
  SeguimientoAlerta,
  aplicarSeguimiento,
  construirTopAlertas,
} from "@/lib/administracion/alertas";

type Semaforo = "verde" | "amarillo" | "rojo" | "sin_datos";

interface Kpi {
  id: string;
  numero: number;
  nombre: string;
  formula: string;
  peso: number;
  metaTexto: string;
  valor: number | null;
  unidad: string;
  semaforo: Semaforo;
  puntos: number;
  puntosMax: number;
  responsable: string;
  detalle?: string;
}

interface Categoria {
  categoria: string;
  puntos: number;
  puntosMax: number;
  puntosMaxEvaluables: number;
  kpis: Kpi[];
}

interface Respuesta {
  success: boolean;
  categorias: Categoria[];
  alertas: AlertaAdmin[];
  detalle: {
    cxc: {
      totalCartera: number;
      corriente: number;
      vencido: number;
      bandas: { nombre: string; monto: number }[];
      topDeudores: { cliente: string; monto: number; diasVencido: number }[];
    };
    tesoreria: {
      disponible: number;
      retenciones: number;
      porCuenta: { nombre: string; saldo: number }[];
    };
    cxp: {
      totalCxP: number;
      saldoVencido: number;
      montoProximas30: number;
      vencidas: { proveedor: string; vencimiento: string; monto: number }[];
    };
  };
}

/** Lo que la pagina necesita de /api/administracion/gastos (issue #8). */
interface RespuestaGastos {
  success: boolean;
  resumen: Categoria;
  alertas: AlertaAdmin[];
}

const SEMAFORO: Record<Semaforo, string> = {
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amarillo: "bg-amber-50 text-amber-700 border-amber-200",
  rojo: "bg-red-50 text-red-700 border-red-200",
  sin_datos: "bg-slate-50 text-slate-500 border-slate-200",
};

const ICONO_CATEGORIA: Record<string, any> = {
  "Cuentas por Cobrar": TrendingDown,
  "Tesorería y Liquidez": Banknote,
  "Cuentas por Pagar": Wallet,
  "Gastos y Presupuesto": Receipt,
};

const CATEGORIA_GASTOS = "Gastos y Presupuesto";

/**
 * El documento de Administracion pondera 100 puntos en 6 areas. Hoy solo 4
 * tienen fuente de datos (65 financieros + 15 de gastos); Gestion
 * Administrativa y Cumplimiento y Control suman 20 puntos que ningun sistema
 * registra todavia (ver issue #8). Se declaran aqui para que la pagina diga
 * sobre que se esta calculando en vez de aparentar un 100 completo.
 */
const PUNTOS_DOCUMENTO = 100;
const AREAS_SIN_FUENTE = [
  { nombre: "Gestión Administrativa", puntos: 10 },
  { nombre: "Cumplimiento y Control", puntos: 10 },
];

const ETIQUETA_ESTATUS: Record<EstatusAlerta, string> = {
  abierta: "Abierta",
  en_proceso: "En proceso",
  cerrada: "Cerrada",
};

const COLOR_ESTATUS: Record<EstatusAlerta, string> = {
  abierta: "bg-red-50 text-red-700 border-red-200",
  en_proceso: "bg-amber-50 text-amber-700 border-amber-200",
  cerrada: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

const SEDES = [
  { value: "", label: "Todas las sedes" },
  { value: "valencia", label: "Valencia" },
  { value: "caracas", label: "Caracas" },
  { value: "panama", label: "Panamá" },
];

function money(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function meses() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("es-VE", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

/** Sin `new Date(iso)`, que en YYYY-MM-DD se interpreta en UTC y puede
 *  mostrar el dia anterior segun la zona horaria. */
function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : "—";
}

/**
 * Una fila del Top 10. Estatus y fecha compromiso se guardan en cuanto se
 * cambian (no hay boton de guardar): son dos campos sueltos y un formulario
 * con confirmacion para cada alerta seria mas friccion que valor.
 */
function FilaAlerta({
  alerta,
  guardando,
  onCambio,
}: {
  alerta: AlertaAdmin;
  guardando: boolean;
  onCambio: (cambios: {
    estatus?: EstatusAlerta;
    fechaCompromiso?: string | null;
  }) => void;
}) {
  const vencido =
    alerta.fechaCompromiso !== null &&
    alerta.estatus !== "cerrada" &&
    alerta.fechaCompromiso < new Date().toISOString().slice(0, 10);

  return (
    <TableRow className={guardando ? "opacity-60" : undefined}>
      {/* whitespace-normal: TableCell trae whitespace-nowrap por defecto, asi
          que sin esto el texto largo de la alerta no envuelve. */}
      <TableCell className="px-4 whitespace-normal align-top">
        <div className="max-w-[220px] sm:max-w-[380px] lg:max-w-none">
          <div className="font-medium text-sm break-words">{alerta.titulo}</div>
          <div className="text-xs text-gray-500 break-words">{alerta.accion}</div>
          {/* En pantallas chicas estas columnas se ocultan; se repiten aca
              para no perder los campos que la propuesta exige mostrar. */}
          <div className="text-[11px] text-gray-400 mt-1 lg:hidden">
            {alerta.area} · {alerta.responsable} ·{" "}
            {fechaCorta(alerta.fechaDeteccion)}
          </div>
          {alerta.actualizadoPor && (
            <div className="text-[11px] text-gray-400 mt-0.5">
              Seguimiento: {alerta.actualizadoPor}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-gray-600 hidden md:table-cell align-top">
        {alerta.area}
      </TableCell>
      <TableCell className="text-sm text-gray-600 hidden lg:table-cell align-top">
        {alerta.responsable}
      </TableCell>
      <TableCell className="text-right font-semibold align-top">
        {alerta.montoAfectado ? money(alerta.montoAfectado) : "—"}
      </TableCell>
      <TableCell className="text-sm text-gray-600 hidden xl:table-cell align-top">
        {fechaCorta(alerta.fechaDeteccion)}
      </TableCell>
      <TableCell className="align-top">
        <input
          type="date"
          value={alerta.fechaCompromiso ?? ""}
          disabled={guardando}
          onChange={(e) =>
            onCambio({ fechaCompromiso: e.target.value || null })
          }
          className={`border rounded-lg px-2 py-1 text-xs ${
            vencido ? "border-red-300 text-red-700 bg-red-50" : ""
          }`}
        />
        {vencido && (
          <div className="text-[11px] text-red-600 mt-0.5">Vencida</div>
        )}
      </TableCell>
      <TableCell className="pr-4 align-top">
        <select
          value={alerta.estatus}
          disabled={guardando}
          onChange={(e) =>
            onCambio({ estatus: e.target.value as EstatusAlerta })
          }
          className={`border rounded-lg px-2 py-1 text-xs ${COLOR_ESTATUS[alerta.estatus]}`}
        >
          {(Object.keys(ETIQUETA_ESTATUS) as EstatusAlerta[]).map((e) => (
            <option key={e} value={e}>
              {ETIQUETA_ESTATUS[e]}
            </option>
          ))}
        </select>
      </TableCell>
    </TableRow>
  );
}

export default function SaludAdministrativaPage() {
  const locale = usePathname().split("/")[1] || "es";
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<Respuesta | null>(null);
  const [gastos, setGastos] = useState<RespuestaGastos | null>(null);
  const [seguimientos, setSeguimientos] = useState<
    Record<string, SeguimientoAlerta>
  >({});
  const [guardando, setGuardando] = useState<string | null>(null);
  const [verCerradas, setVerCerradas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState<string | null>("Cuentas por Cobrar");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resFin, resGastos, resSeg] = await Promise.all([
        fetch(`/api/administracion/salud-financiera?empresa=${empresa}&mes=${mes}`),
        fetch(`/api/administracion/gastos?empresa=${empresa}&mes=${mes}`),
        fetch(`/api/administracion/alertas?empresa=${empresa}&mes=${mes}`),
      ]);
      const [jFin, jGastos, jSeg] = await Promise.all([
        resFin.json(),
        resGastos.json(),
        resSeg.json(),
      ]);
      setData(jFin.success ? jFin : null);
      // Gastos y el seguimiento son complementarios: si alguno falla se sigue
      // mostrando el indice con lo que si cargo, en vez de dejar la pagina en
      // blanco por un area caida.
      setGastos(jGastos.success ? jGastos : null);
      setSeguimientos(jSeg.success ? jSeg.seguimientos : {});
    } catch {
      setData(null);
      setGastos(null);
      setSeguimientos({});
    }
    setLoading(false);
  }, [empresa, mes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Indice general: las 3 areas financieras (65 pts) + Gastos (15 pts)
  const categorias = useMemo<Categoria[]>(() => {
    if (!data) return [];
    return gastos ? [...data.categorias, gastos.resumen] : data.categorias;
  }, [data, gastos]);

  const indice = useMemo(() => {
    const puntos =
      Math.round(categorias.reduce((s, c) => s + c.puntos, 0) * 100) / 100;
    const puntosMax = categorias.reduce((s, c) => s + c.puntosMax, 0);
    const puntosEvaluables = categorias.reduce(
      (s, c) => s + c.puntosMaxEvaluables,
      0,
    );
    // Se califica sobre lo que tiene datos: contar como incumplido un KPI que
    // nadie puede medir daria una nota artificialmente baja.
    const valor =
      puntosEvaluables > 0 ? Math.round((puntos / puntosEvaluables) * 100) : 0;
    return {
      valor,
      puntos,
      puntosMax,
      puntosEvaluables,
      clasificacion:
        valor >= 90 ? "Excelente" : valor >= 75 ? "Atención" : "Acción inmediata",
    };
  }, [categorias]);

  // ── Top 10 de alertas de TODAS las areas, ya cruzado con su seguimiento
  const alertas = useMemo(
    () =>
      aplicarSeguimiento(
        [...(data?.alertas ?? []), ...(gastos?.alertas ?? [])],
        seguimientos,
      ),
    [data, gastos, seguimientos],
  );
  const topAlertas = useMemo(
    () => construirTopAlertas([alertas], 10),
    [alertas],
  );
  const alertasCerradas = useMemo(
    () => alertas.filter((a) => a.estatus === "cerrada"),
    [alertas],
  );

  const guardarSeguimiento = useCallback(
    async (
      alerta: AlertaAdmin,
      cambios: { estatus?: EstatusAlerta; fechaCompromiso?: string | null },
    ) => {
      const previo = seguimientos[alerta.id];
      setGuardando(alerta.id);
      try {
        const res = await fetch("/api/administracion/alertas", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            alerta_id: alerta.id,
            empresa,
            mes,
            estatus: cambios.estatus ?? alerta.estatus,
            fecha_compromiso:
              cambios.fechaCompromiso !== undefined
                ? cambios.fechaCompromiso
                : alerta.fechaCompromiso,
            // El responsable y la nota se conservan: este formulario solo
            // edita estatus y fecha compromiso.
            responsable: previo?.responsable ?? null,
            nota: previo?.nota ?? null,
          }),
        });
        const json = await res.json();
        if (json.success) {
          setSeguimientos((prev) => ({ ...prev, [alerta.id]: json.seguimiento }));
        }
      } catch {
        // Si falla, la fila se queda como estaba; el proximo intento reintenta.
      }
      setGuardando(null);
    },
    [empresa, mes, seguimientos],
  );

  const colorIndice =
    !data ? "text-slate-500"
    : indice.valor >= 90 ? "text-emerald-600"
    : indice.valor >= 75 ? "text-amber-600"
    : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-blue-600" />
            Índice de Salud Administrativa
          </h1>
          <p className="text-gray-500">
            Cuentas por Cobrar · Tesorería · Cuentas por Pagar · Gastos y
            Presupuesto
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none"
          >
            {SEDES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 sm:flex-none"
          >
            {meses().map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
          <p className="text-gray-500">Calculando indicadores desde Odoo...</p>
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No se pudieron cargar los datos.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Índice general */}
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
            <CardContent className="p-6 flex flex-col md:flex-row md:items-center gap-6">
              <div className="text-center md:text-left">
                <p className="text-sm text-blue-700 font-medium">
                  Índice general
                </p>
                <p className={`text-5xl font-bold ${colorIndice}`}>
                  {indice.valor}
                  <span className="text-2xl text-slate-400">/100</span>
                </p>
                <p className="text-sm font-semibold text-slate-600 mt-1">
                  {indice.clasificacion}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {indice.puntos} de {indice.puntosEvaluables} pts evaluables
                </p>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {categorias.map((c) => (
                  <div key={c.categoria} className="bg-white rounded-xl p-3 border">
                    <p className="text-[11px] text-gray-500">{c.categoria}</p>
                    <p className="text-lg font-bold text-slate-800">
                      {c.puntos}
                      <span className="text-sm text-slate-400">
                        {" "}/ {c.puntosMaxEvaluables || c.puntosMax}
                      </span>
                    </p>
                    {c.puntosMaxEvaluables < c.puntosMax && (
                      <p className="text-[10px] text-amber-600">
                        {c.puntosMax - c.puntosMaxEvaluables} pts sin datos
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {indice.puntosEvaluables < PUNTOS_DOCUMENTO && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900 space-y-1">
                <p className="font-semibold">
                  El índice se calcula sobre {indice.puntosEvaluables} de los{" "}
                  {PUNTOS_DOCUMENTO} puntos del documento.
                </p>
                {indice.puntosEvaluables < indice.puntosMax && (
                  <p>
                    {indice.puntosMax - indice.puntosEvaluables} puntos de las
                    áreas ya implementadas corresponden a indicadores sin fuente
                    de datos; se excluyen del cálculo en vez de contarlos como
                    incumplidos.
                  </p>
                )}
                <p>
                  Los {PUNTOS_DOCUMENTO - indice.puntosMax} puntos restantes son{" "}
                  {AREAS_SIN_FUENTE.map((a) => `${a.nombre} (${a.puntos})`).join(
                    " y ",
                  )}
                  : ningún sistema registra hoy esos datos, así que no se
                  calculan.
                </p>
              </div>
            </div>
          )}

          {/* Top 10 de alertas: prioriza las mas criticas de TODAS las areas
              (financieras + Gastos) para no tener que revisar los 32 KPIs uno
              por uno. Los 6 campos que exige la propuesta son Responsable,
              Monto, Fecha, Acción, Fecha compromiso y Estatus. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Top 10 Alertas
                <span className="text-sm font-normal text-gray-500">
                  ({topAlertas.length})
                </span>
              </CardTitle>
              <p className="text-xs text-gray-500">
                Ordenadas por severidad. La fecha compromiso y el estatus se
                guardan por sede y mes; al cerrar una alerta sale del Top y su
                lugar lo toma la siguiente.
              </p>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {topAlertas.length === 0 ? (
                <p className="px-4 pb-6 text-sm text-gray-500">
                  Sin alertas abiertas para este período.
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="px-4">Alerta y acción</TableHead>
                      <TableHead className="hidden md:table-cell">Área</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Responsable
                      </TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead className="hidden xl:table-cell">
                        Detectada
                      </TableHead>
                      <TableHead>Compromiso</TableHead>
                      <TableHead className="pr-4">Estatus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topAlertas.map((a) => (
                      <FilaAlerta
                        key={a.id}
                        alerta={a}
                        guardando={guardando === a.id}
                        onCambio={(cambios) => guardarSeguimiento(a, cambios)}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}

              {alertasCerradas.length > 0 && (
                <div className="border-t">
                  <button
                    type="button"
                    onClick={() => setVerCerradas((v) => !v)}
                    className="w-full text-left px-4 py-3 text-sm text-gray-600 hover:bg-slate-50 flex items-center gap-2"
                  >
                    {verCerradas ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    {alertasCerradas.length} alerta
                    {alertasCerradas.length === 1 ? "" : "s"} cerrada
                    {alertasCerradas.length === 1 ? "" : "s"} este período
                  </button>
                  {verCerradas && (
                    <Table>
                      <TableBody>
                        {alertasCerradas.map((a) => (
                          <FilaAlerta
                            key={a.id}
                            alerta={a}
                            guardando={guardando === a.id}
                            onCambio={(cambios) => guardarSeguimiento(a, cambios)}
                          />
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Categorías con sus KPIs */}
          {categorias.map((cat) => {
            const Icono = ICONO_CATEGORIA[cat.categoria] || Activity;
            const abiertaCat = abierta === cat.categoria;
            return (
              <Card key={cat.categoria}>
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => setAbierta(abiertaCat ? null : cat.categoria)}
                >
                  <CardTitle className="text-lg flex items-center gap-2">
                    {abiertaCat ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    )}
                    <Icono className="h-5 w-5 text-blue-600" />
                    {cat.categoria}
                    <span className="ml-auto text-sm font-normal text-gray-500">
                      {cat.puntos} / {cat.puntosMax} pts
                    </span>
                  </CardTitle>
                </CardHeader>
                {abiertaCat && (
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50">
                        <TableRow>
                          <TableHead className="w-[40px] px-2 sm:px-4">#</TableHead>
                          <TableHead>Indicador</TableHead>
                          <TableHead className="text-center hidden md:table-cell">
                            Meta
                          </TableHead>
                          <TableHead className="text-center">Valor</TableHead>
                          <TableHead className="text-center hidden sm:table-cell">
                            Semáforo
                          </TableHead>
                          <TableHead className="text-center pr-4 hidden lg:table-cell">
                            Puntos
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cat.kpis.map((k) => (
                          <TableRow key={k.id}>
                            <TableCell className="px-2 sm:px-4 text-gray-400 text-sm">
                              {k.numero}
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              <div className="max-w-[200px] sm:max-w-[360px] lg:max-w-none break-words">
                              <div className="font-medium text-sm">{k.nombre}</div>
                              <div className="text-xs text-gray-500">{k.formula}</div>
                              {/* En movil la meta y el semaforo se ocultan como
                                  columnas, asi que se muestran aca. */}
                              <div className="text-xs text-gray-500 md:hidden mt-1">
                                Meta: {k.metaTexto}
                                <span className="sm:hidden">
                                  {" · "}
                                  {k.semaforo === "sin_datos" ? "sin datos" : k.semaforo}
                                </span>
                              </div>
                              {k.detalle && (
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {k.detalle}
                                </div>
                              )}
                              </div>
                            </TableCell>
                            <TableCell className="text-center text-sm text-gray-600 hidden md:table-cell">
                              {k.metaTexto}
                            </TableCell>
                            <TableCell className="text-center font-bold">
                              {k.valor === null ? (
                                <span className="text-gray-400 text-sm">—</span>
                              ) : k.unidad === "$" ? (
                                money(k.valor)
                              ) : (
                                `${k.valor}${k.unidad}`
                              )}
                            </TableCell>
                            <TableCell className="text-center hidden sm:table-cell">
                              <Badge
                                variant="outline"
                                className={`${SEMAFORO[k.semaforo]} text-xs`}
                              >
                                {k.semaforo === "sin_datos" ? "sin datos" : k.semaforo}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center pr-4 text-sm font-semibold text-gray-700 hidden lg:table-cell">
                              {k.puntos} / {k.puntosMax}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {cat.categoria === CATEGORIA_GASTOS && (
                      <div className="px-4 py-3 border-t">
                        <Link
                          href={`/${locale}/administracion/gastos`}
                          className="text-sm text-blue-600 hover:underline"
                        >
                          Ver drill-down por cuenta, proveedor y factura, y
                          cargar el presupuesto →
                        </Link>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}

          {/* Drill-down */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Antigüedad de cartera</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Corriente</span>
                  <span className="font-semibold text-emerald-600">
                    {money(data.detalle.cxc.corriente)}
                  </span>
                </div>
                {data.detalle.cxc.bandas.map((b) => (
                  <div key={b.nombre} className="flex justify-between text-sm">
                    <span className="text-gray-500">{b.nombre}</span>
                    <span className="font-semibold text-slate-700">
                      {money(b.monto)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold">
                    {money(data.detalle.cxc.totalCartera)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Disponible por cuenta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[260px] overflow-y-auto">
                {data.detalle.tesoreria.porCuenta.slice(0, 12).map((c) => (
                  <div key={c.nombre} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 truncate">{c.nombre}</span>
                    <span className="font-semibold text-slate-700 shrink-0">
                      {money(c.saldo)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm pt-2 border-t">
                  <span className="font-semibold">Disponible</span>
                  <span className="font-bold">
                    {money(data.detalle.tesoreria.disponible)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Mayores deudores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[260px] overflow-y-auto">
                {data.detalle.cxc.topDeudores.slice(0, 12).map((d) => (
                  <div key={d.cliente} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 truncate">
                      {d.cliente}
                      {d.diasVencido > 0 && (
                        <span className="text-red-500 text-xs"> · {d.diasVencido}d</span>
                      )}
                    </span>
                    <span className="font-semibold text-slate-700 shrink-0">
                      {money(d.monto)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
