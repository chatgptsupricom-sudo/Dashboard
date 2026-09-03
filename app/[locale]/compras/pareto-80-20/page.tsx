"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Loader2, PieChart as PieChartIcon, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface ProductoPareto {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  ingresos: number;
  unidades: number;
  pctIndividual: number;
  pctAcumulado: number;
  clase: "A" | "B" | "C";
}

interface Resumen {
  totalProductos: number;
  productosClaseA: number;
  pctProductosClaseA: number;
  pctIngresosClaseA: number;
}

const CLASE_BADGE: Record<string, string> = {
  A: "bg-emerald-600 text-white",
  B: "bg-amber-500 text-white",
  C: "bg-gray-400 text-white",
};

export default function Pareto8020Page() {
  const [productos, setProductos] = useState<ProductoPareto[]>([]);
  const [resumen, setResumen] = useState<Resumen>({
    totalProductos: 0,
    productosClaseA: 0,
    pctProductosClaseA: 0,
    pctIngresosClaseA: 0,
  });
  const [loading, setLoading] = useState(true);

  const [sede, setSede] = useState<string>("9");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroMarca, setFiltroMarca] = useState<string>("TODAS");
  const [filtroClase, setFiltroClase] = useState<string>("TODAS");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/compras/pareto-80-20?sede=${sede}`);
        const result = await response.json();
        if (result.success) {
          setProductos(result.data);
          setResumen(result.resumen);
        }
      } catch (error) {
        console.error("Error fetching pareto 80/20:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sede]);

  const marcasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.marca))).sort(),
    [productos],
  );

  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      const termino = busqueda.toLowerCase();
      const coincideBusqueda =
        termino === "" ||
        p.codigo.toLowerCase().includes(termino) ||
        p.name.toLowerCase().includes(termino);
      const cumpleMarca = filtroMarca === "TODAS" || p.marca === filtroMarca;
      const cumpleClase = filtroClase === "TODAS" || p.clase === filtroClase;
      return coincideBusqueda && cumpleMarca && cumpleClase;
    });
  }, [productos, busqueda, filtroMarca, filtroClase]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroMarca, filtroClase]);

  const totalPages = Math.ceil(productosFiltrados.length / itemsPerPage);
  const currentItems = productosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  // Solo los primeros ~30 para que el grafico se lea bien.
  const datosGrafico = useMemo(
    () =>
      productos.slice(0, 30).map((p) => ({
        nombre: p.codigo,
        ingresos: p.ingresos,
        pctAcumulado: p.pctAcumulado,
      })),
    [productos],
  );

  const exportarExcel = () => {
    const data = productosFiltrados.map((item) => ({
      Código: item.codigo,
      Descripción: item.name,
      Marca: item.marca,
      Categoría: item.categoria,
      "Ingresos (90d)": item.ingresos,
      "Unidades (90d)": item.unidades,
      "% Individual": item.pctIndividual,
      "% Acumulado": item.pctAcumulado,
      Clase: item.clase,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pareto_80_20");
    XLSX.writeFile(
      workbook,
      `Pareto_80_20_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Calculando curva 80/20...
        </h2>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Curva 80/20 (Pareto)</h1>
        <p className="text-gray-500">
          Productos que concentran la mayor parte de la facturación en los últimos 90 días.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Productos Clase A</p>
            <p className="text-3xl font-bold text-emerald-700 mt-1">{resumen.productosClaseA}</p>
            <p className="text-xs text-gray-400 mt-1">de {resumen.totalProductos} analizados</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">% de Productos</p>
            <p className="text-3xl font-bold text-emerald-700 mt-1">{resumen.pctProductosClaseA}%</p>
            <p className="text-xs text-gray-400 mt-1">son Clase A</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">% de Ingresos</p>
            <p className="text-3xl font-bold text-blue-700 mt-1">{resumen.pctIngresosClaseA}%</p>
            <p className="text-xs text-gray-400 mt-1">los genera la Clase A</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total Analizado</p>
            <p className="text-3xl font-bold text-gray-700 mt-1">{resumen.totalProductos}</p>
            <p className="text-xs text-gray-400 mt-1">SKUs con ventas (90d)</p>
          </CardContent>
        </Card>
      </div>

      {/* Grafico de Pareto */}
      <Card className="shadow-sm border-gray-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-emerald-600" /> Curva de Pareto (Top 30)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={datosGrafico} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="nombre" tick={{ fontSize: 10 }} interval={0} angle={-45} textAnchor="end" height={70} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === "% Acumulado" ? `${value}%` : `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                }
              />
              <Legend />
              <Bar yAxisId="left" dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="pctAcumulado" name="% Acumulado" stroke="#2563eb" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-center">
          <Select
            value={sede}
            onValueChange={(v) => {
              setSede(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative lg:col-span-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              type="text"
              placeholder="Buscar SKU o nombre..."
              className="pl-9 w-full"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <Select value={filtroMarca} onValueChange={setFiltroMarca}>
            <SelectTrigger className="w-full lg:col-span-1">
              <SelectValue placeholder="Marca" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Marcas</SelectItem>
              {marcasUnicas.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filtroClase} onValueChange={setFiltroClase}>
            <SelectTrigger className="w-full lg:col-span-1">
              <SelectValue placeholder="Clase" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Clases</SelectItem>
              <SelectItem value="A">Clase A</SelectItem>
              <SelectItem value="B">Clase B</SelectItem>
              <SelectItem value="C">Clase C</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={exportarExcel}
            variant="outline"
            className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 w-full lg:col-span-1"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-gray-200">
        <CardHeader className="bg-gray-50/50 pb-4">
          <CardTitle className="text-lg">Detalle por Producto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-gray-50/30">
                <TableRow>
                  <TableHead className="w-[300px] px-6">Producto</TableHead>
                  <TableHead className="text-center">Marca/Cat</TableHead>
                  <TableHead className="text-center">Ingresos (90d)</TableHead>
                  <TableHead className="text-center">Unidades (90d)</TableHead>
                  <TableHead className="text-center">% Individual</TableHead>
                  <TableHead className="text-center">% Acumulado</TableHead>
                  <TableHead className="text-right pr-6">Clase</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      Sin datos de ventas para el período seleccionado.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span className="text-gray-400">
                            #{(currentPage - 1) * itemsPerPage + index + 1}
                          </span>
                          {item.codigo}
                        </div>
                        <div className="text-xs text-gray-500 truncate w-[250px]" title={item.name}>
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="mb-1 bg-white">
                          {item.marca}
                        </Badge>
                        <div className="text-[10px] text-gray-500">{item.categoria}</div>
                      </TableCell>
                      <TableCell className="text-center font-bold text-gray-800">
                        ${item.ingresos.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </TableCell>
                      <TableCell className="text-center text-gray-600">{item.unidades}</TableCell>
                      <TableCell className="text-center text-gray-600">{item.pctIndividual}%</TableCell>
                      <TableCell className="text-center text-gray-600">{item.pctAcumulado}%</TableCell>
                      <TableCell className="text-right pr-6">
                        <Badge className={CLASE_BADGE[item.clase]}>{item.clase}</Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {productosFiltrados.length === 0
                ? "0 productos"
                : totalPages > 1
                  ? `${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, productosFiltrados.length)} de ${productosFiltrados.length} productos`
                  : `${productosFiltrados.length} producto${productosFiltrados.length !== 1 ? "s" : ""}`}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
