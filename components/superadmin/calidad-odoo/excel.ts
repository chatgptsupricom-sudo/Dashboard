import { descargarExcel, type HojaExcel } from "@/lib/excel";
import type { Chequeo } from "@/lib/calidad-odoo/tipos";
import { SEV_UI, fechaCorta, nombreSede, urlOdoo, type ChequeoResumen } from "./formato";

/** Filas de un chequeo como las ve el auditor, con la sede y el enlace a Odoo. */
export function filasExcel(c: Pick<Chequeo, "columnas" | "filas">): Record<string, unknown>[] {
  return c.filas.map((f) => {
    const o: Record<string, unknown> = { Sede: nombreSede(f.companyId) };
    for (const col of c.columnas) {
      const v = f[col.clave];
      o[col.titulo] = col.tipo === "fecha" && typeof v === "string" ? fechaCorta(v) : v ?? "";
    }
    o["Enlace a Odoo"] = urlOdoo(f);
    return o;
  });
}

export function hojaResumen(chequeos: ChequeoResumen[]): HojaExcel {
  return {
    nombre: "Resumen",
    filas: chequeos.map((c) => ({
      Prioridad: SEV_UI[c.severidad].label,
      Revisión: c.titulo,
      Hallazgos: c.total,
      "Qué pasa": c.descripcion,
      "Por qué importa": c.porQue,
      "Cómo corregirlo en Odoo": c.pasos.map((p, i) => `${i + 1}. ${p}`).join("\n"),
    })),
  };
}

export function exportarTodo(nombre: string, resumen: ChequeoResumen[], completos: Chequeo[]) {
  const porId = new Map(completos.map((c) => [c.id, c]));
  const hojas: HojaExcel[] = [hojaResumen(resumen)];
  for (const r of resumen) {
    const c = porId.get(r.id);
    if (c && c.filas.length) hojas.push({ nombre: c.titulo, filas: filasExcel(c) });
  }
  descargarExcel(nombre, hojas);
}
