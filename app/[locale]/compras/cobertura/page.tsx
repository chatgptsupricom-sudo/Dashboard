"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { CalendarDays, Download, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";
import { ColumnHeader } from "@/components/compras/column-header";
import { COLUMN_TOOLTIPS } from "@/lib/compras/column-tooltips";

interface ProductoCobertura {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  abc: string;
  stockDisponible: number;
  ventas45d: number;
  demandaDiaria: number;
  diasCobertura: number;
  diasInvDeseado: number;
  costo: number;
  fechaQuiebreEstimada: string;
}

function abcColor(abc: string) {
  return abc === "A"
    ? "bg-green-600"
    : abc === "B"
      ? "bg-yellow-500"
      : "bg-gray-400";
}

function CoberturaChip({ dias }: { dias: number }) {
  if (dias >= 999)
    return (
      <Badge className="bg-green-100 text-green-700 border-green-300 border">
        Sin riesgo
      </Badge>
    );
  if (dias <= 0)
    return <Badge className="bg-red-600 text-white">QUIEBRE</Badge>;
  if (dias <= 7)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 border">
        {dias}d
      </Badge>
    );
  if (dias <= 15)
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-300 border">
        {dias}d
      </Badge>
    );
  if (dias <= 30)
    return (
      <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 border">
        {dias}d
      </Badge>
    );
  return (
    <Badge className="bg-blue-50 text-blue-700 border-blue-200 border">
      {dias}d
    </Badge>
  );
}

export default function CoberturaPage() {
  const [productos, setProductos] = useState<ProductoCobertura[]>([]);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState("9");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [filtroABC, setFiltroABC] = useState("TODAS");
  const [filtroCritico, setFiltroCritico] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setLoading(true);
    const params = `?sede=${sede}`;
    fetch(`/api/compras/cobertura${params}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.success) setProductos(r.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sede]);

  const categoriasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria))).sort(),
    [productos],
  );

  const filtrados = useMemo(() => {
    const t = busqueda.toLowerCase();
    return productos.filter((p) => {
      const okBusq =
        t === "" ||
        p.codigo.toLowerCase().includes(t) ||
        p.name.toLowerCase().includes(t);
      const okCat =
        filtroCategoria === "TODAS" || p.categoria === filtroCategoria;
      const okABC = filtroABC === "TODAS" || p.abc === filtroABC;
      const okCrit =
        filtroCritico === "TODOS" ||
        (filtroCritico === "CRITICO" &&
          p.diasCobertura > 0 &&
          p.diasCobertura <= 7) ||
        (filtroCritico === "RIESGO" &&
          p.diasCobertura > 7 &&
          p.diasCobertura <= 15) ||
        (filtroCritico === "BAJO" &&
          p.diasCobertura > 15 &&
          p.diasCobertura <= 30);
      return okBusq && okCat && okABC && okCrit;
    });
  }, [productos, busqueda, filtroCategoria, filtroABC, filtroCritico]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroCategoria, filtroABC, filtroCritico, sede]);

  const totalPages = Math.ceil(filtrados.length / itemsPerPage);
  const pageItems = filtrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const kpis = useMemo(
    () => ({
      total: productos.length,
      critico: productos.filter(
        (p) => p.diasCobertura > 0 && p.diasCobertura <= 7,
      ).length,
      riesgo: productos.filter(
        (p) => p.diasCobertura > 7 && p.diasCobertura <= 15,
      ).length,
      bajo: productos.filter(
        (p) => p.diasCobertura > 15 && p.diasCobertura <= 30,
      ).length,
      promedioDias:
        productos.length > 0
          ? Math.round(
              productos
                .filter((p) => p.diasCobertura < 999)
                .reduce((s, p) => s + p.diasCobertura, 0) /
                Math.max(
                  productos.filter((p) => p.diasCobertura < 999).length,
                  1,
                ),
            )
          : 0,
    }),
    [productos],
  );

  const exportar = () => {
    const data = filtrados.map((p) => ({
      Código: p.codigo,
      Nombre: p.name,
      ABC: p.abc,
      Categoría: p.categoria,
      "Stock disponible": p.stockDisponible,
      "Ventas 45d": p.ventas45d,
      "Demanda diaria": p.demandaDiaria,
      "Días cobertura":
        p.diasCobertura >= 999 ? "Sin riesgo" : p.diasCobertura,
      "Días deseados": p.diasInvDeseado,
      "Fecha quiebre estimada": p.fechaQuiebreEstimada,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cobertura");
    XLSX.writeFile(
      wb,
      `Cobertura_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600 font-medium">
          Calculando días de cobertura...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Días de Cobertura</h1>
        <p className="text-gray-500">
          Cuántos días de stock quedan para productos con demanda activa,
          ordenados de menor a mayor cobertura.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="border-red-200 bg-red-50/20 shadow-sm cursor-pointer"
          onClick={() =>
            setFiltroCritico(filtroCritico === "CRITICO" ? "TODOS" : "CRITICO")
          }
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Crítico (≤7 días)
            </p>
            <p className="text-3xl font-bold text-red-600 mt-1">
              {kpis.critico}
            </p>
            <p className="text-xs text-gray-400 mt-1">Menos de 1 semana</p>
          </CardContent>
        </Card>
        <Card
          className="border-orange-200 bg-orange-50/40 shadow-sm cursor-pointer"
          onClick={() =>
            setFiltroCritico(filtroCritico === "RIESGO" ? "TODOS" : "RIESGO")
          }
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Riesgo (8–15 días)
            </p>
            <p className="text-3xl font-bold text-orange-600 mt-1">
              {kpis.riesgo}
            </p>
            <p className="text-xs text-gray-400 mt-1">Menos de 2 semanas</p>
          </CardContent>
        </Card>
        <Card
          className="border-yellow-200 bg-yellow-50/40 shadow-sm cursor-pointer"
          onClick={() =>
            setFiltroCritico(filtroCritico === "BAJO" ? "TODOS" : "BAJO")
          }
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Bajo (16–30 días)
            </p>
            <p className="text-3xl font-bold text-yellow-700 mt-1">
              {kpis.bajo}
            </p>
            <p className="text-xs text-gray-400 mt-1">Menos de 1 mes</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Promedio cobertura
            </p>
            <p className="text-3xl font-bold text-blue-700 mt-1">
              {kpis.promedioDias}d
            </p>
            <p className="text-xs text-gray-400 mt-1">{kpis.total} productos</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-center">
          <Select value={sede} onValueChange={setSede}>
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
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Buscar SKU o nombre..."
              className="pl-9"
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
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger>
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las categorías</SelectItem>
              {categoriasUnicas.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={exportar}
            variant="outline"
            className="border-blue-500 text-blue-700 hover:bg-blue-50"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-blue-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-blue-50/30">
                <TableRow>
                  <TableHead className="px-6 w-[300px]">
                    <ColumnHeader label="Producto" tooltip={COLUMN_TOOLTIPS.Producto} />
                  </TableHead>
                  <TableHead className="text-center">
                    <ColumnHeader label="ABC" tooltip={COLUMN_TOOLTIPS.ABC} />
                  </TableHead>
                  <TableHead className="text-center">
                    <ColumnHeader label="Categoría" tooltip={COLUMN_TOOLTIPS.Categoría} />
                  </TableHead>
                  <TableHead className="text-center">
                    <ColumnHeader label="Stock" tooltip={COLUMN_TOOLTIPS.Stock} />
                  </TableHead>
                  <TableHead className="text-center">
                    <ColumnHeader label="Ventas 45d" tooltip={COLUMN_TOOLTIPS["Ventas 45d"]} />
                  </TableHead>
                  <TableHead className="text-center">
                    <ColumnHeader label="Dem. diaria" tooltip={COLUMN_TOOLTIPS["Dem. diaria"]} />
                  </TableHead>
                  <TableHead className="text-center font-bold text-blue-700">
                    <ColumnHeader label="Días cobertura" tooltip={COLUMN_TOOLTIPS["Días cobertura"]} />
                  </TableHead>
                  <TableHead className="text-right pr-6">
                    <ColumnHeader label="Quiebre estimado" tooltip={COLUMN_TOOLTIPS["Quiebre estimado"]} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-gray-400"
                    >
                      No hay productos con los filtros seleccionados.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => (
                    <TableRow
                      key={p.id}
                      className={
                        p.diasCobertura <= 7
                          ? "bg-orange-50/40 hover:bg-orange-50/70"
                          : "hover:bg-blue-50/20"
                      }
                    >
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm">{p.codigo}</div>
                        <div
                          className="text-xs text-gray-500 truncate max-w-[260px]"
                          title={p.name}
                        >
                          {p.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          className={`${abcColor(p.abc)} text-white font-bold`}
                        >
                          {p.abc}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-xs text-gray-500">
                        {p.categoria}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {p.stockDisponible}
                      </TableCell>
                      <TableCell className="text-center text-gray-600">
                        {p.ventas45d}
                      </TableCell>
                      <TableCell className="text-center text-gray-500">
                        {p.demandaDiaria.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-center">
                        <CoberturaChip dias={p.diasCobertura} />
                      </TableCell>
                      <TableCell className="text-right pr-6 text-xs text-gray-500">
                        {p.fechaQuiebreEstimada !== "Sin riesgo"
                          ? p.fechaQuiebreEstimada
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
              {filtrados.length} productos
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
                <span className="text-sm text-gray-500">
                  {currentPage} / {totalPages}
                </span>
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
