/**
 * Construcción del .xlsx del Reporte de Ventas Trimestral, replicando el
 * formato del archivo de referencia ("Reporte de ventas Qn"):
 *
 *   Hoja 1  "VENTA TRIMESTRAL Qn"  — 4 tablas una al lado de la otra
 *   Hoja 2  "EPP"                  — metas por cuenta con escala de color
 *   Hoja 3  "Ventas - Devoluciones" — detalle línea a línea
 *
 * ExcelJS no genera gráficos nativos; los datos quedan en las hojas.
 *
 * Se usa desde la ruta de descarga manual y desde el cron trimestral.
 */

import type {
  CuentaEppCalculada,
  FilaDetalle,
  ReporteTrimestral,
} from "@/lib/reportes-comerciales/reporteTrimestral";

const AZUL = "FF1E40AF";
const VERDE = "FFC6EFCE";
const ROJO = "FFFFC7CE";
const AMBAR_HDR = "FFFFD966";

export interface EntradaExcel {
  reporte: ReporteTrimestral;
  detalle: FilaDetalle[];
  epp: CuentaEppCalculada[];
}

export function nombreArchivoTrimestral(reporte: ReporteTrimestral): string {
  const hoy = new Date().toISOString().slice(0, 10);
  return `reporte_ventas_panama_${reporte.periodo.marca}_${reporte.periodo.trimestre}_${hoy}.xlsx`;
}

export async function generarExcelTrimestral({
  reporte,
  detalle,
  epp,
}: EntradaExcel): Promise<Buffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const HEADER = {
    font: { bold: true, color: { argb: "FFFFFFFF" } },
    fill: { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: AZUL } },
  };
  const q = reporte.periodo.trimestre.split("-Q")[1] || "";
  const anio = reporte.periodo.trimestre.slice(0, 4);
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

  // ── Hoja 1: "VENTA TRIMESTRAL Qn" — 4 tablas una al lado de la otra ──
  const wsPiv = wb.addWorksheet(`VENTA TRIMESTRAL Q${q}`.trim());
  wsPiv.columns = [
    { width: 46 }, { width: 15 }, { width: 3 },
    { width: 60 }, { width: 16 }, { width: 3 },
    { width: 20 }, { width: 15 },
  ];
  const bloque = (fila: number, col: number, headers: string[], filas: any[][]) => {
    headers.forEach((h, i) => Object.assign(wsPiv.getCell(fila, col + i), { value: h }, HEADER));
    filas.forEach((f, r) =>
      f.forEach((v, i) => (wsPiv.getCell(fila + 1 + r, col + i).value = v)),
    );
    return fila + 1 + filas.length;
  };
  const totVta = (fs: { venta: number }[]) => round2(fs.reduce((s, f) => s + f.venta, 0));

  bloque(1, 1, ["Cliente", "Suma de Venta"], reporte.rankingClientes.map((f) => [f.nombre, f.venta]));
  bloque(1, 4, ["Producto", "Suma de Unidades"], reporte.rankingProductos.map((f) => [f.nombre, f.unidades]));
  const finDepto = bloque(1, 7, ["Departamento", "Suma de Venta"], [
    ...reporte.porDepartamento.map((f) => [f.nombre, f.venta]),
    ["Total general", totVta(reporte.porDepartamento)],
  ]);
  const finVend = bloque(finDepto + 2, 7, ["Vendedor", "Suma de Venta"], [
    ...reporte.porVendedor.map((f) => [f.nombre, f.venta]),
    ["Total general", totVta(reporte.porVendedor)],
  ]);
  if (reporte.porMarca.length > 0) {
    bloque(finVend + 2, 7, ["Marca", "Suma de Venta"], reporte.porMarca.map((f) => [f.nombre, f.venta]));
  }
  wsPiv.getColumn(2).numFmt = "#,##0.00";
  wsPiv.getColumn(8).numFmt = "#,##0.00";
  wsPiv.views = [{ state: "frozen", ySplit: 1 }];

  // ── Hoja 2: EPP ──
  const wsEpp = wb.addWorksheet("EPP");
  wsEpp.columns = [
    { header: "N°", width: 6 },
    { header: "Cliente", width: 48 },
    { header: `Meta Anual ${anio}`, width: 18 },
    { header: `Trimestre ${q}`, width: 16 },
    { header: `Cumplimiento de Q${q}`, width: 18 },
  ];
  epp.forEach((c, i) =>
    wsEpp.addRow([i + 1, c.clienteNombre, c.metaAnual, c.metaTrimestre, c.realTrimestre]),
  );
  const nEpp = epp.length;
  const totMetaAnual = epp.reduce((s, c) => s + c.metaAnual, 0);
  const totMetaTrim = epp.reduce((s, c) => s + c.metaTrimestre, 0);
  const totReal = epp.reduce((s, c) => s + c.realTrimestre, 0);
  wsEpp.addRow([
    "",
    "Cumplimiento global",
    totMetaTrim ? totReal / totMetaTrim : 0,
    totMetaAnual ? totReal / totMetaAnual : 0,
    totReal,
  ]);
  const filaResumen = nEpp + 2;

  wsEpp.getRow(1).eachCell((cell: any) => {
    cell.font = { bold: true, color: { argb: "FF1F2937" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMBAR_HDR } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  for (let r = 2; r <= nEpp + 1; r++) {
    wsEpp.getCell(r, 3).numFmt = '"$" #,##0.00';
    wsEpp.getCell(r, 3).font = { color: { argb: "FFC00000" } };
    wsEpp.getCell(r, 4).numFmt = '"$" #,##0.00';
    wsEpp.getCell(r, 5).numFmt = '"$" #,##0.00';
  }
  wsEpp.getCell(filaResumen, 3).numFmt = "0.00%";
  wsEpp.getCell(filaResumen, 4).numFmt = "0.00%";
  wsEpp.getCell(filaResumen, 5).numFmt = '"$" #,##0.00';
  wsEpp.getRow(filaResumen).font = { bold: true };

  if (nEpp > 0) {
    wsEpp.addConditionalFormatting({
      ref: `E2:E${nEpp + 1}`,
      rules: [
        {
          type: "colorScale",
          cfvo: [{ type: "min" }, { type: "percentile", value: 50 }, { type: "max" }],
          color: [{ argb: "FFF8696B" }, { argb: "FFFFEB84" }, { argb: "FF63BE7B" }],
        } as any,
      ],
    });
    wsEpp.addConditionalFormatting({
      ref: `D2:D${nEpp + 1}`,
      rules: [
        { type: "expression", formulae: ["$E2>=$D2"], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: VERDE } } } } as any,
        { type: "expression", formulae: ["$E2<$D2*0.3"], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: ROJO } } } } as any,
      ],
    });
  }
  wsEpp.views = [{ state: "frozen", ySplit: 1 }];

  // ── Hoja 3: "Ventas - Devoluciones" ──
  const wsDet = wb.addWorksheet("Ventas - Devoluciones");
  wsDet.columns = [
    { key: "fecha", header: "Fecha", width: 12 },
    { key: "numero", header: "Numero", width: 18 },
    { key: "cliente", header: "Cliente", width: 42 },
    { key: "linea", header: "Linea", width: 14 },
    { key: "articulo", header: "Articulo", width: 60 },
    { key: "vendedor", header: "Vendedor", width: 22 },
    { key: "departamento", header: "Departamento", width: 16 },
    { key: "unidades", header: "Unidades", width: 10 },
    { key: "venta", header: "Venta", width: 12 },
  ];
  detalle.forEach((d) => wsDet.addRow(d));
  wsDet.getColumn("venta").numFmt = "#,##0.00";
  wsDet.getRow(1).eachCell((cell: any) => {
    Object.assign(cell, HEADER);
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  wsDet.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
