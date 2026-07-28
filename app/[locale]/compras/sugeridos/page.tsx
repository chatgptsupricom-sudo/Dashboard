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
import { Download, Loader2, Package, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface ProductoSugerido {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  abc: string;
  stockDisponible: number;
  demandaDiaria: number;
  moq: number;
  puntoReorden: number;
  diasInvActual: number;
  cantidadAComprar: number;
  costo: number;
  valorAComprar: number;
  accion: string;
  fechaQuiebreEstimada: string;
}

function abcColor(abc: string) {
  return abc === "A"
    ? "bg-green-600"
    : abc === "B"
      ? "bg-yellow-500"
      : "bg-gray-400";
}

function accionBadgeClass(accion: string) {
  if (accion.includes("QUIEBRE")) return "bg-red-600 text-white";
  if (accion.includes("RIESGO")) return "bg-orange-500 text-white";
  return "bg-green-600 text-white";
}

function accionLabel(accion: string) {
  if (accion.includes("QUIEBRE")) return "QUIEBRE";
  if (accion.includes("RIESGO")) return "RIESGO";
  return "OK";
}

function rowBg(accion: string) {
  if (accion.includes("QUIEBRE")) return "bg-red-50/40 hover:bg-red-50/70";
  if (accion.includes("RIESGO")) return "bg-orange-50/40 hover:bg-orange-50/70";
  return "hover:bg-blue-50/20";
}

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

const SEDES = [
  { id: "todas", label: "Todas las sedes" },
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

export default function SugeridosPage() {
  const [todos, setTodos] = useState<ProductoSugerido[]>([]);
  const [loading, setLoading] = useState(true);

  const [sede, setSede] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [filtroABC, setFiltroABC] = useState("TODAS");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [filtroAccion, setFiltroAccion] = useState("TODAS");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const params = sede !== "todas" ? `?sede=${sede}` : "";
        const response = await fetch(`/api/compras/sugeridos${params}`);
        const result = await response.json();
        if (result.success) {
          setTodos(result.data);
        }
      } catch (error) {
        console.error("[Sugeridos] Error:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [sede]);

  // Filtros en cascada: ABC → Marca → Categoría → Acción
  const tras_abc = useMemo(
    () =>
      filtroABC === "TODAS" ? todos : todos.filter((p) => p.abc === filtroABC),
    [todos, filtroABC],
  );

  const marcasUnicas = useMemo(
    () => Array.from(new Set(tras_abc.map((p) => p.marca))).sort(),
    [tras_abc],
  );

  const tras_marca = useMemo(
    () =>
      filtroMarca === "TODAS"
        ? tras_abc
        : tras_abc.filter((p) => p.marca === filtroMarca),
    [tras_abc, filtroMarca],
  );

  const categoriasUnicas = useMemo(
    () => Array.from(new Set(tras_marca.map((p) => p.categoria))).sort(),
    [tras_marca],
  );

  const tras_cat = useMemo(
    () =>
      filtroCategoria === "TODAS"
        ? tras_marca
        : tras_marca.filter((p) => p.categoria === filtroCategoria),
    [tras_marca, filtroCategoria],
  );

  const accionesUnicas = useMemo(
    () => Array.from(new Set(tras_cat.map((p) => p.accion))).sort(),
    [tras_cat],
  );

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.toLowerCase();
    return tras_cat.filter((p) => {
      const busq =
        termino === "" ||
        p.codigo.toLowerCase().includes(termino) ||
        p.name.toLowerCase().includes(termino);
      const acc = filtroAccion === "TODAS" || p.accion === filtroAccion;
      return busq && acc;
    });
  }, [tras_cat, busqueda, filtroAccion]);

  useEffect(() => {
    setFiltroMarca("TODAS");
    setFiltroCategoria("TODAS");
    setFiltroAccion("TODAS");
  }, [filtroABC]);
  useEffect(() => {
    setFiltroCategoria("TODAS");
    setFiltroAccion("TODAS");
  }, [filtroMarca]);
  useEffect(() => {
    setFiltroAccion("TODAS");
  }, [filtroCategoria]);
  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroABC, filtroMarca, filtroCategoria, filtroAccion]);

  // KPIs
  const kpis = useMemo(
    () => ({
      totalValor: productosFiltrados.reduce((s, p) => s + p.valorAComprar, 0),
      totalSkus: productosFiltrados.length,
      enQuiebre: productosFiltrados.filter((p) => p.accion.includes("QUIEBRE"))
        .length,
      enRiesgo: productosFiltrados.filter((p) => p.accion.includes("RIESGO"))
        .length,
    }),
    [productosFiltrados],
  );

  const totalPages = Math.ceil(productosFiltrados.length / itemsPerPage);
  const currentItems = productosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const exportarExcel = () => {
    const data = productosFiltrados.map((item, i) => ({
      "#": i + 1,
      Código: item.codigo,
      Descripción: item.name,
      Marca: item.marca,
      Categoría: item.categoria,
      ABC: item.abc,
      "Stock Disponible": item.stockDisponible,
      "Demanda/día": item.demandaDiaria,
      MOQ: item.moq,
      "Pto. Reorden": item.puntoReorden,
      "Días Inv.": item.diasInvActual >= 999 ? "∞" : item.diasInvActual,
      "Cant. a Comprar": item.cantidadAComprar,
      "Costo Unit. ($)": item.costo,
      "Valor a Comprar ($)": item.valorAComprar,
      Acción: item.accion,
      "Fecha Quiebre Est.": item.fechaQuiebreEstimada,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sugeridos_Compra");
    XLSX.writeFile(
      workbook,
      `Sugeridos_Compra_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
        <h2 className="text-xl font-semibold text-gray-700">
          Calculando sugeridos de compra...
        </h2>
        <p className="text-gray-500 text-sm mt-2">
          Analizando ventas, stock y MOQ desde Odoo
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Sugeridos de Compra
        </h1>
        <p className="text-gray-500">
          Productos que requieren reposición según MOQ, stock objetivo y punto
          de reorden.
        </p>
      </div>

      {/* Filtros */}
      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-4 items-center">
          <Select
            value={sede}
            onValueChange={(v) => {
              setSede(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger>
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
              placeholder="Buscar SKU o nombre..."
              className="pl-9 w-full"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <Select value={filtroABC} onValueChange={setFiltroABC}>
            <SelectTrigger>
              <SelectValue placeholder="Clase ABC" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las clases</SelectItem>
              <SelectItem value="A">A — Alta rotación</SelectItem>
              <SelectItem value="B">B — Media rotación</SelectItem>
              <SelectItem value="C">C — Baja rotación</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroMarca} onValueChange={setFiltroMarca}>
            <SelectTrigger>
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
            <SelectTrigger>
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
          <Select value={filtroAccion} onValueChange={setFiltroAccion}>
            <SelectTrigger>
              <SelectValue placeholder="Acción" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las acciones</SelectItem>
              {accionesUnicas.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={exportarExcel}
            variant="outline"
            className="border-blue-600 text-blue-700 hover:bg-blue-50 w-full"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Valor Total a Comprar
            </p>
            <p className="text-2xl font-bold text-blue-700 mt-1">
              ${fmt(kpis.totalValor)}
            </p>
            <p className="text-xs text-gray-400 mt-1">{kpis.totalSkus} SKUs</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              En Quiebre Total
            </p>
            <p className="text-2xl font-bold text-red-700 mt-1">
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
            <p className="text-2xl font-bold text-orange-600 mt-1">
              {kpis.enRiesgo}
            </p>
            <p className="text-xs text-gray-400 mt-1">Bajo punto de reorden</p>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Sugeridos
            </p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {todos.length}
            </p>
            <p className="text-xs text-gray-400 mt-1">Con MOQ configurado</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla */}
      <Card className="shadow-md border-blue-200">
        <CardHeader className="bg-blue-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-blue-700">
            <Package className="h-5 w-5 mr-2" /> Órdenes de Compra Sugeridas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-blue-50/30">
                <TableRow>
                  <TableHead className="px-4 w-[280px]">Producto</TableHead>
                  <TableHead className="text-center">ABC</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Días Inv.</TableHead>
                  <TableHead className="text-center">Pto. Reorden</TableHead>
                  <TableHead className="text-center">MOQ</TableHead>
                  <TableHead className="text-center font-bold text-blue-700">
                    Cant. Comprar
                  </TableHead>
                  <TableHead className="text-center">Costo Unit.</TableHead>
                  <TableHead className="text-center font-bold">
                    Valor ($)
                  </TableHead>
                  <TableHead className="text-right pr-6">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-8 text-gray-500"
                    >
                      No hay productos sugeridos con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((item) => (
                    <TableRow key={item.codigo} className={rowBg(item.accion)}>
                      <TableCell className="px-4">
                        <div className="font-semibold text-sm">
                          {item.codigo}
                        </div>
                        <div
                          className="text-xs text-gray-500 truncate w-[240px]"
                          title={item.name}
                        >
                          {item.name}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {item.categoria}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`${abcColor(item.abc)} text-white font-bold`}
                        >
                          {item.abc}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={
                            item.stockDisponible <= 0
                              ? "destructive"
                              : "outline"
                          }
                          className={
                            item.stockDisponible <= 0
                              ? "bg-red-600 text-white"
                              : "bg-white font-bold"
                          }
                        >
                          {item.stockDisponible}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.diasInvActual >= 999 ? (
                          <span className="text-gray-400 text-xs">
                            Sin ventas
                          </span>
                        ) : (
                          <span
                            className={
                              item.diasInvActual <= 7
                                ? "text-red-600 font-bold"
                                : item.diasInvActual <= 20
                                  ? "text-orange-500 font-medium"
                                  : "text-gray-600"
                            }
                          >
                            {item.diasInvActual}d
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-gray-600 text-sm">
                        {item.puntoReorden}
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.moq > 0 ? (
                          <span className="text-gray-600">{item.moq}</span>
                        ) : (
                          <span className="text-amber-600 font-semibold text-xs">
                            Sin MOQ
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-bold text-base">
                        {item.cantidadAComprar > 0 ? (
                          <span className="text-blue-700">
                            +{item.cantidadAComprar}
                          </span>
                        ) : (
                          <span className="text-amber-600 text-xs font-semibold">
                            Sin MOQ
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-gray-600 text-sm">
                        {item.costo > 0 ? (
                          `$${item.costo.toFixed(2)}`
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                            Sin costo
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-center font-bold text-gray-800">
                        {item.valorAComprar > 0
                          ? `$${fmt(item.valorAComprar)}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Badge
                          className={`text-xs ${accionBadgeClass(item.accion)}`}
                        >
                          {accionLabel(item.accion)}
                        </Badge>
                        {!item.accion.includes("OK") && (
                          <div className="text-[10px] text-gray-400 mt-1 text-right">
                            {item.fechaQuiebreEstimada}
                          </div>
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
