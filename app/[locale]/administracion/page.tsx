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
  TrendingDown,
  Wallet,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";

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

interface Alerta {
  id: string;
  area: string;
  titulo: string;
  responsable: string;
  montoAfectado: number | null;
  fechaDeteccion: string;
  accion: string;
  estatus: string;
  severidad: number;
}

interface Respuesta {
  success: boolean;
  indice: {
    valor: number;
    puntos: number;
    puntosMax: number;
    puntosEvaluables: number;
    clasificacion: string;
  };
  categorias: Categoria[];
  alertas: Alerta[];
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

export default function SaludFinancieraPage() {
  const [empresa, setEmpresa] = useState("");
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [abierta, setAbierta] = useState<string | null>("Cuentas por Cobrar");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/administracion/salud-financiera?empresa=${empresa}&mes=${mes}`,
      );
      const json = await res.json();
      setData(json.success ? json : null);
    } catch {
      setData(null);
    }
    setLoading(false);
  }, [empresa, mes]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const colorIndice =
    !data ? "text-slate-500"
    : data.indice.valor >= 90 ? "text-emerald-600"
    : data.indice.valor >= 75 ? "text-amber-600"
    : "text-red-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Activity className="h-7 w-7 text-blue-600" />
            Salud Financiera
          </h1>
          <p className="text-gray-500">
            Cuentas por Cobrar · Tesorería · Cuentas por Pagar — 65 puntos del
            Índice de Salud Administrativa
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
                  Salud Financiera
                </p>
                <p className={`text-5xl font-bold ${colorIndice}`}>
                  {data.indice.valor}
                  <span className="text-2xl text-slate-400">/100</span>
                </p>
                <p className="text-sm font-semibold text-slate-600 mt-1">
                  {data.indice.clasificacion}
                </p>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {data.categorias.map((c) => (
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

          {data.indice.puntosEvaluables < data.indice.puntosMax && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">
                  El índice se calcula sobre {data.indice.puntosEvaluables} de{" "}
                  {data.indice.puntosMax} puntos.
                </p>
                <p>
                  Los {data.indice.puntosMax - data.indice.puntosEvaluables} puntos
                  restantes corresponden a indicadores sin fuente de datos; se
                  excluyen del cálculo en vez de contarlos como incumplidos.
                </p>
              </div>
            </div>
          )}

          {/* Top alertas */}
          {data.alertas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  Alertas prioritarias ({data.alertas.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="px-4">Alerta</TableHead>
                      <TableHead className="hidden md:table-cell">Área</TableHead>
                      <TableHead className="hidden lg:table-cell">
                        Responsable
                      </TableHead>
                      <TableHead className="text-right pr-4">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.alertas.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="px-4">
                          <div className="font-medium text-sm">{a.titulo}</div>
                          <div className="text-xs text-gray-500">{a.accion}</div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 hidden md:table-cell">
                          {a.area}
                        </TableCell>
                        <TableCell className="text-sm text-gray-600 hidden lg:table-cell">
                          {a.responsable}
                        </TableCell>
                        <TableCell className="text-right pr-4 font-semibold">
                          {a.montoAfectado ? money(a.montoAfectado) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Categorías con sus KPIs */}
          {data.categorias.map((cat) => {
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
                            <TableCell className="min-w-[200px]">
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
