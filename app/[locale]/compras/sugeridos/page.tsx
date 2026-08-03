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
import { AlertTriangle, Download, Loader2, Package, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";

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
  tipo: "quiebre" | "riesgo";
}

function abcColor(abc: string) {
  return abc === "A"
    ? "bg-green-600"
    : abc === "B"
      ? "bg-yellow-500"
      : "bg-gray-400";
}

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export default function SugeridosPage() {
  const [todos, setTodos] = useState<ProductoSugerido[]>([]);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState<string | null>(null);

  const [sede, setSede] = useState("9");
  const [busqueda, setBusqueda] = useState("");
  const [filtroABC, setFiltroABC] = useState("TODAS");
  const [filtroMarca, setFiltroMarca] = useState("TODAS");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");

  const [currentPageQuiebre, setCurrentPageQuiebre] = useState(1);
  const [currentPageRiesgo, setCurrentPageRiesgo] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setWarning(null);
      try {
        const params = `?sede=${sede}`;
        const response = await fetch(`/api/compras/sugeridos${params}`);
        const result = await response.json();
        if (result.success) {
          setTodos(result.data);
          setWarning(result.warning || null);
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

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.toLowerCase();
    return tras_cat.filter((p) => {
      return (
        termino === "" ||
        p.codigo.toLowerCase().includes(termino) ||
        p.name.toLowerCase().includes(termino)
      );
    });
  }, [tras_cat, busqueda]);

  const enQuiebre = useMemo(
    () =>
      productosFiltrados.filter(
        (p) => p.tipo === "quiebre" && p.abc !== "C",
      ),
    [productosFiltrados],
  );

  const enRiesgo = useMemo(
    () => productosFiltrados.filter((p) => p.tipo === "riesgo"),
    [productosFiltrados],
  );

  useEffect(() => {
    setFiltroMarca("TODAS");
    setFiltroCategoria("TODAS");
  }, [filtroABC]);
  useEffect(() => {
    setFiltroCategoria("TODAS");
  }, [filtroMarca]);
  useEffect(() => {
    setCurrentPageQuiebre(1);
    setCurrentPageRiesgo(1);
  }, [busqueda, filtroABC, filtroMarca, filtroCategoria]);

  // KPIs
  const kpis = useMemo(
    () => ({
      totalQuiebre: enQuiebre.length,
      totalRiesgo: enRiesgo.length,
      totalValor: productosFiltrados.reduce((s, p) => s + p.valorAComprar, 0),
      totalSkus: productosFiltrados.length,
    }),
    [enQuiebre, enRiesgo, productosFiltrados],
  );

  // Paginación quiebre
  const totalPagesQuiebre = Math.ceil(enQuiebre.length / itemsPerPage);
  const currentItemsQuiebre = enQuiebre.slice(
    (currentPageQuiebre - 1) * itemsPerPage,
    currentPageQuiebre * itemsPerPage,
  );

  // Paginación riesgo
  const totalPagesRiesgo = Math.ceil(enRiesgo.length / itemsPerPage);
  const currentItemsRiesgo = enRiesgo.slice(
    (currentPageRiesgo - 1) * itemsPerPage,
    currentPageRiesgo * itemsPerPage,
  );

  const exportarExcel = () => {
    const mapItem = (item: ProductoSugerido, i: number) => ({
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
      "Días Inv.":
        item.diasInvActual >= 999 ? "∞" : item.diasInvActual,
      "Cant. a Comprar": item.cantidadAComprar,
      "Costo Unit. ($)": item.costo,
      "Valor a Comprar ($)": item.valorAComprar,
    });
    const wsQuiebre = XLSX.utils.json_to_sheet(enQuiebre.map(mapItem));
    const wsRiesgo = XLSX.utils.json_to_sheet(enRiesgo.map(mapItem));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, wsQuiebre, "Quiebre");
    XLSX.utils.book_append_sheet(workbook, wsRiesgo, "Riesgo");
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
          Analizando ventas, stock, MOQ y punto de reorden desde Odoo
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
          Lista de compra: productos con MOQ configurado que requieren
          reposición urgente.
        </p>
      </div>

      {warning && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-amber-800 text-sm">
          <strong>Advertencia:</strong> {warning}
        </div>
      )}

      {/* Filtros */}
      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-center">
          <Select
            value={sede}
            onValueChange={(v) => {
              setSede(v);
              setCurrentPageQuiebre(1);
              setCurrentPageRiesgo(1);
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
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              En Quiebre
            </p>
            <p className="text-2xl font-bold text-red-700 mt-1">
              {kpis.totalQuiebre}
            </p>
            <p className="text-xs text-gray-400 mt-1">Stock = 0 (sin C)</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              En Riesgo
            </p>
            <p className="text-2xl font-bold text-orange-600 mt-1">
              {kpis.totalRiesgo}
            </p>
            <p className="text-xs text-gray-400 mt-1">Bajo punto de reorden</p>
          </CardContent>
        </Card>
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
        <Card className="border-green-200 bg-green-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Sugeridos
            </p>
            <p className="text-2xl font-bold text-green-700 mt-1">
              {kpis.totalSkus}
            </p>
            <p className="text-xs text-gray-400 mt-1">Con MOQ configurado</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabla Quiebre */}
      <Card className="shadow-md border-red-200">
        <CardHeader className="bg-red-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-red-700">
            <AlertTriangle className="h-5 w-5 mr-2" /> Productos en Quiebre (Stock = 0)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-red-50/30">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItemsQuiebre.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-gray-500"
                    >
                      No hay productos en quiebre con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItemsQuiebre.map((item) => (
                    <TableRow
                      key={item.codigo}
                      className="bg-red-50/30 hover:bg-red-50/60"
                    >
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
                        <Badge variant="destructive" className="bg-red-600">
                          {item.stockDisponible}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <span className="text-red-600 font-bold">0d</span>
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {enQuiebre.length === 0
                ? "0 productos"
                : totalPagesQuiebre > 1
                  ? `${(currentPageQuiebre - 1) * itemsPerPage + 1}–${Math.min(currentPageQuiebre * itemsPerPage, enQuiebre.length)} de ${enQuiebre.length} productos`
                  : `${enQuiebre.length} producto${enQuiebre.length !== 1 ? "s" : ""}`}
            </p>
            {totalPagesQuiebre > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageQuiebre((p) => Math.max(p - 1, 1))}
                  disabled={currentPageQuiebre === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPageQuiebre((p) => Math.min(p + 1, totalPagesQuiebre))
                  }
                  disabled={currentPageQuiebre === totalPagesQuiebre}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabla Riesgo */}
      <Card className="shadow-md border-orange-200">
        <CardHeader className="bg-orange-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-orange-700">
            <Package className="h-5 w-5 mr-2" /> Productos en Riesgo de Quiebre
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-orange-50/30">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentItemsRiesgo.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="text-center py-8 text-gray-500"
                    >
                      No hay productos en riesgo con estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItemsRiesgo.map((item) => (
                    <TableRow
                      key={item.codigo}
                      className="bg-orange-50/30 hover:bg-orange-50/60"
                    >
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
                        <Badge variant="destructive" className="bg-orange-500">
                          {item.stockDisponible}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {item.diasInvActual >= 999 ? (
                          <span className="text-gray-400 text-xs">∞</span>
                        ) : (
                          <span
                            className={
                              item.diasInvActual <= 3
                                ? "text-red-600 font-bold"
                                : item.diasInvActual <= 7
                                  ? "text-orange-500 font-semibold"
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
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {enRiesgo.length === 0
                ? "0 productos"
                : totalPagesRiesgo > 1
                  ? `${(currentPageRiesgo - 1) * itemsPerPage + 1}–${Math.min(currentPageRiesgo * itemsPerPage, enRiesgo.length)} de ${enRiesgo.length} productos`
                  : `${enRiesgo.length} producto${enRiesgo.length !== 1 ? "s" : ""}`}
            </p>
            {totalPagesRiesgo > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPageRiesgo((p) => Math.max(p - 1, 1))}
                  disabled={currentPageRiesgo === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setCurrentPageRiesgo((p) => Math.min(p + 1, totalPagesRiesgo))
                  }
                  disabled={currentPageRiesgo === totalPagesRiesgo}
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
