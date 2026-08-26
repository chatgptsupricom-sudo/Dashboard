import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

/**
 * Generación de los Excel del rol Seguridad (issues #34 y #38).
 *
 * Se hace en el servidor y no en el navegador para que el archivo salga de la
 * misma consulta que alimenta el listado: así lo exportado es exactamente lo
 * que la persona está viendo, filtros incluidos, sin traerse todas las filas
 * al cliente.
 */

export interface Columna {
  header: string;
  key: string;
  width?: number;
  /** Formatea el valor crudo de MySQL antes de escribirlo. */
  valor?: (fila: any) => any;
}

export async function construirExcel(
  hoja: string,
  columnas: Columna[],
  filas: any[],
): Promise<ExcelJS.Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Supricom";
  wb.created = new Date();

  const ws = wb.addWorksheet(hoja);
  ws.columns = columnas.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width ?? 20,
  }));

  for (const fila of filas) {
    const salida: Record<string, any> = {};
    for (const c of columnas) {
      salida[c.key] = c.valor ? c.valor(fila) : (fila[c.key] ?? "");
    }
    ws.addRow(salida);
  }

  // Encabezado distinguible, que es lo que pide el criterio del issue.
  const cabecera = ws.getRow(1);
  cabecera.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecera.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF741DFE" }, // el morado de Supricom
  };
  cabecera.alignment = { vertical: "middle" };
  cabecera.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  return wb.xlsx.writeBuffer();
}

/**
 * Los acentos: ExcelJS escribe xlsx, que es XML en UTF-8 dentro de un zip, así
 * que no hay nada que convertir — la Ã© clásica sale al generar CSV, no xlsx.
 * Lo que sí importa es declarar el Content-Type correcto: con uno genérico,
 * Excel abre el archivo como texto y ahí sí se rompe todo.
 */
export function respuestaExcel(buffer: ExcelJS.Buffer, nombre: string) {
  return new NextResponse(buffer as any, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Fecha de calendario para Excel, sin que la zona horaria la corra un día. */
export function fechaExcel(v: any): string {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : String(v);
}

export function siNo(v: any): string {
  if (v === null || v === undefined) return "";
  return v ? "Sí" : "No";
}
