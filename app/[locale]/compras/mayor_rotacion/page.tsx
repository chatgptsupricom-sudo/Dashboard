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
import { AlertTriangle, Download, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface ProductoQuiebre {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  stockDisponible: number;
  ventas45d: number;
  demandaDiaria: number;
  puntoReorden: number;
  cantidadAComprar: number;
  nivelCritico: string;
  costo: number;
  fechaQuiebreEstimada: string;
}

const SEDES = [
  { id: "todas", label: "Todas las sedes" },
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

export default function MayorRotacionPage() {
  const [productos, setProductos] = useState<ProductoQuiebre[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [sede, setSede] = useState<string>("todas");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroMarca, setFiltroMarca] = useState<string>("TODAS");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("TODAS");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchQuiebreData = async () => {
      setLoading(true);
      try {
        const params = sede !== "todas" ? `?sede=${sede}` : "";
        const response = await fetch(`/api/compras/quiebre${params}`);
        const result = await response.json();

        if (result.success) {
          setProductos(result.data);
        }
      } catch (error) {
        console.error("Error fetching quiebre data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchQuiebreData();
  }, [sede]);

  const marcasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.marca))).sort(),
    [productos],
  );
  const categoriasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria))).sort(),
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
      const cumpleCategoria =
        filtroCategoria === "TODAS" || p.categoria === filtroCategoria;

      return cumpleMarca && cumpleCategoria && coincideBusqueda;
    });
  }, [productos, busqueda, filtroMarca, filtroCategoria]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroMarca, filtroCategoria]);

  const totalPages = Math.ceil(productosFiltrados.length / itemsPerPage);
  const currentItems = productosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const kpis = useMemo(
    () => ({
      enQuiebre: productosFiltrados.filter(
        (p) => p.nivelCritico === "QUIEBRE TOTAL",
      ).length,
      enRiesgo: productosFiltrados.filter(
        (p) => p.nivelCritico === "RIESGO ALTO",
      ).length,
      valorCompra: productosFiltrados.reduce(
        (s, p) => s + p.cantidadAComprar * p.costo,
        0,
      ),
      totalSkus: productosFiltrados.length,
    }),
    [productosFiltrados],
  );

  const exportarExcel = () => {
    const data = productosFiltrados.map((item) => ({
      Código: item.codigo,
      Descripción: item.name,
      Marca: item.marca,
      Categoría: item.categoria,
      "Stock Físico": item.stockDisponible,
      "Ventas (Últ. 45 Días)": item.ventas45d,
      "Demanda Diaria": Number(item.demandaDiaria.toFixed(2)),
      "Punto de Reorden": Number(item.puntoReorden.toFixed(2)),
      "Cant. Sugerida Compra": item.cantidadAComprar,
      "Nivel de Alerta": item.nivelCritico,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Alerta_Quiebre_Stock");
    XLSX.writeFile(
      workbook,
      `Alerta_Quiebre_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-orange-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Calculando Puntos de Reorden...
        </h2>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Mayor Rotación (Alerta de Quiebre)
        </h1>
        <p className="text-gray-500">
          Productos con alta demanda que están por debajo del punto de reorden
          de seguridad.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              En Quiebre Total
            </p>
            <p className="text-3xl font-bold text-red-700 mt-1">
              {kpis.enQuiebre}
            </p>
            <p className="text-xs text-gray-400 mt-1">Stock = 0</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              En Riesgo Inminente
            </p>
            <p className="text-3xl font-bold text-orange-600 mt-1">
              {kpis.enRiesgo}
            </p>
            <p className="text-xs text-gray-400 mt-1">Bajo punto de reorden</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Valor Estimado Compra
            </p>
            <p className="text-3xl font-bold text-blue-700 mt-1">
              $
              {kpis.valorCompra.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs text-gray-400 mt-1">{kpis.totalSkus} SKUs</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Alertas
            </p>
            <p className="text-3xl font-bold text-gray-700 mt-1">
              {kpis.totalSkus}
            </p>
            <p className="text-xs text-gray-400 mt-1">Productos filtrados</p>
          </CardContent>
        </Card>
      </div>

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
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger className="w-full lg:col-span-1">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Categorías</SelectItem>
              {categoriasUnicas.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={exportarExcel}
            variant="outline"
            className="border-orange-600 text-orange-700 hover:bg-orange-50 w-full lg:col-span-1"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar Quiebres
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-orange-200">
        <CardHeader className="bg-orange-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-orange-700">
            <AlertTriangle className="h-5 w-5 mr-2" /> Productos Críticos para
            Compra
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-orange-50/30">
                <TableRow>
                  <TableHead className="w-[300px] px-6">Producto</TableHead>
                  <TableHead className="text-center">Marca/Cat</TableHead>
                  <TableHead className="text-center">Ventas (45d)</TableHead>
                  <TableHead className="text-center text-orange-700 font-bold">
                    Stock Físico
                  </TableHead>
                  <TableHead className="text-center font-bold">
                    Pto. Reorden
                  </TableHead>
                  <TableHead className="text-center">Cant. Comprar</TableHead>
                  <TableHead className="text-center font-bold text-blue-700">
                    Valor Compra ($)
                  </TableHead>
                  <TableHead className="text-right pr-6">
                    Nivel Alerta
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      ¡Excelente! Tu inventario de alta rotación está
                      abastecido.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((item, index) => (
                    <TableRow
                      key={item.codigo}
                      className={
                        item.nivelCritico === "QUIEBRE TOTAL"
                          ? "bg-red-50/40 hover:bg-red-50/70"
                          : "bg-orange-50/30 hover:bg-orange-50/60"
                      }
                    >
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm flex items-center gap-2">
                          <span className="text-gray-400">
                            #{(currentPage - 1) * itemsPerPage + index + 1}
                          </span>
                          {item.codigo}
                        </div>
                        <div
                          className="text-xs text-gray-500 truncate w-[250px]"
                          title={item.name}
                        >
                          {item.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="mb-1 bg-white">
                          {item.marca}
                        </Badge>
                        <div className="text-[10px] text-gray-500">
                          {item.categoria}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-medium text-gray-600">
                        {item.ventas45d}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant="destructive"
                          className={
                            item.stockDisponible <= 0
                              ? "bg-red-600"
                              : "bg-orange-500"
                          }
                        >
                          {item.stockDisponible}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-gray-700 font-medium">
                        {Math.round(item.puntoReorden)}
                      </TableCell>
                      <TableCell className="text-center font-bold text-blue-700 text-lg">
                        +{item.cantidadAComprar}
                      </TableCell>
                      <TableCell className="text-center font-bold text-gray-800">
                        {item.costo > 0 ? (
                          `$${(item.cantidadAComprar * item.costo).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                            Sin costo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Badge
                          className={
                            item.nivelCritico === "QUIEBRE TOTAL"
                              ? "bg-red-600 text-white"
                              : "bg-orange-500 text-white"
                          }
                        >
                          {item.nivelCritico === "QUIEBRE TOTAL"
                            ? "QUIEBRE"
                            : "RIESGO"}
                        </Badge>
                        <div className="text-[10px] text-gray-400 mt-1 text-right">
                          {item.fechaQuiebreEstimada !== "Sin riesgo inmediato"
                            ? item.fechaQuiebreEstimada
                            : ""}
                        </div>
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
                  onClick={() =>
                    setCurrentPage((p) => Math.min(p + 1, totalPages))
                  }
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
