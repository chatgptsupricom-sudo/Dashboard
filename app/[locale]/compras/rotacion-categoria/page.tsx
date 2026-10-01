"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Layers, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { SEDES } from "@/lib/compras/constants";
import { ColumnHeader } from "@/components/compras/column-header";
import { COLUMN_TOOLTIPS } from "@/lib/compras/column-tooltips";

interface RotacionCategoria {
  nombre: string;
  skus: number;
  clasA: number;
  clasB: number;
  clasC: number;
  pctA: number;
  pctB: number;
  pctC: number;
  ventas45d: number;
  stockTotal: number;
  capitalEstancado: number;
  skusQuiebre: number;
}

interface ProductoModal {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  stock: number;
  ventas45d: number;
  costo: number;
  capitalEstancado: number;
  quiebre: boolean;
  abc: string;
}

function AbcBar({
  pctA,
  pctB,
  pctC,
}: {
  pctA: number;
  pctB: number;
  pctC: number;
}) {
  return (
    <div className="flex h-2 w-full rounded overflow-hidden gap-px">
      <div
        className="bg-green-500"
        style={{ width: `${pctA}%` }}
        title={`A: ${pctA}%`}
      />
      <div
        className="bg-yellow-400"
        style={{ width: `${pctB}%` }}
        title={`B: ${pctB}%`}
      />
      <div
        className="bg-gray-300"
        style={{ width: `${pctC}%` }}
        title={`C: ${pctC}%`}
      />
    </div>
  );
}

export default function RotacionCategoriaPage() {
  const [categorias, setCategorias] = useState<RotacionCategoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [sede, setSede] = useState("9");
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalMode, setModalMode] = useState<"categories" | "products">(
    "products",
  );
  const [modalProductos, setModalProductos] = useState<ProductoModal[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalFromCategory, setModalFromCategory] = useState(false);

  const abrirModal = async (
    title: string,
    params: string,
    mode: "categories" | "products" = "products",
    fromCategory = false,
  ) => {
    setModalTitle(title);
    setModalMode(mode);
    setModalFromCategory(fromCategory);
    setModalOpen(true);
    if (mode === "categories") {
      setModalProductos([]);
      return;
    }
    setModalLoading(true);
    const sedeParam = `&sede=${sede}`;
    try {
      const r = await fetch(
        `/api/compras/rotacion-categoria/productos?${params}${sedeParam}`,
      );
      const j = await r.json();
      setModalProductos(j.success ? j.data : []);
    } catch {
      setModalProductos([]);
    } finally {
      setModalLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    const params = `?sede=${sede}`;
    fetch(`/api/compras/rotacion-categoria${params}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.success) setCategorias(r.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sede]);

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda, sede]);

  const filtradas = useMemo(() => {
    const t = busqueda.toLowerCase();
    return t === ""
      ? categorias
      : categorias.filter((c) => c.nombre.toLowerCase().includes(t));
  }, [categorias, busqueda]);

  const totalPages = Math.ceil(filtradas.length / itemsPerPage);
  const pageItems = filtradas.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const exportar = () => {
    const data = filtradas.map((c) => ({
      Categoría: c.nombre,
      SKUs: c.skus,
      "Clase A": c.clasA,
      "Clase B": c.clasB,
      "Clase C": c.clasC,
      "% A": c.pctA,
      "% B": c.pctB,
      "% C": c.pctC,
      "Ventas 45d": c.ventas45d,
      "Stock total": c.stockTotal,
      "Capital estancado ($)": c.capitalEstancado,
      "SKUs en quiebre": c.skusQuiebre,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rotacion_Categoria");
    XLSX.writeFile(
      wb,
      `Rotacion_Categoria_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[80vh]">
        <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
        <p className="text-gray-600 font-medium">
          Calculando rotación por categoría...
        </p>
      </div>
    );
  }

  const totalVentas = filtradas.reduce((s, c) => s + c.ventas45d, 0);
  const totalCapital = filtradas.reduce((s, c) => s + c.capitalEstancado, 0);
  const totalQuiebres = filtradas.reduce((s, c) => s + c.skusQuiebre, 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Rotación por Categoría
        </h1>
        <p className="text-gray-500">
          Clasificación ABC y métricas de inventario agrupadas por categoría de
          producto.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="border-indigo-200 bg-indigo-50/40 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => abrirModal("Todas las categorías", "", "categories")}
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Categorías
            </p>
            <p className="text-3xl font-bold text-indigo-700 mt-1">
              {filtradas.length}
            </p>
            <p className="text-xs text-gray-400 mt-1">Con productos activos</p>
          </CardContent>
        </Card>
        <Card
          className="border-gray-200 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() =>
            abrirModal("Productos con ventas (45 días)", `categoria=&tipo=`)
          }
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Ventas (45 días)
            </p>
            <p className="text-3xl font-bold text-gray-700 mt-1">
              {totalVentas.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400 mt-1">Unidades</p>
          </CardContent>
        </Card>
        <Card
          className="border-red-200 bg-red-50/40 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() =>
            abrirModal("Productos con capital estancado", `tipo=estancado`, "products", true)
          }
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Capital estancado
            </p>
            <p className="text-3xl font-bold text-red-700 mt-1">
              $
              {totalCapital.toLocaleString("en-US", {
                maximumFractionDigits: 0,
              })}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Stock sin rotación &gt; 45d
            </p>
          </CardContent>
        </Card>
        <Card
          className="border-orange-200 bg-orange-50/40 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => abrirModal("Productos en quiebre", `tipo=quiebre`)}
        >
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              SKUs en quiebre
            </p>
            <p className="text-3xl font-bold text-orange-700 mt-1">
              {totalQuiebres}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Stock 0 con demanda activa
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white shadow-sm border-gray-200">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4">
          <Select value={sede} onValueChange={setSede}>
            <SelectTrigger className="w-full sm:w-48">
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
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Buscar categoría..."
              className="pl-9"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <Button
            onClick={exportar}
            variant="outline"
            className="border-indigo-500 text-indigo-700 hover:bg-indigo-50"
          >
            <Download className="h-4 w-4 mr-2" /> Exportar
          </Button>
        </CardContent>
      </Card>

      <Card className="shadow-md border-indigo-200">
        <CardHeader className="bg-indigo-50/50 pb-4">
          <CardTitle className="text-lg flex items-center text-indigo-700">
            <Layers className="h-5 w-5 mr-2" /> Categorías ordenadas por ventas
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-indigo-50/40 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[220px]">
                    <ColumnHeader label="Categoría" tooltip={COLUMN_TOOLTIPS.Categoría} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">
                    <ColumnHeader label="SKUs" tooltip={COLUMN_TOOLTIPS.SKUs} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">
                    <ColumnHeader label="Ventas 45d" tooltip={COLUMN_TOOLTIPS["Ventas 45d"]} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600">
                    <ColumnHeader label="Stock" tooltip={COLUMN_TOOLTIPS.Stock} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[160px]">
                    <ColumnHeader label="Clasificación ABC" tooltip={COLUMN_TOOLTIPS["Clasificación ABC"]} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-red-700">
                    <ColumnHeader label="Capital estancado" tooltip={COLUMN_TOOLTIPS["Capital estancado"]} />
                  </th>
                  <th className="text-center px-3 py-3 font-medium text-orange-700">
                    <ColumnHeader label="Quiebres" tooltip={COLUMN_TOOLTIPS.Quiebres} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-gray-400">
                      No hay datos disponibles.
                    </td>
                  </tr>
                ) : (
                  pageItems.map((c, i) => (
                    <tr
                      key={c.nombre}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3">
                        <button
                          className="font-medium text-indigo-700 hover:text-indigo-900 hover:underline text-left"
                          onClick={() =>
                            abrirModal(
                              `Productos: ${c.nombre}`,
                              `categoria=${encodeURIComponent(c.nombre)}`,
                              "products",
                              true,
                            )
                          }
                        >
                          {c.nombre}
                        </button>
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">
                        {c.skus}
                      </td>
                      <td className="px-3 py-3 text-center font-semibold text-gray-800">
                        {c.ventas45d.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-600">
                        {c.stockTotal.toLocaleString()}
                      </td>
                      <td className="px-3 py-3">
                        <div className="space-y-1">
                          <AbcBar pctA={c.pctA} pctB={c.pctB} pctC={c.pctC} />
                          <div className="flex justify-between text-[10px] text-gray-500">
                            <span className="text-green-600">A:{c.pctA}%</span>
                            <span className="text-yellow-600">B:{c.pctB}%</span>
                            <span className="text-gray-400">C:{c.pctC}%</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.capitalEstancado > 0 ? (
                          <span className="font-medium text-red-700">
                            $
                            {c.capitalEstancado.toLocaleString("en-US", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {c.skusQuiebre > 0 ? (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-300 border">
                            {c.skusQuiebre}
                          </Badge>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between p-4 border-t">
            <p className="text-sm text-gray-500">
              {filtradas.length} categorías
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

      {/* ABC legend */}
      <div className="flex gap-6 text-sm text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-green-500 inline-block" /> Clase A
          — top 80% ventas
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> Clase
          B — 80-95%
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded bg-gray-300 inline-block" /> Clase C
          — cola
        </div>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[1400px] w-[98vw] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {modalMode === "categories" ? (
              <table className="w-full text-sm">
                <thead className="bg-indigo-50/40 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">
                      <ColumnHeader label="Categoría" tooltip={COLUMN_TOOLTIPS.Categoría} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">
                      <ColumnHeader label="SKUs" tooltip={COLUMN_TOOLTIPS.SKUs} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">
                      <ColumnHeader label="Ventas 45d" tooltip={COLUMN_TOOLTIPS["Ventas 45d"]} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600">
                      <ColumnHeader label="Stock" tooltip={COLUMN_TOOLTIPS.Stock} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-gray-600 min-w-[160px]">
                      <ColumnHeader label="Clasificación ABC" tooltip={COLUMN_TOOLTIPS["Clasificación ABC"]} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-red-700">
                      <ColumnHeader label="Capital estancado" tooltip={COLUMN_TOOLTIPS["Capital estancado"]} />
                    </th>
                    <th className="text-center px-3 py-3 font-medium text-orange-700">
                      <ColumnHeader label="Quiebres" tooltip={COLUMN_TOOLTIPS.Quiebres} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-8 text-gray-400"
                      >
                        No hay datos disponibles.
                      </td>
                    </tr>
                  ) : (
                    filtradas.map((c) => (
                      <tr
                        key={c.nombre}
                        className="border-b last:border-0 hover:bg-gray-50"
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">
                          {c.nombre}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600">
                          {c.skus}
                        </td>
                        <td className="px-3 py-3 text-center font-semibold text-gray-800">
                          {c.ventas45d.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 text-center text-gray-600">
                          {c.stockTotal.toLocaleString()}
                        </td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <AbcBar pctA={c.pctA} pctB={c.pctB} pctC={c.pctC} />
                            <div className="flex justify-between text-[10px] text-gray-500">
                              <span className="text-green-600">
                                A:{c.pctA}%
                              </span>
                              <span className="text-yellow-600">
                                B:{c.pctB}%
                              </span>
                              <span className="text-gray-400">C:{c.pctC}%</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c.capitalEstancado > 0 ? (
                            <span className="font-medium text-red-700">
                              $
                              {c.capitalEstancado.toLocaleString("en-US", {
                                maximumFractionDigits: 0,
                              })}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {c.skusQuiebre > 0 ? (
                            <Badge className="bg-orange-100 text-orange-700 border-orange-300 border">
                              {c.skusQuiebre}
                            </Badge>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            ) : modalLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : modalProductos.length === 0 ? (
              <p className="text-center py-12 text-gray-400">Sin productos.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="Código" tooltip="Código SKU del producto" />
                    </th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="Nombre" tooltip={COLUMN_TOOLTIPS.Producto} />
                    </th>
                    {modalFromCategory ? (
                      <th className="text-center px-3 py-2 font-medium text-gray-600">
                        <ColumnHeader label="Cap. Estancado" tooltip={COLUMN_TOOLTIPS["Capital estancado"]} />
                      </th>
                    ) : (
                      <th className="text-left px-3 py-2 font-medium text-gray-600">
                        <ColumnHeader label="Categoría" tooltip={COLUMN_TOOLTIPS.Categoría} />
                      </th>
                    )}
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="Stock" tooltip={COLUMN_TOOLTIPS.Stock} />
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="Ventas 45d" tooltip={COLUMN_TOOLTIPS["Ventas 45d"]} />
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="Costo" tooltip={COLUMN_TOOLTIPS["Costo Unit."]} />
                    </th>
                    <th className="text-center px-3 py-2 font-medium text-gray-600">
                      <ColumnHeader label="ABC" tooltip={COLUMN_TOOLTIPS.ABC} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modalProductos.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b last:border-0 hover:bg-gray-50"
                    >
                      <td className="px-3 py-2 text-gray-600 font-mono text-xs">
                        {p.codigo}
                      </td>
                      <td className="px-3 py-2 text-gray-800">{p.nombre}</td>
                      {modalFromCategory ? (
                        <td className="px-3 py-2 text-center text-gray-600">
                          {p.capitalEstancado > 0 ? (
                            <span className="text-red-600 font-semibold">
                              ${p.capitalEstancado.toLocaleString("en-US", { minimumFractionDigits: 0 })}
                            </span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ) : (
                        <td className="px-3 py-2 text-gray-600">{p.categoria}</td>
                      )}
                      <td className="px-3 py-2 text-center text-gray-600">
                        {p.stock}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-gray-800">
                        {p.ventas45d}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">
                        $
                        {p.costo.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          className={
                            p.abc === "A"
                              ? "bg-green-100 text-green-700"
                              : p.abc === "B"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-gray-100 text-gray-600"
                          }
                        >
                          {p.abc}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="text-xs text-gray-400 pt-2 border-t">
            {modalMode === "categories"
              ? `${filtradas.length} categorías`
              : `${modalProductos.length} producto${modalProductos.length !== 1 ? "s" : ""}`}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
