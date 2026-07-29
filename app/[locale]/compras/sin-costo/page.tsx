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
import { AlertCircle, Download, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

interface ProductoSinCosto {
  id: number;
  codigo: string;
  name: string;
  categoria: string;
  sinCostoEn: string[];
  stockPorSede: Record<string, number>;
  stockTotal: number;
}

const SEDES = [
  { id: "todas", label: "Todas las sedes" },
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

export default function SinCostoPage() {
  const [productos, setProductos] = useState<ProductoSinCosto[]>([]);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("TODAS");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    setLoading(true);
    const params = sede !== "todas" ? `?sede=${sede}` : "";
    fetch(`/api/compras/sin-costo${params}`)
      .then((r) => r.json())
      .then((r) => { if (r.success) setProductos(r.data); })
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
      const ok = t === "" || p.codigo.toLowerCase().includes(t) || p.name.toLowerCase().includes(t);
      const cat = filtroCategoria === "TODAS" || p.categoria === filtroCategoria;
      return ok && cat;
    });
  }, [productos, busqueda, filtroCategoria]);

  useEffect(() => { setCurrentPage(1); }, [busqueda, filtroCategoria, sede]);

  const totalPages = Math.ceil(filtrados.length / itemsPerPage);
  const pageItems = filtrados.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const exportar = () => {
    const data = filtrados.map((p) => ({
      Código: p.codigo,
      Nombre: p.name,
      Categoría: p.categoria,
      "Sin costo en": p.sinCostoEn.join(", "),
      "Stock total": p.stockTotal,
      ...Object.fromEntries(Object.entries(p.stockPorSede).map(([k, v]) => [`Stock ${k}`, v])),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sin Costo");
    XLSX.writeFile(wb, `Sin_Costo_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-amber-500 mb-4" />
        <p className="text-gray-600 font-medium">Verificando costos por sede...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Productos Sin Costo</h1>
        <p className="text-gray-500">
          Productos con stock disponible pero sin precio de costo registrado en Odoo.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">SKUs sin costo</p>
            <p className="text-3xl font-bold text-amber-700 mt-1">{filtrados.length}</p>
            <p className="text-xs text-gray-400 mt-1">Con stock mayor a 0</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Stock total afectado</p>
            <p className="text-3xl font-bold text-gray-700 mt-1">
              {filtrados.reduce((s, p) => s + p.stockTotal, 0).toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">Unidades sin valorizar</p>
          </CardContent>
        </Card>
        <Card className="border-gray-200 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Categorías afectadas</p>
            <p className="text-3xl font-bold text-gray-700 mt-1">
              {new Set(filtrados.map((p) => p.categoria)).size}
            </p>
            <p className="text-xs text-gray-400 mt-1">Categorías distintas</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-center">
          <Select value={sede} onValueChange={(v) => setSede(v)}>
            <SelectTrigger><SelectValue placeholder="Sede" /></SelectTrigger>
            <SelectContent>
              {SEDES.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
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
            <SelectTrigger><SelectValue placeholder="Categoría" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TODAS">Todas las Categorías</SelectItem>
              {categoriasUnicas.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={exportar} variant="outline" className="border-amber-500 text-amber-700 hover:bg-amber-50">
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-amber-200">
        <CardHeader className="bg-amber-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-amber-700">
            <AlertCircle className="h-5 w-5 mr-2" /> Productos sin costo registrado
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-amber-50/30">
                <TableRow>
                  <TableHead className="px-6 w-[300px]">Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-center">Sin costo en</TableHead>
                  <TableHead className="text-center">Stock por sede</TableHead>
                  <TableHead className="text-center font-bold">Stock total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-400">
                      No se encontraron productos sin costo con stock disponible.
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((p) => (
                    <TableRow key={p.id} className="hover:bg-amber-50/20">
                      <TableCell className="px-6">
                        <div className="font-semibold text-sm">{p.codigo}</div>
                        <div className="text-xs text-gray-500 truncate max-w-[260px]" title={p.name}>{p.name}</div>
                      </TableCell>
                      <TableCell className="text-sm text-gray-600">{p.categoria}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-wrap gap-1 justify-center">
                          {p.sinCostoEn.map((s) => (
                            <Badge key={s} variant="outline" className="bg-amber-100 border-amber-300 text-amber-800 text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <div className="flex flex-col gap-0.5">
                          {Object.entries(p.stockPorSede).map(([sede, qty]) => (
                            <span key={sede} className="text-xs text-gray-600">
                              {sede}: <span className="font-medium">{qty}</span>
                            </span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="font-bold text-gray-800">{p.stockTotal}</span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {filtrados.length === 0 ? "0 productos" : `${filtrados.length} producto${filtrados.length !== 1 ? "s" : ""}`}
            </p>
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
