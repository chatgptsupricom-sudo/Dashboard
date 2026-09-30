// Import por defecto: el paquete es CommonJS (dist/xlsx.min.js) y con
// `import * as` los nombres quedan undefined fuera del bundler.
import XLSX from "xlsx-js-style";
import type { WorkSheet } from "xlsx-js-style";

/**
 * Formato común de los Excel que exporta el panel (Cuentas por Cobrar):
 *   - fila de encabezados en azul, texto blanco en negrita;
 *   - columnas de montos resaltadas en azul claro, en negrita y con formato
 *     #,##0.00;
 *   - ancho de cada columna según su contenido.
 *
 * Usa `xlsx-js-style` (la misma API de SheetJS, pero escribe estilos; el
 * paquete `xlsx` normal los ignora).
 */

const AZUL = "2563EB";
const AZUL_CLARO = "DBEAFE";

/** Encabezado de una columna de dinero (y no de tasa, días, % o fechas). */
const ES_MONTO = /monto|saldo|cobrado|sin aplicar|importe|abono|cargo|valor|usd|\(\$\)|igtf|conciliado|divisa/i;
const NO_MONTO = /tasa|d[ií]as|%|fecha|plazo|facturas|cantidad/i;

export type HojaExcel = { nombre: string; filas: Record<string, unknown>[] };

/** Aplica el formato común a una hoja ya creada (encabezado en la primera fila). */
export function estilizarHoja(ws: WorkSheet) {
  const ref = ws["!ref"];
  if (!ref) return;
  const rango = XLSX.utils.decode_range(ref);
  const anchos: { wch: number }[] = [];

  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const cab = ws[XLSX.utils.encode_cell({ r: rango.s.r, c })] as any;
    const titulo = String(cab?.v ?? "");
    let ancho = titulo.length;
    let numericos = 0;
    for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
      const celda = ws[XLSX.utils.encode_cell({ r, c })] as any;
      if (!celda) continue;
      if (typeof celda.v === "number") numericos++;
      ancho = Math.max(ancho, String(celda.v ?? "").length);
    }
    const esMonto = ES_MONTO.test(titulo) && !NO_MONTO.test(titulo) && numericos > 0;

    if (cab) {
      cab.s = {
        fill: { patternType: "solid", fgColor: { rgb: AZUL } },
        font: { bold: true, color: { rgb: "FFFFFF" } },
        alignment: { vertical: "center", wrapText: true },
      };
    }
    if (esMonto) {
      for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
        const dir = XLSX.utils.encode_cell({ r, c });
        const celda = (ws[dir] as any) || (ws[dir] = { t: "s", v: "" });
        celda.s = {
          fill: { patternType: "solid", fgColor: { rgb: AZUL_CLARO } },
          font: { bold: true },
          numFmt: "#,##0.00",
        };
        if (typeof celda.v === "number") celda.z = "#,##0.00";
      }
    }
    anchos.push({ wch: Math.min(Math.max(ancho + 2, 10), 60) });
  }
  // Si la pantalla ya fijó anchos a mano, se respetan.
  if (!ws["!cols"]) ws["!cols"] = anchos;
}

/** Hoja con formato a partir de filas (objetos: cada clave es una columna). */
export function hojaConEstilo(filas: Record<string, unknown>[]): WorkSheet {
  const ws = XLSX.utils.json_to_sheet(filas.length ? filas : [{ "": "Sin registros" }]);
  estilizarHoja(ws);
  return ws;
}

/** Descarga un .xlsx con una o varias hojas, todas con el formato común. */
export function descargarExcel(nombre: string, hojas: HojaExcel[]) {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const h of hojas) {
    // Excel no acepta : \ / ? * [ ] ni más de 31 caracteres, ni hojas repetidas.
    let n = h.nombre.replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Hoja";
    for (let i = 2; usados.has(n); i++) n = `${n.slice(0, 28)} ${i}`;
    usados.add(n);
    XLSX.utils.book_append_sheet(wb, hojaConEstilo(h.filas), n);
  }
  XLSX.writeFile(wb, `${nombre}.xlsx`);
}

export { XLSX };
