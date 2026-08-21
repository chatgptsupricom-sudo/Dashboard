"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Download,
  Loader2,
  Upload,
  Wallet,
} from "lucide-react";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";

interface Kpi {
  id: string;
  numero: number;
  nombre: string;
  formula: string;
  peso: number;
  metaTexto: string;
  valor: number | null;
  unidad: string;
  semaforo: "verde" | "amarillo" | "rojo" | "sin_datos";
  puntos: number;
  puntosMax: number;
  detalle?: string;
}

interface CuentaDesglose {
  cuentaCodigo: string;
  cuentaNombre: string;
  grupo: string;
  real: number;
  presupuesto: number;
  variacionMonto: number;
  variacionPct: number | null;
  proveedores: {
    proveedor: string;
    factura: string;
    fecha: string;
    monto: number;
  }[];
}

interface Respuesta {
  success: boolean;
  mes: string;
  resumen: {
    puntos: number;
    puntosMax: number;
    puntosMaxEvaluables: number;
  };
  kpis: Kpi[];
  totales: {
    real: number;
    presupuesto: number;
    realMesAnterior: number;
    sinPresupuesto: number;
    extraordinario: number;
  };
  hayPresupuesto: boolean;
  desglose: CuentaDesglose[];
}

const SEMAFORO_STYLES: Record<string, string> = {
  verde: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amarillo: "bg-amber-50 text-amber-700 border-amber-200",
  rojo: "bg-red-50 text-red-700 border-red-200",
  sin_datos: "bg-slate-50 text-slate-500 border-slate-200",
};

function money(n: number) {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function mesesDisponibles() {
  const out: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      value,
      label: d.toLocaleDateString("es-VE", { month: "long", year: "numeric" }),
    });
  }
  return out;
}

export default function GastosPresupuestoPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sede, setSede] = useState("9");
  const [mes, setMes] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
  });
  const [data, setData] = useState<Respuesta | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [expandida, setExpandida] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/administracion/gastos?mes=${mes}&company_id=${sede}`,
      );
      const json = await res.json();
      if (json.success) setData(json);
      else setData(null);
    } catch (e) {
      console.error("Error cargando gastos:", e);
      setData(null);
    }
    setLoading(false);
  }, [mes, sede]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const descargarPlantilla = async () => {
    try {
      const res = await fetch(
        `/api/administracion/presupuesto?mes=${mes}&company_id=${sede}`,
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Error");
      const filas = json.data.map((d: any) => ({
        CUENTA: d.cuentaCodigo,
        DESCRIPCION: d.cuentaNombre,
        PRESUPUESTO: d.monto || "",
      }));
      const ws = XLSX.utils.json_to_sheet(filas);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
      XLSX.writeFile(wb, `Presupuesto_${sede}_${mes}.xlsx`);
      toast({
        title: "Plantilla descargada",
        description:
          "Llena la columna PRESUPUESTO y vuelve a subir el archivo.",
        className: "bg-green-50 border-green-200",
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "No se pudo generar la plantilla",
        variant: "destructive",
      });
    }
  };

  const subirPresupuesto = async (
    ev: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json(ws) as any[];

      const items = filas
        .map((row) => {
          const cuentaKey = Object.keys(row).find((k) =>
            ["cuenta", "codigo", "código"].includes(k.toLowerCase().trim()),
          );
          const montoKey = Object.keys(row).find((k) =>
            ["presupuesto", "monto"].includes(k.toLowerCase().trim()),
          );
          if (!cuentaKey || !montoKey) return null;
          const monto = Number(
            String(row[montoKey]).replace(/[^0-9.,-]/g, "").replace(",", "."),
          );
          if (!Number.isFinite(monto) || monto <= 0) return null;
          return {
            cuentaCodigo: String(row[cuentaKey]).trim(),
            monto,
          };
        })
        .filter(Boolean);

      if (items.length === 0) {
        toast({
          title: "Archivo sin datos válidos",
          description:
            "Revisa que exista la columna CUENTA y PRESUPUESTO con montos mayores a 0.",
          variant: "destructive",
        });
        return;
      }

      const res = await fetch("/api/administracion/presupuesto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, company_id: Number(sede), items }),
      });
      const json = await res.json();
      if (json.success) {
        toast({
          title: "Presupuesto cargado",
          description: `${json.actualizados} cuentas actualizadas.`,
          className: "bg-green-50 border-green-200",
        });
        fetchData();
      } else {
        throw new Error(json.error || "Error al guardar");
      }
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "No se pudo procesar el archivo",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    // El padding y el ancho maximo los aporta app/[locale]/administracion/layout.tsx
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-7 w-7 text-blue-600" />
            Gastos y Presupuesto
          </h1>
          <p className="text-gray-500">
            Área 4 del Índice de Salud Administrativa · 15 puntos
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm flex-1 sm:flex-none"
          >
            {SEDES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm capitalize flex-1 sm:flex-none"
          >
            {mesesDisponibles().map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
          <p className="text-gray-500">Cargando gasto real desde Odoo...</p>
        </div>
      ) : !data ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-500">
            No se pudieron cargar los datos.
          </CardContent>
        </Card>
      ) : (
        <>
          {!data.hayPresupuesto && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900">
                <p className="font-semibold">
                  No hay presupuesto cargado para este mes.
                </p>
                <p>
                  3 de los 5 KPIs (ejecución presupuestaria, desviación y gastos
                  sin presupuesto) no se pueden calcular sin él. Descarga la
                  plantilla, llénala y súbela para activarlos.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card className="bg-blue-50/50 border-blue-100">
              <CardContent className="p-4">
                <p className="text-xs text-blue-600 font-medium">
                  Puntaje del área
                </p>
                <p className="text-2xl font-bold text-blue-700">
                  {data.resumen.puntos} / {data.resumen.puntosMax}
                </p>
                {data.resumen.puntosMaxEvaluables <
                  data.resumen.puntosMax && (
                  <p className="text-[11px] text-blue-600/70 mt-1">
                    {data.resumen.puntosMaxEvaluables} pts evaluables con los
                    datos actuales
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-medium">Gasto real</p>
                <p className="text-2xl font-bold text-gray-800">
                  {money(data.totales.real)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-medium">Presupuesto</p>
                <p className="text-2xl font-bold text-gray-800">
                  {data.totales.presupuesto > 0
                    ? money(data.totales.presupuesto)
                    : "—"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 font-medium">
                  Mes anterior
                </p>
                <p className="text-2xl font-bold text-gray-800">
                  {money(data.totales.realMesAnterior)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <CardTitle className="text-lg">Indicadores (18–22)</CardTitle>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={descargarPlantilla}
                  className="flex-1 sm:flex-none"
                >
                  <Download className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">Plantilla</span>
                  <span className="hidden md:inline">&nbsp;presupuesto</span>
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={subirPresupuesto}
                />
                <Button
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                  className="bg-blue-600 hover:bg-blue-700 flex-1 sm:flex-none"
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2 shrink-0" />
                  )}
                  <span className="truncate">Cargar</span>
                  <span className="hidden md:inline">&nbsp;presupuesto</span>
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="w-[40px] px-2 sm:px-4">#</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead className="text-center hidden md:table-cell">
                      Meta
                    </TableHead>
                    <TableHead className="text-center">Valor</TableHead>
                    <TableHead className="text-center hidden sm:table-cell">
                      Semáforo
                    </TableHead>
                    <TableHead className="text-center hidden lg:table-cell">
                      Puntos
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.kpis.map((k) => (
                    <TableRow key={k.id}>
                      <TableCell className="px-2 sm:px-4 text-gray-400 text-sm">
                        {k.numero}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="max-w-[200px] sm:max-w-[360px] lg:max-w-none break-words">
                        <div className="font-medium text-sm">{k.nombre}</div>
                        <div className="text-xs text-gray-500">{k.formula}</div>
                        {/* Meta y semaforo se ocultan como columnas en movil. */}
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
                        ) : (
                          `${k.valor}${k.unidad}`
                        )}
                      </TableCell>
                      <TableCell className="text-center hidden sm:table-cell">
                        <Badge
                          variant="outline"
                          className={`${SEMAFORO_STYLES[k.semaforo]} text-xs capitalize`}
                        >
                          {k.semaforo === "sin_datos"
                            ? "sin datos"
                            : k.semaforo}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm font-semibold text-gray-700 hidden lg:table-cell">
                        {k.puntos} / {k.puntosMax}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Detalle por cuenta contable
              </CardTitle>
              <p className="text-sm text-gray-500">
                Clic en una cuenta para ver proveedores y facturas.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="px-2 sm:px-4">Cuenta</TableHead>
                    <TableHead className="text-right">Real</TableHead>
                    <TableHead className="text-right hidden md:table-cell">
                      Presupuesto
                    </TableHead>
                    <TableHead className="text-right hidden lg:table-cell">
                      Variación
                    </TableHead>
                    <TableHead className="text-right pr-4 hidden sm:table-cell">
                      %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.desglose.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-8 text-gray-500"
                      >
                        Sin gasto registrado en este período.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.desglose.map((c) => (
                      <Fragment key={c.cuentaCodigo}>
                        <TableRow
                          className="cursor-pointer hover:bg-slate-50"
                          onClick={() =>
                            setExpandida(
                              expandida === c.cuentaCodigo
                                ? null
                                : c.cuentaCodigo,
                            )
                          }
                        >
                          <TableCell className="px-4">
                            <div className="flex items-center gap-2">
                              {expandida === c.cuentaCodigo ? (
                                <ChevronDown className="h-4 w-4 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-gray-400" />
                              )}
                              <div>
                                <div className="font-medium text-sm">
                                  {c.cuentaNombre}
                                </div>
                                <div className="text-xs text-gray-400 font-mono">
                                  {c.cuentaCodigo}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {money(c.real)}
                          </TableCell>
                          <TableCell className="text-right text-gray-600 hidden md:table-cell">
                            {c.presupuesto > 0 ? money(c.presupuesto) : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right hidden lg:table-cell ${
                              c.variacionMonto > 0
                                ? "text-red-600"
                                : "text-emerald-600"
                            }`}
                          >
                            {c.presupuesto > 0 ? money(c.variacionMonto) : "—"}
                          </TableCell>
                          <TableCell className="text-right pr-4 hidden sm:table-cell">
                            {c.variacionPct === null ? (
                              <span className="text-amber-600 text-xs">
                                Sin presup.
                              </span>
                            ) : (
                              <span
                                className={
                                  c.variacionPct > 10
                                    ? "text-red-600 font-semibold"
                                    : "text-gray-600"
                                }
                              >
                                {c.variacionPct}%
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandida === c.cuentaCodigo && (
                          <TableRow>
                            <TableCell colSpan={5} className="bg-slate-50 p-0">
                              <div className="p-4">
                                <p className="text-xs font-semibold text-gray-600 mb-2">
                                  Facturas ({c.proveedores.length})
                                </p>
                                <div className="space-y-1">
                                  {c.proveedores.map((p, i) => (
                                    <div
                                      key={`${p.factura}-${i}`}
                                      className="flex items-center justify-between text-sm py-1 border-b border-slate-200 last:border-0"
                                    >
                                      <span className="text-gray-700">
                                        {p.proveedor}
                                      </span>
                                      <span className="text-gray-400 text-xs font-mono">
                                        {p.factura}
                                      </span>
                                      <span className="text-gray-500 text-xs">
                                        {p.fecha}
                                      </span>
                                      <span className="font-semibold text-gray-800">
                                        {money(p.monto)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
