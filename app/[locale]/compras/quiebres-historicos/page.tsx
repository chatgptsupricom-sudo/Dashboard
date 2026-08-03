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
import { Download, History, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";

interface QuiebreHistorico {
  id: number;
  codigo: string;
  name: string;
  categoria: string;
  stockActual: number;
  totalSalidas180d: number;
  semanasConVenta: number;
  quiebresContados: number;
  frecuenciaQuiebre: number;
}

function FreqBadge({ pct }: { pct: number }) {
  if (pct >= 30)
    return (
      <Badge className="bg-red-100 text-red-700 border-red-300 border">
        {pct}%
      </Badge>
    );
  if (pct >= 15)
    return (
      <Badge className="bg-orange-100 text-orange-700 border-orange-300 border">
        {pct}%
      </Badge>
    );
  return (
    <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 border">
      {pct}%
    </Badge>
  );
}

export default function QuiebresHistoricosPage() {
  const [productos, setProductos] = useState<QuiebreHistorico[]>([]);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState("9");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setLoading(true);
    const params = `?sede=${sede}`;
    fetch(`/api/compras/quiebres-historicos${params}`)
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
      const okB =
        t === "" ||
        p.codigo.toLowerCase().includes(t) ||
        p.name.toLowerCase().includes(t);
      const okC =
        filtroCategoria === "TODAS" || p.categoria === filtroCategoria;
      return okB && okC;
    });
  }, [productos, busqueda, filtroCategoria]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, filtroCategoria, sede]);

  const totalPages = Math.ceil(filtrados.length / itemsPerPage);
  const pageItems = filtrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const exportar = () => {
    const data = filtrados.map((p) => ({
      Código: p.codigo,
      Nombre: p.name,
      Categoría: p.categoria,
      "Stock actual": p.stockActual,
      "Salidas 180d": p.totalSalidas180d,
      "Semanas con venta": p.semanasConVenta,
      "Quiebres detectados": p.quiebresContados,
      "Frecuencia quiebre (%)": p.frecuenciaQuiebre,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Quiebres_Historicos");
    XLSX.writeFile(
      wb,
      `Quiebres_Historicos_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-rose-600 mb-4" />
        <p className="text-gray-600 font-medium">
          Analizando histórico de quiebres (180 días)...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Quiebres Históricos
        </h1>
        <p className="text-gray-500">
          Productos que han experimentado brechas sin ventas en los últimos 6
          meses (posibles quiebres de stock).
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-rose-200 bg-rose-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Productos con quiebres
            </p>
            <p className="text-3xl font-bold text-rose-700 mt-1">
              {filtrados.length}
            </p>
            <p className="text-xs text-gray-400 mt-1">En los últimos 6 meses</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Promedio de quiebres
            </p>
            <p className="text-3xl font-bold text-gray-700 mt-1">
              {filtrados.length > 0
                ? (
                    filtrados.reduce((s, p) => s + p.quiebresContados, 0) /
                    filtrados.length
                  ).toFixed(1)
                : "0"}
            </p>
            <p className="text-xs text-gray-400 mt-1">Por producto</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Mayor frecuencia
            </p>
            <p className="text-3xl font-bold text-red-700 mt-1">
              {filtrados.length > 0
                ? Math.max(...filtrados.map((p) => p.frecuenciaQuiebre))
                : 0}
              %
            </p>
            <p className="text-xs text-gray-400 mt-1">% semanas en quiebre</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
            className="border-rose-500 text-rose-700 hover:bg-rose-50"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-rose-200">
        <CardHeader className="bg-rose-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-rose-700">
            <History className="h-5 w-5 mr-2" /> Productos reincidentes en
            quiebre
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-rose-50/30">
                <TableRow>
                  <TableHead className="px-6 w-[300px]">Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-center">Stock actual</TableHead>
                  <TableHead className="text-center">Salidas 180d</TableHead>
                  <TableHead className="text-center">Sem. con venta</TableHead>
                  <TableHead className="text-center font-bold text-rose-700">
                    Quiebres
                  </TableHead>
                  <TableHead className="text-center">Frecuencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center py-8 text-gray-400"
                    >
                      No se detectaron quiebres históricos con los filtros
                      actuales.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => (
                    <TableRow key={p.id} className="hover:bg-rose-50/20">
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm">{p.codigo}</div>
                        <div
                          className="text-xs text-gray-500 truncate max-w-[260px]"
                          title={p.name}
                        >
                          {p.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {p.categoria}
                      </TableCell>
                      <TableCell className="text-center">
                        {p.stockActual > 0 ? (
                          <span className="font-medium text-gray-700">
                            {p.stockActual}
                          </span>
                        ) : (
                          <Badge className="bg-red-600 text-white text-xs">
                            0
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center text-gray-600">
                        {p.totalSalidas180d.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center text-gray-500">
                        {p.semanasConVenta} / 26
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-rose-700 text-lg">
                          {p.quiebresContados}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <FreqBadge pct={p.frecuenciaQuiebre} />
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

      <p className="text-xs text-gray-400">
        Metodología: se analizan movimientos de stock de los últimos 180 días.
        Un quiebre se cuenta solo cuando una semana sin ventas entre semanas con
        ventas coincide con una recepción de compra (reabastecimiento), lo que
        confirma que el producto realmente se agotó y no fue simplemente baja
        demanda.
      </p>
    </div>
  );
}
