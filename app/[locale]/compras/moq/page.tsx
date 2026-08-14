"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  Loader2,
  Package,
  Search,
  Upload,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ColumnHeader } from "@/components/compras/column-header";
import { COLUMN_TOOLTIPS } from "@/lib/compras/column-tooltips";

interface MoqItem {
  sku: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  costo: number;
}

function fmt(n: number) {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MoqConfigPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { toast } = useToast();

  const [moqs, setMoqs] = useState<MoqItem[]>([]);
  const [loadingMoqs, setLoadingMoqs] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const fetchMoqs = async () => {
    setLoadingMoqs(true);
    try {
      const res = await fetch("/api/compras/moq");
      const result = await res.json();
      if (result.success) setMoqs(result.data);
    } catch (e) {
      console.error("Error fetching MOQs:", e);
    } finally {
      setLoadingMoqs(false);
    }
  };

  useEffect(() => {
    fetchMoqs();
  }, []);

  const moqsFiltrados = useMemo(() => {
    const termino = busqueda.toLowerCase();
    if (!termino) return moqs;
    return moqs.filter(
      (m) =>
        m.sku.toLowerCase().includes(termino) ||
        m.nombre.toLowerCase().includes(termino),
    );
  }, [moqs, busqueda]);

  const totalPages = Math.ceil(moqsFiltrados.length / itemsPerPage);
  const currentItems = moqsFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [busqueda]);

  const exportarExcel = () => {
    const data = moqsFiltrados.map((m, i) => ({
      "#": i + 1,
      SKU: m.sku,
      Producto: m.nombre,
      Categoría: m.categoria,
      MOQ: m.cantidad,
      "Costo Unit. ($)": m.costo,
      "Valor Total ($)": Number((m.cantidad * m.costo).toFixed(2)),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "MOQs_Actuales");
    XLSX.writeFile(
      workbook,
      `MOQs_Actuales_${new Date().toISOString().split("T")[0]}.xlsx`,
    );
  };

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/compras/moq/template");
      const contentType = response.headers.get("content-type");
      if (
        !response.ok ||
        !contentType ||
        !contentType.includes("application/json")
      ) {
        throw new Error("El servidor no devolvió una respuesta válida.");
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || "Error al obtener SKUs");
      }
      const excelData = result.data.map(
        (item: { sku: string; cantidad: any; costo: any }) => ({
          SKU: item.sku,
          MOQ: item.cantidad,
          PRECIO: item.costo,
        }),
      );
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Plantilla_MOQ");
      XLSX.writeFile(
        workbook,
        `Plantilla_Carga_MOQ_${new Date().toISOString().split("T")[0]}.xlsx`,
      );
      toast({
        title: "Plantilla descargada",
        description: "El archivo está listo para ser modificado.",
        className: "bg-green-50 border-green-200",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo generar la plantilla.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        const moqData = jsonData
          .map((row: any) => {
            const skuKey = Object.keys(row).find(
              (key) =>
                key.toLowerCase() === "sku" || key.toLowerCase() === "codigo",
            );
            const qtyKey = Object.keys(row).find(
              (key) =>
                key.toLowerCase().includes("cantidad") ||
                key.toLowerCase().includes("moq"),
            );
            const costKey = Object.keys(row).find(
              (key) =>
                key.toLowerCase().includes("costo") ||
                key.toLowerCase().includes("precio"),
            );
            let finalCost = null;
            if (costKey && row[costKey]) {
              const rawCost = String(row[costKey]);
              const cleanCost = rawCost
                .replace(/[^0-9,-]+/g, "")
                .replace(",", ".");
              const parsedCost = parseFloat(cleanCost);
              if (!isNaN(parsedCost)) finalCost = parsedCost;
            }
            return {
              sku: skuKey ? String(row[skuKey]).trim() : "",
              cantidad: qtyKey ? Number(row[qtyKey]) : null,
              costo: finalCost,
            };
          })
          .filter(
            (item) =>
              item.sku !== "" &&
              item.cantidad !== null &&
              !isNaN(item.cantidad) &&
              item.cantidad > 0,
          );

        if (moqData.length === 0) {
          toast({
            title: "Error de Formato o Archivo Vacío",
            description:
              "Asegúrate de llenar la columna MOQ con números válidos.",
            variant: "destructive",
          });
          setIsUploading(false);
          return;
        }

        const response = await fetch("/api/compras/moq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moqData }),
        });
        const result = await response.json();

        if (response.ok) {
          toast({
            title: "Carga Exitosa",
            description: result.message,
            className: "bg-green-50 border-green-200 text-green-800",
          });
          fetchMoqs();
        } else {
          toast({
            title: "Error al subir",
            description: result.error,
            variant: "destructive",
          });
        }
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      };
      reader.readAsBinaryString(file);
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo procesar el archivo Excel.",
        variant: "destructive",
      });
      setIsUploading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Configuración de MOQ
        </h1>
        <p className="text-gray-500">
          Gestiona las Cantidades Mínimas de Orden exigidas por los
          proveedores.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-2 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <FileSpreadsheet className="h-6 w-6 text-blue-600" />
              Importación Masiva
            </CardTitle>
            <CardDescription>
              Actualiza la base de datos subiendo un archivo Excel con los
              nuevos MOQ. El sistema detectará automáticamente los cambios.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-200 rounded-lg m-6 bg-gray-50/50">
            <div className="bg-white p-4 rounded-full shadow-sm mb-4">
              <Upload className="h-8 w-8 text-blue-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Sube tu archivo .xlsx o .csv
            </h3>
            <p className="text-sm text-gray-500 text-center mb-6 max-w-sm">
              Asegúrate de que el archivo cumpla con el formato requerido. Las
              actualizaciones quedan registradas en auditoría.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls, .csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              size="lg"
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Procesando
                  & Guardando...
                </>
              ) : (
                <>Seleccionar Archivo de Computadora</>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-blue-50/50 border-blue-100 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-blue-800">
              <Info className="h-5 w-5" />
              Instrucciones
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-blue-900 flex-1 flex flex-col">
            <p>
              Descarga la plantilla oficial. Esta contendrá todos los SKUs
              activos de Odoo listos para ser rellenados.
            </p>
            <Button
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              variant="outline"
              className="w-full bg-white border-blue-200 hover:bg-blue-50 text-blue-700"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Descargar Plantilla
            </Button>
            <div className="bg-white p-3 rounded border border-blue-100 shadow-sm mt-4">
              <span className="font-semibold block mb-2 text-gray-700">
                Validaciones:
              </span>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>
                    Si dejas un SKU en blanco o con valor 0, el sistema lo
                    ignorará.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                  <span>
                    Solo se guardarán y registrarán los SKUs cuyas cantidades
                    hayan cambiado.
                  </span>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabla de MOQs actuales */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" /> MOQs Configurados
          </h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Buscar SKU o nombre..."
                className="pl-9 w-full sm:w-64"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>
            <Button
              onClick={exportarExcel}
              variant="outline"
              className="border-blue-600 text-blue-700 hover:bg-blue-50"
            >
              <Download className="h-4 w-4 mr-2" /> Exportar
            </Button>
          </div>
        </div>

        <Card className="shadow-md border-blue-200">
          <CardContent className="p-0">
            {loadingMoqs ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
                <p className="text-gray-500">Cargando MOQs...</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-blue-50/30">
                      <TableRow>
                        <TableHead className="px-4 w-[160px]">
                          <ColumnHeader label="SKU" tooltip="Código SKU del producto" />
                        </TableHead>
                        <TableHead className="px-4">
                          <ColumnHeader label="Producto" tooltip={COLUMN_TOOLTIPS.Producto} />
                        </TableHead>
                        <TableHead>
                          <ColumnHeader label="Categoría" tooltip={COLUMN_TOOLTIPS.Categoría} />
                        </TableHead>
                        <TableHead className="text-center font-bold text-blue-700">
                          <ColumnHeader label="MOQ" tooltip={COLUMN_TOOLTIPS.MOQ} />
                        </TableHead>
                        <TableHead className="text-center">
                          <ColumnHeader label="Costo Unit." tooltip={COLUMN_TOOLTIPS["Costo Unit."]} />
                        </TableHead>
                        <TableHead className="text-center">
                          <ColumnHeader label="Valor Total" tooltip={COLUMN_TOOLTIPS["Valor ($)"]} />
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentItems.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-8 text-gray-500"
                          >
                            No hay MOQs configurados.
                          </TableCell>
                        </TableRow>
                      ) : (
                        currentItems.map((item) => (
                          <TableRow
                            key={item.sku}
                            className="hover:bg-blue-50/20"
                          >
                            <TableCell className="px-4">
                              <span className="font-mono font-semibold text-sm">
                                {item.sku}
                              </span>
                            </TableCell>
                            <TableCell className="px-4">
                              <div
                                className="text-sm truncate max-w-[300px]"
                                title={item.nombre}
                              >
                                {item.nombre}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {item.categoria}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center font-bold text-blue-700 text-base">
                              {item.cantidad}
                            </TableCell>
                            <TableCell className="text-center text-sm">
                              {item.costo > 0 ? (
                                `$${item.costo.toFixed(2)}`
                              ) : (
                                <span className="text-amber-600 text-xs">
                                  Sin costo
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-center font-bold text-gray-800">
                              {item.cantidad * item.costo > 0
                                ? `$${fmt(item.cantidad * item.costo)}`
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
                    {moqsFiltrados.length === 0
                      ? "0 MOQs"
                      : totalPages > 1
                        ? `${(currentPage - 1) * itemsPerPage + 1}–${Math.min(currentPage * itemsPerPage, moqsFiltrados.length)} de ${moqsFiltrados.length} MOQs`
                        : `${moqsFiltrados.length} MOQ${moqsFiltrados.length !== 1 ? "s" : ""}`}
                  </p>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.max(p - 1, 1))
                        }
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
