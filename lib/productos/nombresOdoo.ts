import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";

/**
 * Tablas del panel que guardan una copia del nombre del producto de Odoo al
 * momento de cargar algo (flyer, caso de RMA, producto del envío de RMA).
 * Mientras el panel leyó Odoo en en_US, esa copia quedó con el nombre viejo
 * (PBB201 "ALTAVOZ…" en vez de "POWER BANK…", ver ODOO_LANG en lib/odoo.ts).
 *
 * No se tocan a propósito las copias que son un documento firmado o emitido:
 * seguridad_ingreso_items / seguridad_despacho_items (actas) y
 * purchase_order_lines (órdenes de compra).
 */
const TABLAS = [
  { tabla: "product_images", etiqueta: "Banco de Flyers" },
  { tabla: "rma_cases", etiqueta: "RMA (casos)" },
  { tabla: "rma_case_items", etiqueta: "RMA (productos del envío)" },
] as const;

export interface ResultadoNombres {
  aplicado: boolean;
  productosConNombreViejo: number;
  tablas: { tabla: string; etiqueta: string; filas: number; ejemplos: { codigo: string; antes: string; despues: string }[] }[];
}

const normal = (s: string) => s.replace(/\s+/g, " ").trim().toUpperCase();

async function codigosGuardados(tabla: string): Promise<string[]> {
  try {
    const { rows } = await query(
      `SELECT DISTINCT product_code FROM ${tabla} WHERE product_code IS NOT NULL AND product_code <> ''`,
    );
    return rows.map((r: any) => String(r.product_code));
  } catch (e: any) {
    if (e?.code === "ER_NO_SUCH_TABLE") return [];
    throw e;
  }
}

async function leerNombres(codigos: string[], lang: string): Promise<Map<number, { codigo: string; nombre: string }>> {
  const porId = new Map<number, { codigo: string; nombre: string }>();
  for (let i = 0; i < codigos.length; i += 500) {
    const productos =
      (await callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["default_code", "in", codigos.slice(i, i + 500)]]],
        { fields: ["id", "default_code", "name"], context: { lang, active_test: false } },
      )) || [];
    for (const p of productos) porId.set(p.id, { codigo: p.default_code, nombre: p.name || "" });
  }
  return porId;
}

/**
 * Cambia el nombre guardado por el de Odoo en español solo donde la copia es
 * igual al nombre en inglés (el que leía el panel antes). Si alguien escribió
 * otra cosa a mano en el caso, no se pisa. Con `aplicar = false` solo cuenta.
 */
export async function corregirNombresGuardados(aplicar: boolean): Promise<ResultadoNombres> {
  const porTabla = await Promise.all(TABLAS.map((t) => codigosGuardados(t.tabla)));
  const codigos = [...new Set(porTabla.flat())];

  const [enIngles, enEspanol] = await Promise.all([leerNombres(codigos, "en_US"), leerNombres(codigos, "es_VE")]);
  const cambios: { codigo: string; antes: string; despues: string }[] = [];
  for (const [id, en] of enIngles) {
    const es = enEspanol.get(id);
    if (es && es.nombre.trim() && normal(es.nombre) !== normal(en.nombre)) {
      cambios.push({ codigo: en.codigo, antes: en.nombre, despues: es.nombre.trim() });
    }
  }

  const tablas: ResultadoNombres["tablas"] = [];
  for (const [i, t] of TABLAS.entries()) {
    const enTabla = new Set(porTabla[i]);
    let filas = 0;
    const ejemplos: { codigo: string; antes: string; despues: string }[] = [];
    for (const c of cambios) {
      if (!enTabla.has(c.codigo)) continue;
      // Se guardó tal cual venía de Odoo (dobles espacios, tabs incluidos); la
      // collation _ci ya ignora mayúsculas y espacios al final.
      const donde = `WHERE product_code = ? AND (model = ? OR TRIM(model) = TRIM(?))`;
      const params = [c.codigo, c.antes, c.antes];
      let n = 0;
      if (aplicar) {
        const { rows } = await query(`UPDATE ${t.tabla} SET model = ? ${donde}`, [c.despues, ...params]);
        n = Number((rows as any)?.affectedRows) || 0;
      } else {
        const { rows } = await query(`SELECT COUNT(*) AS n FROM ${t.tabla} ${donde}`, params);
        n = Number(rows[0]?.n) || 0;
      }
      filas += n;
      if (n && ejemplos.length < 20) ejemplos.push(c);
    }
    tablas.push({ tabla: t.tabla, etiqueta: t.etiqueta, filas, ejemplos });
  }

  return { aplicado: aplicar, productosConNombreViejo: cambios.length, tablas };
}
