"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Loader2,
  MapPin,
  PackageSearch,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { SEDES } from "@/lib/compras/constants";

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface ResumenCompras {
  totalSugeridos: number;
  valorTotalComprar: number;
  enQuiebre: number;
  enRiesgo: number;
  totalEstancados: number;
  capitalEstancado: number;
  totalSkusActivos: number;
  clasA: number;
  clasB: number;
  clasC: number;
  updatedAt: Date;
}

export default function ComprasDashboard() {
  const params = useParams();
  const locale = params?.locale || "es";
  const base = `/${locale}/compras`;

  const [resumen, setResumen] = useState<ResumenCompras | null>(null);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState<string>("9");

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      setResumen(null);
      try {
        const qs = `?sede=${sede}`;
        const [resMayor, resEstancados] = await Promise.all([
          fetch(`/api/compras/mayor_rotacion${qs}`).then((r) => r.json()),
          fetch(`/api/compras/estancados${qs}`).then((r) => r.json()),
        ]);

        const mayor = resMayor.success ? resMayor.data : [];
        const estancados = resEstancados.success ? resEstancados.data : [];
        const sugeridos = mayor.filter((p: any) => p.cantidadAComprar > 0);

        setResumen({
          totalSugeridos: sugeridos.length,
          valorTotalComprar: sugeridos.reduce(
            (s: number, p: any) => s + (p.valorAComprar || 0),
            0,
          ),
          enQuiebre: sugeridos.filter((p: any) => p.accion?.includes("QUIEBRE"))
            .length,
          enRiesgo: sugeridos.filter((p: any) => p.accion?.includes("RIESGO"))
            .length,
          totalEstancados: estancados.length,
          capitalEstancado: estancados.reduce(
            (s: number, p: any) =>
              s + (p.stockDisponible ?? 0) * (p.costo ?? 0),
            0,
          ),
          totalSkusActivos: mayor.length,
          clasA: mayor.filter((p: any) => p.abc === "A").length,
          clasB: mayor.filter((p: any) => p.abc === "B").length,
          clasC: mayor.filter((p: any) => p.abc === "C").length,
          updatedAt: new Date(),
        });
      } catch (error) {
        console.error("[ComprasDashboard] Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [sede]);

  if (!loading && !resumen) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          No se pudo cargar el resumen
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          Verifica la conexión con Odoo e intenta de nuevo.
        </p>
      </div>
    );
  }

  if (loading && !resumen) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-gray-400 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Cargando resumen de compras...
        </h2>
        <p className="text-gray-500 text-sm mt-2">Consultando Odoo...</p>
      </div>
    );
  }

  const r = resumen!;
  const pctA =
    r.totalSkusActivos > 0 ? (r.clasA / r.totalSkusActivos) * 100 : 0;
  const pctB =
    r.totalSkusActivos > 0 ? (r.clasB / r.totalSkusActivos) * 100 : 0;
  const pctC =
    r.totalSkusActivos > 0 ? (r.clasC / r.totalSkusActivos) * 100 : 0;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Panel de Compras
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Resumen ejecutivo del inventario y necesidades de reposición.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <MapPin className="h-3.5 w-3.5 text-gray-400 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            {r.updatedAt.toLocaleTimeString("es-VE", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
      </div>

      {/* Banner de quiebre crítico */}
      {r.enQuiebre > 0 && (
        <div className="flex items-center gap-3 bg-red-600 rounded-lg px-4 py-3 text-white">
          <Zap className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            {r.enQuiebre} producto{r.enQuiebre > 1 ? "s" : ""} en quiebre total
            — sin stock disponible.
          </span>
          <Link href={`${base}/sugeridos`} className="ml-auto shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="bg-transparent border-white/40 text-white hover:bg-white/10 text-xs h-7 px-3"
            >
              Ver ahora <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Valor a comprar
              </p>
              <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              ${fmt(r.valorTotalComprar)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {r.totalSugeridos} SKUs sugeridos
            </p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                En quiebre
              </p>
              <div className="h-8 w-8 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600">{r.enQuiebre}</p>
            <p className="text-xs text-gray-400 mt-1">Stock = 0</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                En riesgo
              </p>
              <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <TrendingDown className="h-4 w-4 text-orange-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-orange-600">{r.enRiesgo}</p>
            <p className="text-xs text-gray-400 mt-1">Bajo punto de reorden</p>
          </CardContent>
        </Card>

        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                Capital inmovilizado
              </p>
              <div className="h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                <PackageSearch className="h-4 w-4 text-gray-500" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-800">
              ${fmt(r.capitalEstancado)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {r.totalEstancados} productos estancados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secciones navegables — 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Reposición */}
        <Card className="border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              <span className="font-semibold text-gray-800 text-sm">
                Reposición de Stock
              </span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {r.totalSugeridos} SKUs
            </span>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                  Valor total
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  ${fmt(r.valorTotalComprar)}
                </p>
              </div>
              <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                  En quiebre
                </p>
                <p className="text-lg font-bold text-red-600 mt-0.5">
                  {r.enQuiebre}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href={`${base}/sugeridos`} className="flex-1">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm h-9">
                  Ver sugeridos <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
              <Link href={`${base}/mayor_rotacion`} className="flex-1">
                <Button
                  variant="outline"
                  className="w-full text-sm h-9 text-gray-700 hover:bg-gray-50"
                >
                  Alerta quiebre <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Inventario estancado */}
        <Card className="border-gray-200 shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="font-semibold text-gray-800 text-sm">
                Inventario Estancado
              </span>
            </div>
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
              {r.totalEstancados} productos
            </span>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                  Capital inmovilizado
                </p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  ${fmt(r.capitalEstancado)}
                </p>
              </div>
              <div className="rounded-lg p-3 bg-gray-50 border border-gray-100">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                  Sin movimiento ≥30d
                </p>
                <p className="text-lg font-bold text-gray-700 mt-0.5">
                  {r.totalEstancados}
                </p>
              </div>
            </div>
            <Link href={`${base}/menor_rotacion`}>
              <Button
                variant="outline"
                className="w-full text-sm h-9 text-gray-700 hover:bg-gray-50"
              >
                Ver inventario estancado <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Clasificación ABC */}
      <Card className="border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-gray-600" />
            <span className="font-semibold text-gray-800 text-sm">
              Clasificación ABC del Catálogo
            </span>
          </div>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {r.totalSkusActivos} SKUs activos
          </span>
        </div>
        <CardContent className="p-5">
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-emerald-50 mb-2">
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{r.clasA}</p>
              <p className="text-xs text-gray-500 mt-0.5">Clase A</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">
                {Math.round(pctA)}% · top ventas
              </p>
            </div>
            <div className="text-center border-x border-gray-100">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-amber-50 mb-2">
                <BarChart3 className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{r.clasB}</p>
              <p className="text-xs text-gray-500 mt-0.5">Clase B</p>
              <p className="text-xs text-amber-600 font-medium mt-0.5">
                {Math.round(pctB)}% · media rotación
              </p>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 mb-2">
                <PackageSearch className="h-4 w-4 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-gray-900">{r.clasC}</p>
              <p className="text-xs text-gray-500 mt-0.5">Clase C</p>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                {Math.round(pctC)}% · baja rotación
              </p>
            </div>
          </div>

          {r.totalSkusActivos > 0 && (
            <div className="rounded-full overflow-hidden h-2 flex w-full bg-gray-100">
              <div
                className="bg-emerald-500"
                style={{ width: `${pctA}%` }}
                title={`A: ${r.clasA} SKUs`}
              />
              <div
                className="bg-amber-400"
                style={{ width: `${pctB}%` }}
                title={`B: ${r.clasB} SKUs`}
              />
              <div
                className="bg-gray-300"
                style={{ width: `${pctC}%` }}
                title={`C: ${r.clasC} SKUs`}
              />
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <Link href={`${base}/mayor_rotacion`}>
              <Button
                variant="outline"
                className="text-sm h-9 text-gray-700 hover:bg-gray-50"
              >
                Ver análisis completo <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
