import { query } from "@/lib/db";
import { empresaDeCompanyId } from "@/lib/administracion/empresas";
import type { PagoFijo } from "@/lib/administracion/pagosFijosCruce";

/**
 * Pagos fijos del calendario de Cuentas por Pagar (tabla `cxp_pagos_fijos`, se
 * crea sola). Lo que se cruza con Odoo esta en pagosFijosCruce.ts.
 *
 * Borrar un pago fijo que ya salio en meses anteriores no lo borra: le pone
 * `hasta_mes` = el mes anterior, asi el calendario de esos meses no cambia.
 */

let tablaLista: Promise<unknown> | null = null;
function asegurarTabla() {
  if (!tablaLista) {
    tablaLista = query(`
      CREATE TABLE IF NOT EXISTS cxp_pagos_fijos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        company_id INT NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        partner_id INT NOT NULL,
        proveedor VARCHAR(255) NOT NULL,
        monto DECIMAL(15,2) NOT NULL,
        dia TINYINT NOT NULL,
        notas VARCHAR(500) NULL,
        desde_mes CHAR(7) NOT NULL,
        hasta_mes CHAR(7) NULL,
        creado_por VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_company (company_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `).catch((e) => {
      tablaLista = null;
      throw e;
    });
  }
  return tablaLista;
}

const deFila = (r: any): PagoFijo & { companyId: number } => ({
  id: Number(r.id),
  companyId: Number(r.company_id),
  sede: empresaDeCompanyId(Number(r.company_id)),
  nombre: r.nombre || "",
  proveedorId: Number(r.partner_id),
  proveedor: r.proveedor || "",
  monto: Number(r.monto) || 0,
  dia: Number(r.dia),
  notas: r.notas || "",
  desdeMes: r.desde_mes,
  hastaMes: r.hasta_mes || null,
});

export async function listarPagosFijos(companyIds: number[]): Promise<PagoFijo[]> {
  if (!companyIds.length) return [];
  await asegurarTabla();
  const { rows } = await query(
    `SELECT * FROM cxp_pagos_fijos WHERE company_id IN (${companyIds.map(() => "?").join(",")}) ORDER BY dia, id`,
    companyIds,
  );
  return (rows as any[]).map(deFila);
}

export async function leerPagoFijo(id: number) {
  await asegurarTabla();
  const { rows } = await query("SELECT * FROM cxp_pagos_fijos WHERE id = ?", [id]);
  const fila = (rows as any[])[0];
  return fila ? deFila(fila) : null;
}

export interface DatosPagoFijo {
  companyId: number;
  nombre: string;
  proveedorId: number;
  proveedor: string;
  monto: number;
  dia: number;
  notas: string;
}

/** Valida lo que llega del formulario. String = mensaje de error. */
export function validarPagoFijo(b: any): Omit<DatosPagoFijo, "companyId"> | string {
  const nombre = String(b?.nombre || "").trim().slice(0, 150);
  const proveedor = String(b?.proveedor || "").trim().slice(0, 255);
  const proveedorId = Number(b?.proveedorId);
  const monto = Math.round(Number(b?.monto) * 100) / 100;
  const dia = Number(b?.dia);
  if (!nombre) return "Falta el nombre del pago";
  if (!Number.isInteger(proveedorId) || proveedorId <= 0 || !proveedor) return "Elige el proveedor de Odoo";
  if (!Number.isFinite(monto) || monto <= 0) return "El monto tiene que ser mayor que cero";
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) return "El día tiene que ser entre 1 y 31";
  return { nombre, proveedorId, proveedor, monto, dia, notas: String(b?.notas || "").trim().slice(0, 500) };
}

export async function crearPagoFijo(d: DatosPagoFijo, desdeMes: string, creadoPor: string) {
  await asegurarTabla();
  await query(
    `INSERT INTO cxp_pagos_fijos (company_id, nombre, partner_id, proveedor, monto, dia, notas, desde_mes, creado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.companyId, d.nombre, d.proveedorId, d.proveedor, d.monto, d.dia, d.notas || null, desdeMes, creadoPor],
  );
}

export async function actualizarPagoFijo(id: number, d: Omit<DatosPagoFijo, "companyId">) {
  await asegurarTabla();
  await query(
    `UPDATE cxp_pagos_fijos SET nombre = ?, partner_id = ?, proveedor = ?, monto = ?, dia = ?, notas = ? WHERE id = ?`,
    [d.nombre, d.proveedorId, d.proveedor, d.monto, d.dia, d.notas || null, id],
  );
}

/** Lo quita desde `mesActual`: si salia antes, queda en esos meses. */
export async function quitarPagoFijo(id: number, desdeMes: string, mesActual: string) {
  await asegurarTabla();
  if (desdeMes >= mesActual) {
    await query("DELETE FROM cxp_pagos_fijos WHERE id = ?", [id]);
    return;
  }
  const [a, m] = mesActual.split("-").map(Number);
  const anterior = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7);
  await query("UPDATE cxp_pagos_fijos SET hasta_mes = ? WHERE id = ?", [anterior, id]);
}
