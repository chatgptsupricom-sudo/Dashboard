"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  CalendarDays,
  Layers,
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
}

function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
  href,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: any;
  color: string;
  href: string;
}) {
  const iconColors: Record<string, string> = {
    blue: "bg-blue-50 text-blue-600",
    red: "bg-red-50 text-red-600",
    orange: "bg-orange-50 text-orange-600",
    slate: "bg-slate-100 text-slate-600",
  };
  const valueColors: Record<string, string> = {
    blue: "text-blue-600",
    red: "text-red-600",
    orange: "text-orange-600",
    slate: "text-slate-900",
  };
  return (
    <Link href={href}>
      <Card className="border-none shadow-sm rounded-3xl p-6 bg-white hover:shadow-md transition-shadow cursor-pointer h-full">
        <div className="flex items-center gap-4">
          <div className={`p-4 rounded-2xl ${iconColors[color]}`}>
            <Icon size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {title}
            </p>
            <h4 className={`text-lg font-black ${valueColors[color]} truncate`}>
              {value}
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
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
        const r = await fetch(`/api/compras/dashboard?sede=${sede}`);
        const json = await r.json();
        if (json.success) setResumen(json.data);
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
        <h2 className="text-xl font-semibold text-slate-700">
          No se pudo cargar el resumen
        </h2>
        <p className="text-slate-500 text-sm mt-2">
          Verifica la conexión con Odoo e intenta de nuevo.
        </p>
      </div>
    );
  }

  if (loading && !resumen) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-slate-400 mb-4" />
        <h2 className="text-xl font-semibold text-slate-700">
          Cargando resumen de compras...
        </h2>
        <p className="text-slate-500 text-sm mt-2">Consultando Odoo...</p>
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
    <div className="p-4 sm:p-8 space-y-8 bg-slate-50/30 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900">
            Panel de Compras
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Resumen ejecutivo del inventario y necesidades de reposición.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="w-44 h-9 text-sm">
              <MapPin className="h-3.5 w-3.5 text-slate-400 mr-1" />
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
        </div>
      </div>

      {/* Banner de quiebre crítico */}
      {r.enQuiebre > 0 && (
        <div className="flex items-center gap-3 bg-red-600 rounded-2xl px-4 py-3 text-white">
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

      {/* Banner de capital estancado alto */}
      {r.capitalEstancado > 10000 && (
        <div className="flex items-center gap-3 bg-amber-500 rounded-2xl px-4 py-3 text-white">
          <PackageSearch className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            ${fmt(r.capitalEstancado)} en capital inmovilizado — {r.totalEstancados} productos sin movimiento ≥30 días.
          </span>
          <Link href={`${base}/menor_rotacion`} className="ml-auto shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="bg-transparent border-white/40 text-white hover:bg-white/10 text-xs h-7 px-3"
            >
              Revisar <ArrowRight className="h-3 w-3 ml-1" />
            </Button>
          </Link>
        </div>
      )}

      {/* KPIs principales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Valor a comprar"
          value={`$${fmt(r.valorTotalComprar)}`}
          subtitle={`${r.totalSugeridos} SKUs sugeridos`}
          icon={ShoppingCart}
          color="blue"
          href={`${base}/sugeridos`}
        />
        <MetricCard
          title="En quiebre"
          value={String(r.enQuiebre)}
          subtitle="Stock = 0 con demanda"
          icon={AlertTriangle}
          color="red"
          href={`${base}/mayor_rotacion`}
        />
        <MetricCard
          title="En riesgo"
          value={String(r.enRiesgo)}
          subtitle="Bajo punto de reorden"
          icon={TrendingDown}
          color="orange"
          href={`${base}/mayor_rotacion`}
        />
        <MetricCard
          title="Capital inmovilizado"
          value={`$${fmt(r.capitalEstancado)}`}
          subtitle={`${r.totalEstancados} productos estancados`}
          icon={PackageSearch}
          color="slate"
          href={`${base}/menor_rotacion`}
        />
      </div>

      {/* Accesos rápidos — todas las secciones */}
      <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-50 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-bold text-slate-700">
            Secciones
          </CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Link href={`${base}/sugeridos`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <ShoppingCart className="h-4 w-4 mr-2 text-blue-600" />
                Sugeridos
              </Button>
            </Link>
            <Link href={`${base}/mayor_rotacion`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <AlertTriangle className="h-4 w-4 mr-2 text-red-500" />
                Mayor rotación
              </Button>
            </Link>
            <Link href={`${base}/cobertura`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <CalendarDays className="h-4 w-4 mr-2 text-blue-500" />
                Cobertura
              </Button>
            </Link>
            <Link href={`${base}/rotacion-categoria`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <Layers className="h-4 w-4 mr-2 text-indigo-600" />
                Rotación categoría
              </Button>
            </Link>
            <Link href={`${base}/tendencia`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <TrendingUp className="h-4 w-4 mr-2 text-green-600" />
                Tendencia
              </Button>
            </Link>
            <Link href={`${base}/menor_rotacion`}>
              <Button variant="outline" className="w-full justify-start text-sm h-10 border-slate-200 hover:bg-slate-50">
                <PackageSearch className="h-4 w-4 mr-2 text-slate-500" />
                Estancados
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Clasificación ABC — clickeable */}
      <Link href={`${base}/mayor_rotacion`}>
        <Card className="rounded-3xl border-none shadow-sm bg-white overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
          <CardHeader className="pb-3 border-b border-slate-50 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold text-slate-700 flex items-center gap-2">
              <BarChart3 size={18} className="opacity-70" /> Clasificación ABC del Catálogo
            </CardTitle>
            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {r.totalSkusActivos} SKUs activos
            </span>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-3 gap-4 mb-5">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-emerald-50 mb-2">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-lg font-black text-slate-900">{r.clasA}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Clase A</p>
                <p className="text-[10px] text-emerald-600 font-bold mt-0.5">
                  {Math.round(pctA)}% · top ventas
                </p>
              </div>
              <div className="text-center border-x border-slate-100">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-50 mb-2">
                  <BarChart3 className="h-5 w-5 text-amber-500" />
                </div>
                <p className="text-lg font-black text-slate-900">{r.clasB}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Clase B</p>
                <p className="text-[10px] text-amber-600 font-bold mt-0.5">
                  {Math.round(pctB)}% · media rotación
                </p>
              </div>
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-slate-100 mb-2">
                  <PackageSearch className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-lg font-black text-slate-900">{r.clasC}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Clase C</p>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                  {Math.round(pctC)}% · baja rotación
                </p>
              </div>
            </div>

            {r.totalSkusActivos > 0 && (
              <div className="rounded-full overflow-hidden h-2 flex w-full bg-slate-100">
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
                  className="bg-slate-300"
                  style={{ width: `${pctC}%` }}
                  title={`C: ${r.clasC} SKUs`}
                />
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button
                variant="outline"
                className="text-sm h-9 border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                Ver análisis completo <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
