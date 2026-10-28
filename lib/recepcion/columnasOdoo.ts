import { query } from "@/lib/db";

/**
 * Columnas de la carga en Odoo de la recepcion (lib/recepcion/odoo.ts). Se
 * agregan solas la primera vez (SHOW COLUMNS + ALTER, como en mantenimiento):
 * no hace falta correr nada en el phpMyAdmin. DDL de referencia en
 * sql/recepcion_odoo.sql.
 *
 *   recepcion_packing.origen                 packing_list | factura
 *   recepcion_packing.factura_odoo_id        factura de la otra sede (origen factura)
 *   recepcion_packing.odoo_purchase_order_id OC de Odoo donde se carga lo contado
 *   recepcion_packing.odoo_estado            cargando | cargado | acumulado | error | sin_oc
 *   recepcion_packing.odoo_recepciones_previas  IN de la OC hechas antes de empezar
 *   recepcion_packing_items.odoo_product_id  producto de Odoo del renglon
 *   recepcion_packing_items.factura_aparte   otra factura del embarque (ej.
 *     INV1062, de Caracas): el renglon se cuenta pero no se carga en esta sede
 */

const COLUMNAS_RECEPCION: Array<[string, string]> = [
  ["origen", "VARCHAR(20) NOT NULL DEFAULT 'packing_list'"],
  ["factura_odoo_id", "INT DEFAULT NULL"],
  ["odoo_purchase_order_id", "INT DEFAULT NULL"],
  ["odoo_oc_nombre", "VARCHAR(50) DEFAULT NULL"],
  ["odoo_estado", "VARCHAR(20) DEFAULT NULL"],
  ["odoo_error", "TEXT DEFAULT NULL"],
  ["odoo_resultado", "TEXT DEFAULT NULL"],
  ["odoo_intento_at", "TIMESTAMP NULL DEFAULT NULL"],
  ["odoo_cargado_at", "TIMESTAMP NULL DEFAULT NULL"],
  // Recepciones (IN) que la OC ya tenia hechas cuando empezo esta recepcion:
  // lo que aparezca despues y no lo haya hecho el panel puede ser esta misma
  // mercancia recibida a mano, y no se carga dos veces.
  ["odoo_recepciones_previas", "TEXT DEFAULT NULL"],
];

let columnasListas: Promise<void> | null = null;

export function asegurarColumnasOdoo(): Promise<void> {
  if (!columnasListas) {
    columnasListas = (async () => {
      const agregar = async (tabla: string, columnas: Array<[string, string]>) => {
        const r = await query(`SHOW COLUMNS FROM ${tabla}`);
        const hay = new Set((r.rows as any[]).map((c) => String(c.Field)));
        for (const [nombre, def] of columnas) {
          if (!hay.has(nombre)) await query(`ALTER TABLE ${tabla} ADD COLUMN ${nombre} ${def}`);
        }
      };
      await agregar("recepcion_packing", COLUMNAS_RECEPCION);
      await agregar("recepcion_packing_items", [
        ["odoo_product_id", "INT DEFAULT NULL"],
        ["factura_aparte", "VARCHAR(50) DEFAULT NULL"],
      ]);
    })().catch((e) => {
      columnasListas = null;
      throw e;
    });
  }
  return columnasListas;
}
