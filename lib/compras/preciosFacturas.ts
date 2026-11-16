import { query } from "@/lib/db";

/**
 * Excels de Actualización de precios guardados por factura (ej. INV00965), en
 * `compras_precios_facturas` (se crea sola). Volver a cargar la misma factura
 * reemplaza sus renglones. Los precios de Odoo no se guardan: se leen al abrirla.
 */

export interface FilaFactura {
  codigo: string;
  descripcion: string;
  precio: number | null;
}

export interface ResumenFactura {
  factura: string;
  archivo: string;
  productos: number;
  cargadoPor: string;
  actualizado: string;
}

let tablaLista: Promise<unknown> | null = null;
function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = query(`
      CREATE TABLE IF NOT EXISTS compras_precios_facturas (
        factura VARCHAR(60) NOT NULL PRIMARY KEY,
        archivo VARCHAR(255) NOT NULL,
        filas JSON NOT NULL,
        productos INT NOT NULL,
        cargado_por VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

export async function listarFacturas(): Promise<ResumenFactura[]> {
  await asegurarTabla();
  const { rows } = await query(
    "SELECT factura, archivo, productos, cargado_por, updated_at FROM compras_precios_facturas ORDER BY updated_at DESC",
  );
  return (rows as any[]).map((r) => ({
    factura: r.factura,
    archivo: r.archivo,
    productos: Number(r.productos) || 0,
    cargadoPor: r.cargado_por || "",
    actualizado: new Date(r.updated_at).toISOString(),
  }));
}

export async function leerFactura(factura: string): Promise<(ResumenFactura & { filas: FilaFactura[] }) | null> {
  await asegurarTabla();
  const { rows } = await query("SELECT * FROM compras_precios_facturas WHERE factura = ?", [factura]);
  const r = (rows as any[])[0];
  if (!r) return null;
  return {
    factura: r.factura,
    archivo: r.archivo,
    productos: Number(r.productos) || 0,
    cargadoPor: r.cargado_por || "",
    actualizado: new Date(r.updated_at).toISOString(),
    filas: typeof r.filas === "string" ? JSON.parse(r.filas) : r.filas,
  };
}

/** Guarda (o reemplaza) los renglones de la factura. Devuelve si ya existía. */
export async function guardarFactura(factura: string, archivo: string, filas: FilaFactura[], cargadoPor: string) {
  await asegurarTabla();
  const { rows } = await query("SELECT 1 FROM compras_precios_facturas WHERE factura = ?", [factura]);
  await query(
    `INSERT INTO compras_precios_facturas (factura, archivo, filas, productos, cargado_por) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE archivo = VALUES(archivo), filas = VALUES(filas), productos = VALUES(productos), cargado_por = VALUES(cargado_por)`,
    [factura, archivo, JSON.stringify(filas), filas.length, cargadoPor],
  );
  return { reemplazada: (rows as any[]).length > 0 };
}
