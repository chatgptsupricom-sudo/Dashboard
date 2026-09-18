"use client";

import { useRef, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ParsedRow {
  sku?: string;
  name?: string;
  category?: string;
  uom?: string;
  stockOffice?: number;
  stockWarehouse?: number;
  brand?: string;
  description?: string;
}

const HEADERS = [
  "SKU",
  "Nombre",
  "Categoría",
  "Unidad de medida",
  "Stock oficina",
  "Stock almacén",
  "Marca",
  "Descripción",
];

async function parseWorkbook(buf: ArrayBuffer): Promise<ParsedRow[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: ParsedRow[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    const get = (i: number) => (row.getCell(i).value ?? "") as string;
    rows.push({
      sku: String(get(1) || "").trim(),
      name: String(get(2) || "").trim(),
      category: String(get(3) || "").trim(),
      uom: String(get(4) || "").trim(),
      stockOffice: Number(get(5)) || 0,
      stockWarehouse: Number(get(6)) || 0,
      brand: String(get(7) || "").trim(),
      description: String(get(8) || "").trim(),
    });
  });

  return rows.filter((r) => r.name || r.sku);
}

export function ExcelImportDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => Promise<void> | void;
}) {
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);

  async function downloadTemplate() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Material POP");
    ws.addRow(HEADERS);
    ws.addRow([
      "POP-AGND",
      "Agenda corporativa",
      "Merchandising",
      "Unidad",
      10,
      25,
      "Genérica",
      "Ejemplo — puedes borrar esta fila",
    ]);
    ws.getRow(1).font = { bold: true };
    ws.getColumn(1).width = 14;
    ws.getColumn(2).width = 30;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 16;
    ws.getColumn(5).width = 14;
    ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 20;
    ws.getColumn(8).width = 40;

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_material_pop.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(file: File) {
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = await parseWorkbook(buf);
      if (parsed.length === 0) {
        setError("El archivo no tiene filas válidas. Usa la plantilla.");
        setRows(null);
        return;
      }
      setRows(parsed);
      setFileName(file.name);
    } catch (e: any) {
      setError("No se pudo leer el archivo. Debe ser un .xlsx válido.");
      setRows(null);
    } finally {
      setParsing(false);
    }
  }

  async function handleImport() {
    if (!rows) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/adminleads/material-pop/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "No se pudo importar");
      setResult(json);
      setRows(null);
      await onImported();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  }

  function close() {
    onOpenChange(false);
    setRows(null);
    setResult(null);
    setError(null);
    setFileName("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar desde Excel</DialogTitle>
          <DialogDescription>
             Carga un .xlsx con los productos. Si el SKU ya existe se actualiza;
             si no, se crea. El stock indicado reemplaza el stock inicial y queda
             registrado como ajuste auditable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Descargar plantilla
          </Button>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
              e.target.value = "";
            }}
          />

          {/* Drop area */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 px-6 py-10 text-center transition-colors hover:border-violet-300 hover:bg-violet-50/40"
          >
            {parsing ? (
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
            ) : (
              <UploadCloud className="h-8 w-8 text-slate-400" />
            )}
            <p className="text-sm font-medium text-slate-600">
              {parsing ? "Leyendo archivo..." : "Clic para elegir un .xlsx"}
            </p>
            <p className="text-xs text-slate-400">
              Columnas: SKU, Nombre, Categoría, Unidad, Stock oficina, Stock almacén, Marca, Descripción
            </p>
          </button>

          {fileName && (
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-slate-700">
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                {fileName}
              </span>
              <button
                type="button"
                onClick={() => {
                  setRows(null);
                  setFileName("");
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {rows && (
            <div className="max-h-52 overflow-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Nombre</th>
                    <th className="px-3 py-2 font-medium">Of.</th>
                    <th className="px-3 py-2 font-medium">Alm.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.slice(0, 50).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 font-mono text-slate-600">
                        {r.sku || "auto"}
                      </td>
                      <td className="px-3 py-1.5 text-slate-700">
                        {r.name || <span className="text-red-500">sin nombre</span>}
                      </td>
                      <td className="px-3 py-1.5">{r.stockOffice}</td>
                      <td className="px-3 py-1.5">{r.stockWarehouse}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 50 && (
                <p className="px-3 py-2 text-center text-xs text-slate-400">
                  +{rows.length - 50} filas más
                </p>
              )}
            </div>
          )}

          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="font-semibold">¡Importación completada!</p>
              <p className="mt-1">
                {result.resumen.creados} creados · {result.resumen.actualizados} actualizados
                {result.resumen.errores > 0 && ` · ${result.resumen.errores} con error`}
              </p>
              {result.detalle.errores.length > 0 && (
                <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-red-700">
                  {result.detalle.errores.slice(0, 10).map((e: any, i: number) => (
                    <li key={i}>Fila {e.fila}: {e.error}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cerrar
          </Button>
          {rows && !result && (
            <Button type="button" onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Importar {rows.length} filas
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
