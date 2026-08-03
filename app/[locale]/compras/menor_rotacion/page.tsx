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
import { Download, Loader2, Search, TrendingDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";

interface ProductoAnalisis {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string;
  categoria: string;
  stockDisponible: number;
  costo: number;
  days_inactive: number;
}

export default function MenorRotacionPage() {
  const [productos, setProductos] = useState<ProductoAnalisis[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [sede, setSede] = useState<string>("9");
  const [busqueda, setBusqueda] = useState<string>("");
  const [filtroMarca, setFiltroMarca] = useState<string>("TODAS");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("TODAS");
  const [filtroDias, setFiltroDias] = useState<string>("30");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchBIData = async () => {
      setLoading(true);
      try {
        const params = `?sede=${sede}`;
        const response = await fetch(`/api/compras/estancados${params}`);
        const result = await response.json();

        if (result.success) {
          setProductos(result.data);
        }
      } catch (error) {
        console.error("Error fetching BI data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchBIData();
  }, [sede]);

  const marcasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.marca))).sort(),
    [productos],
  );
  const categoriasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria))).sort(),
    [productos],
  );

  const menorRotacionFiltrados = useMemo(() => {
    return productos
      .filter((p) => {
        // Filtro Buscador (Por código o descripción)
        const termino = busqueda.toLowerCase();
        const coincideBusqueda =
          termino === "" ||
          p.codigo.toLowerCase().includes(termino) ||
          p.descripcion.toLowerCase().includes(termino);

        // Filtro Marca y Categoría
        const cumpleMarca = filtroMarca === "TODAS" || p.marca === filtroMarca;
        const cumpleCategoria =
          filtroCategoria === "TODAS" || p.categoria === filtroCategoria;

        // Filtro Días Inactivos
        let cumpleDias = false;
        if (filtroDias === "30") cumpleDias = p.days_inactive >= 30;
        else if (filtroDias === "60") cumpleDias = p.days_inactive >= 60;
        else if (filtroDias === "90") cumpleDias = p.days_inactive >= 90;
        else if (filtroDias === "NUNCA") cumpleDias = p.days_inactive === 999;

        return (
          cumpleDias &&
          p.stockDisponible > 0 &&
          cumpleMarca &&
          cumpleCategoria &&
          coincideBusqueda
        );
      })
      .sort((a, b) => b.days_inactive - a.days_inactive); // Siempre los más antiguos primero
  }, [productos, busqueda, filtroMarca, filtroCategoria, filtroDias]);

  // Si se mueve algún filtro, devolver a la página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroMarca, filtroCategoria, filtroDias]);

  const totalPages = Math.ceil(menorRotacionFiltrados.length / itemsPerPage);
  const currentItems = menorRotacionFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const totalCapital = menorRotacionFiltrados.reduce(
    (s, p) => s + p.stockDisponible * p.costo,
    0,
  );
  const totalUnidades = menorRotacionFiltrados.reduce(
    (s, p) => s + p.stockDisponible,
    0,
  );

  const exportarExcel = () => {
    const data = menorRotacionFiltrados.map((item) => ({
      Código: item.codigo,
      Descripción: item.descripcion,
      Marca: item.marca,
      Categoría: item.categoria,
      "Stock Físico": item.stockDisponible,
      "Días Inactivos":
        item.days_inactive === 999 ? "Nunca vendido" : item.days_inactive,
      "Costo Unitario ($)": item.costo,
      "Capital Estancado ($)": Number(
        (item.stockDisponible * item.costo).toFixed(2),
      ),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario_Estancado");
    XLSX.writeFile(
      workbook,
      `Menor_Rotacion_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-red-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Calculando Capital Inmovilizado...
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          Cruzando costos de Odoo y MySQL
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Productos de Menor Rotación
        </h1>
        <p className="text-gray-500">
          Analiza el inventario físico inmovilizado y el capital estancado en
          los almacenes.
        </p>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-center">
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
          {/* Buscador de Texto */}
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

          <Select value={filtroDias} onValueChange={setFiltroDias}>
            <SelectTrigger className="w-full lg:col-span-1">
              <SelectValue placeholder="Inactividad" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Más de 30 días</SelectItem>
              <SelectItem value="60">Más de 60 días</SelectItem>
              <SelectItem value="90">Más de 90 días</SelectItem>
              <SelectItem value="NUNCA">Nunca se ha vendido</SelectItem>
            </SelectContent>
          </Select>

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
            className="border-red-600 text-red-700 hover:bg-red-50 w-full lg:col-span-1"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      {/* Banner de totales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Productos filtrados
            </p>
            <p className="text-3xl font-bold text-gray-800 mt-1">
              {menorRotacionFiltrados.length}
            </p>
            <p className="text-xs text-gray-400 mt-1">Con stock disponible</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Unidades en stock
            </p>
            <p className="text-3xl font-bold text-blue-700 mt-1">
              {totalUnidades.toLocaleString("en-US")}
            </p>
            <p className="text-xs text-gray-400 mt-1">Unidades inmovilizadas</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Capital inmovilizado
            </p>
            <p className="text-3xl font-bold text-red-700 mt-1">
              $
              {totalCapital.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Solo productos con costo configurado
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md border-red-200">
        <CardHeader className="bg-red-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-red-700">
            <TrendingDown className="h-5 w-5 mr-2" /> Reporte de Capital
            Estancado
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-red-50/30">
                <TableRow>
                  <TableHead className="w-[300px] px-6">Producto</TableHead>
                  <TableHead className="text-center">Marca/Cat</TableHead>
                  <TableHead className="text-center font-bold text-gray-800">
                    Stock Físico
                  </TableHead>
                  <TableHead className="text-center text-red-700">
                    Días Inactivos
                  </TableHead>
                  <TableHead className="text-center">Costo Unid. ($)</TableHead>
                  <TableHead className="text-right font-bold text-red-800 pr-6">
                    Capital Estancado ($)
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      No hay inventario estancado con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((item) => (
                    <TableRow key={item.codigo} className="hover:bg-red-50/20">
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm">
                          {item.codigo}
                        </div>
                        <div
                          className="text-xs text-gray-500 truncate w-[250px]"
                          title={item.descripcion}
                        >
                          {item.descripcion}
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
                      <TableCell className="text-center font-bold text-lg text-gray-800">
                        {item.stockDisponible}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="destructive" className="bg-red-600">
                          {item.days_inactive === 999
                            ? "Nunca vendido"
                            : `${item.days_inactive} días`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-gray-600 font-medium">
                        {item.costo > 0 ? (
                          `$${item.costo.toFixed(2)}`
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                            Sin costo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-bold text-red-700 text-lg pr-6">
                        {item.costo > 0 ? (
                          `$${(item.stockDisponible * item.costo).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                            Sin costo config.
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {menorRotacionFiltrados.length === 0
                ? "0 productos"
                : totalPages > 1
                  ? `${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, menorRotacionFiltrados.length)} de ${menorRotacionFiltrados.length} productos`
                  : `${menorRotacionFiltrados.length} producto${menorRotacionFiltrados.length !== 1 ? "s" : ""}`}
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
