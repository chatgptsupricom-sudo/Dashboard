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
import { CalendarDays, Download, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface ProductoCobertura {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  stockDisponible: number;
  ventas45d: number;
  demandaDiaria: number;
  diasCobertura: number;
  nivelCritico: string;
  fechaQuiebreEstimada: string;
  costo: number;
}

const SEDES = [
  { id: "todas", label: "Todas las sedes" },
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

function CoberturaChip({ dias }: { dias: number }) {
  if (dias >= 999) return <Badge className="bg-green-100 text-green-700 border-green-300 border">Sin riesgo</Badge>;
  if (dias <= 0) return <Badge className="bg-red-600 text-white">QUIEBRE</Badge>;
  if (dias <= 7) return <Badge className="bg-red-100 text-red-700 border-red-300 border">{dias}d</Badge>;
  if (dias <= 15) return <Badge className="bg-orange-100 text-orange-700 border-orange-300 border">{dias}d</Badge>;
  if (dias <= 30) return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 border">{dias}d</Badge>;
  return <Badge className="bg-blue-50 text-blue-700 border-blue-200 border">{dias}d</Badge>;
}

export default function CoberturaPage() {
  const [productos, setProductos] = useState<ProductoCobertura[]>([]);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [filtroCritico, setFiltroCritico] = useState("TODOS");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setLoading(true);
    const params = sede !== "todas" ? `?sede=${sede}` : "";
    fetch(`/api/compras/quiebre${params}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.success) {
          const withCobertura: ProductoCobertura[] = r.data.map((p: any) => ({
            ...p,
            diasCobertura: p.demandaDiaria > 0 ? Math.floor(p.stockDisponible / p.demandaDiaria) : 999,
          }));
          // Sort by diasCobertura ascending (least coverage first)
          withCobertura.sort((a, b) => a.diasCobertura - b.diasCobertura);
          setProductos(withCobertura);
        }
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
      const okBusq = t === "" || p.codigo.toLowerCase().includes(t) || p.name.toLowerCase().includes(t);
      const okCat = filtroCategoria === "TODAS" || p.categoria === filtroCategoria;
      const okCrit = filtroCritico === "TODOS"
        || (filtroCritico === "QUIEBRE" && p.diasCobertura <= 0)
        || (filtroCritico === "CRITICO" && p.diasCobertura > 0 && p.diasCobertura <= 7)
        || (filtroCritico === "RIESGO" && p.diasCobertura > 7 && p.diasCobertura <= 15)
        || (filtroCritico === "BAJO" && p.diasCobertura > 15 && p.diasCobertura <= 30);
      return okBusq && okCat && okCrit;
    });
  }, [productos, busqueda, filtroCategoria, filtroCritico]);

  useEffect(() => { setCurrentPage(1); }, [busqueda, filtroCategoria, filtroCritico, sede]);

  const totalPages = Math.ceil(filtrados.length / itemsPerPage);
  const pageItems = filtrados.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const kpis = useMemo(() => ({
    quiebre: filtrados.filter((p) => p.diasCobertura <= 0).length,
    critico: filtrados.filter((p) => p.diasCobertura > 0 && p.diasCobertura <= 7).length,
    riesgo: filtrados.filter((p) => p.diasCobertura > 7 && p.diasCobertura <= 15).length,
    bajo: filtrados.filter((p) => p.diasCobertura > 15 && p.diasCobertura <= 30).length,
    promedioDias: filtrados.length > 0
      ? Math.round(filtrados.filter(p => p.diasCobertura < 999).reduce((s, p) => s + p.diasCobertura, 0) / Math.max(filtrados.filter(p => p.diasCobertura < 999).length, 1))
      : 0,
  }), [filtrados]);

  const exportar = () => {
    const data = filtrados.map((p) => ({
      Código: p.codigo,
      Nombre: p.name,
      Categoría: p.categoria,
      "Stock disponible": p.stockDisponible,
      "Ventas 45d": p.ventas45d,
      "Demanda diaria": Number(p.demandaDiaria.toFixed(2)),
      "Días de cobertura": p.diasCobertura >= 999 ? "Sin riesgo" : p.diasCobertura,
      "Fecha quiebre estimada": p.fechaQuiebreEstimada,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Cobertura");
    XLSX.writeFile(wb, `Cobertura_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600 font-medium">Calculando días de cobertura...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Días de Cobertura</h1>
        <p className="text-gray-500">
          Cuántos días de stock quedan para productos con demanda activa, ordenados de menor a mayor cobertura.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-red-200 bg-red-50/40 shadow-sm cursor-pointer" onClick={() => setFiltroCritico(filtroCritico === "QUIEBRE" ? "TODOS" : "QUIEBRE")}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">En quiebre</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{kpis.quiebre}</p>
            <p className="text-xs text-gray-400 mt-1">Stock = 0</p>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/20 shadow-sm cursor-pointer" onClick={() => setFiltroCritico(filtroCritico === "CRITICO" ? "TODOS" : "CRITICO")}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Crítico (≤7 días)</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{kpis.critico}</p>
            <p className="text-xs text-gray-400 mt-1">Menos de 1 semana</p>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/40 shadow-sm cursor-pointer" onClick={() => setFiltroCritico(filtroCritico === "RIESGO" ? "TODOS" : "RIESGO")}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Riesgo (8–15 días)</p>
            <p className="text-3xl font-bold text-orange-600 mt-1">{kpis.riesgo}</p>
            <p className="text-xs text-gray-400 mt-1">Menos de 2 semanas</p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50/40 shadow-sm cursor-pointer" onClick={() => setFiltroCritico(filtroCritico === "BAJO" ? "TODOS" : "BAJO")}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Bajo (16–30 días)</p>
            <p className="text-3xl font-bold text-yellow-700 mt-1">{kpis.bajo}</p>
            <p className="text-xs text-gray-400 mt-1">Menos de 1 mes</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger><SelectValue placeholder="Sede" /></SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input placeholder="Buscar SKU o nombre..." className="pl-9" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
            <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las categorías</SelectItem>
              {categoriasUnicas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={exportar} variant="outline" className="border-blue-500 text-blue-700 hover:bg-blue-50">
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-blue-200">
        <CardHeader className="bg-blue-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-blue-700">
            <CalendarDays className="h-5 w-5 mr-2" /> Productos con menor cobertura primero
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-blue-50/30">
                <TableRow>
                  <TableHead className="px-6 w-[300px]">Producto</TableHead>
                  <TableHead className="text-center">Categoría</TableHead>
                  <TableHead className="text-center">Stock</TableHead>
                  <TableHead className="text-center">Ventas 45d</TableHead>
                  <TableHead className="text-center">Dem. diaria</TableHead>
                  <TableHead className="text-center font-bold text-blue-700">Días cobertura</TableHead>
                  <TableHead className="text-right pr-6">Quiebre estimado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-400">No hay productos con los filtros seleccionados.</TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => (
                    <TableRow key={p.id} className="hover:bg-blue-50/20">
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm">{p.codigo}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[260px]" title={p.name}>{p.name}</div>
                      </TableCell>
                      <TableCell className="text-center text-xs text-gray-500">{p.categoria}</TableCell>
                      <TableCell className="text-center font-medium">{p.stockDisponible}</TableCell>
                      <TableCell className="text-center text-gray-600">{p.ventas45d}</TableCell>
                      <TableCell className="text-center text-gray-500">{p.demandaDiaria.toFixed(1)}</TableCell>
                      <TableCell className="text-center">
                        <CoberturaChip dias={p.diasCobertura} />
                      </TableCell>
                      <TableCell className="text-right pr-6 text-xs text-gray-500">
                        {p.fechaQuiebreEstimada !== "Sin riesgo inmediato" ? p.fechaQuiebreEstimada : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">{filtrados.length} productos</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))} disabled={currentPage === 1}>Anterior</Button>
                <span className="text-sm text-gray-500">{currentPage} / {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>Siguiente</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
