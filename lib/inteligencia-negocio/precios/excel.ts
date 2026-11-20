import ExcelJS from "exceljs";
import { leerMercado, nivelDeConfianza } from "@/lib/inteligencia-negocio/precios/datos";
import { ESTRUCTURAS_PRECIOS } from "@/lib/inteligencia-negocio/precios/estructuras";
import { consolidado } from "@/lib/inteligencia-negocio/precios/mercado";

/**
 * La lista ordenada con el formato del Excel de ejemplo ("Lista Ejemplo
 * Ordenada"): hoja Catalogo con sus 11 columnas, Resumen por categoría y
 * Estructuras. De una carga (la lista tal como quedó) o de todo lo cargado /
 * un corte (consolidado: de cada producto, el precio más bajo del mayorista).
 */

const COLUMNAS = [
  ["Código", 22],
  ["Marca", 18],
  ["Categoría", 24],
  ["Subcategoría (nombre corto)", 46],
  ["Grado de Confianza", 12],
  ["Nivel", 9],
  ["Observaciones / Verificar", 40],
  ["Mayorista", 16],
  ["Fecha", 12],
  ["PVP", 12],
  ["Descripción original", 80],
] as const;

export async function filasParaExcel(filtro: { cargaId?: number; fecha?: string }) {
  if (filtro.cargaId) return leerMercado({ cargaId: filtro.cargaId });
  const { filas } = await consolidado();
  return filtro.fecha ? filas.filter((f) => f.fecha === filtro.fecha) : filas;
}

const aFecha = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
};

export async function excelOrdenado(filtro: { cargaId?: number; fecha?: string }): Promise<Buffer> {
  const filas = (await filasParaExcel(filtro)).sort(
    (a, b) => b.pvp - a.pvp || a.mayorista.localeCompare(b.mayorista),
  );
  const wb = new ExcelJS.Workbook();
  // Mismo orden que el ejemplo abre: el catálogo primero.
  const cat = wb.addWorksheet("Catalogo");
  const res = wb.addWorksheet("Resumen");
  const est = wb.addWorksheet("Estructuras");
  est.columns = [
    { header: "Categoría", width: 26 },
    { header: "Estructura", width: 90 },
    { header: "Ejemplo", width: 50 },
    { header: "Productos", width: 11 },
  ];
  const porCat = new Map<string, number>();
  filas.forEach((f) => porCat.set(f.categoria, (porCat.get(f.categoria) || 0) + 1));
  for (const e of ESTRUCTURAS_PRECIOS) est.addRow([e.categoria, e.estructura, e.ejemplo, porCat.get(e.categoria) || 0]);
  est.addRow([]);
  est.addRow([
    "Grado de Confianza",
    "Alto 1.00 = todos los atributos de la fórmula están en la descripción del mayorista. Medio 0.70–0.90 = un atributo fue deducido por modelo/referencia o falta un atributo. Bajo < 0.70 = faltan dos o más atributos, o el tipo de producto fue inferido.",
  ]);
  est.addRow([
    "Precios",
    "En dólares y sin IVA. Si la lista traía IVA se le quitó el 16 %. Si un mayorista trae varias columnas o listas de precio, queda el más bajo. Sin precio, en cero, «Consultar» o agotados quedan fuera.",
  ]);

  res.columns = [
    { header: "Categoría", width: 26 },
    { header: "Productos", width: 11 },
    { header: "Alto", width: 8 },
    { header: "Medio", width: 8 },
    { header: "Bajo", width: 8 },
    { header: "% Alto", width: 9 },
    { header: "Confianza promedio", width: 12 },
  ];
  const resumen = new Map<string, { n: number; Alto: number; Medio: number; Bajo: number; suma: number }>();
  for (const f of filas) {
    const r = resumen.get(f.categoria) || { n: 0, Alto: 0, Medio: 0, Bajo: 0, suma: 0 };
    r.n++;
    (r as any)[nivelDeConfianza(f.confianza)]++;
    r.suma += f.confianza;
    resumen.set(f.categoria, r);
  }
  const tot = { n: 0, Alto: 0, Medio: 0, Bajo: 0, suma: 0 };
  for (const [cat, r] of [...resumen].sort((a, b) => b[1].n - a[1].n)) {
    res.addRow([cat, r.n, r.Alto, r.Medio, r.Bajo, r.Alto / r.n, r.suma / r.n]);
    tot.n += r.n;
    tot.Alto += r.Alto;
    tot.Medio += r.Medio;
    tot.Bajo += r.Bajo;
    tot.suma += r.suma;
  }
  res.addRow(["TOTAL", tot.n, tot.Alto, tot.Medio, tot.Bajo, tot.n ? tot.Alto / tot.n : 0, tot.n ? tot.suma / tot.n : 0]).font = { bold: true };
  res.getColumn(6).numFmt = "0%";
  res.getColumn(7).numFmt = "0.00";

  cat.columns = COLUMNAS.map(([header, width]) => ({ header, width }));
  for (const f of filas) {
    cat.addRow([
      f.codigo,
      f.marca,
      f.categoria,
      f.subcategoria,
      f.confianza,
      nivelDeConfianza(f.confianza),
      f.observaciones,
      f.mayorista,
      aFecha(f.fecha),
      f.pvp,
      f.descripcion,
    ]);
  }
  cat.getColumn(5).numFmt = "0.00";
  cat.getColumn(9).numFmt = "dd/mm/yyyy";
  cat.getColumn(10).numFmt = "#,##0.00";
  cat.views = [{ state: "frozen", ySplit: 1 }];
  cat.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };
  for (const hoja of [est, res, cat]) {
    hoja.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    hoja.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B2545" } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Lo mismo en CSV separado por punto y coma, listo para Excel en español. */
export async function csvOrdenado(filtro: { cargaId?: number; fecha?: string }): Promise<string> {
  const filas = await filasParaExcel(filtro);
  const q = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const n = (v: number) => String(v).replace(".", ",");
  const fecha = (iso: string) => iso.split("-").reverse().join("/");
  return (
    "﻿" +
    [COLUMNAS.map((c) => c[0]).join(";")]
      .concat(
        filas.map((f) =>
          [f.codigo, f.marca, f.categoria, f.subcategoria, n(f.confianza), nivelDeConfianza(f.confianza), f.observaciones, f.mayorista, fecha(f.fecha), n(f.pvp), f.descripcion]
            .map(q)
            .join(";"),
        ),
      )
      .join("\n")
  );
}
