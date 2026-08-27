import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import {
  canEditPresupuesto,
  canViewAdministracion,
  getAdminUser,
} from "@/lib/administracion/auth";
import { dedupPorCodigo, fetchCuentasGasto } from "@/lib/administracion/gastos";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS presupuesto_gastos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      mes VARCHAR(7) NOT NULL,
      cuenta_codigo VARCHAR(50) NOT NULL,
      monto DECIMAL(15,2) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_presupuesto (company_id, mes, cuenta_codigo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canViewAdministracion(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    await ensureTable();

    const url = new URL(request.url);
    const mes = url.searchParams.get("mes") || "";
    const companyId = parseInt(url.searchParams.get("company_id") || "0", 10);
    if (!mes || !companyId) {
      return NextResponse.json(
        { error: "Faltan parametros mes y company_id" },
        { status: 400 },
      );
    }

    const cuentas = dedupPorCodigo(await fetchCuentasGasto([companyId]));
    const rows = await query(
      "SELECT cuenta_codigo, monto FROM presupuesto_gastos WHERE company_id = ? AND mes = ?",
      [companyId, mes],
    );
    const montoPorCuenta: Record<string, number> = {};
    (rows.rows as any[]).forEach((r) => {
      montoPorCuenta[r.cuenta_codigo] = Number(r.monto) || 0;
    });

    // Se devuelven TODAS las cuentas de gasto, con presupuesto 0 si no se ha
    // cargado, para que la plantilla de carga salga completa y ordenada.
    const data = cuentas.map((c) => ({
      cuentaCodigo: c.codigo,
      cuentaNombre: c.nombre,
      grupo: c.grupo,
      monto: montoPorCuenta[c.codigo] ?? 0,
    }));

    const totalPresupuestado = data.reduce((s, d) => s + d.monto, 0);
    return NextResponse.json({
      success: true,
      data,
      totalPresupuestado,
      cuentasConPresupuesto: data.filter((d) => d.monto > 0).length,
    });
  } catch (error: any) {
    console.error("Error obteniendo presupuesto:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAdminUser(request);
    if (!canEditPresupuesto(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    await ensureTable();

    const body = await request.json();
    const { mes, company_id: companyId, items } = body;
    if (!mes || !companyId || !Array.isArray(items)) {
      return NextResponse.json(
        { error: "Faltan campos: mes, company_id, items" },
        { status: 400 },
      );
    }

    const validos = items
      .map((i: any) => ({
        cuenta: String(i.cuentaCodigo ?? i.cuenta_codigo ?? "").trim(),
        monto: Number(i.monto),
      }))
      .filter((i) => i.cuenta !== "" && Number.isFinite(i.monto) && i.monto >= 0);

    if (validos.length === 0) {
      return NextResponse.json(
        { error: "No se recibieron filas validas" },
        { status: 400 },
      );
    }

    for (const item of validos) {
      await query(
        `INSERT INTO presupuesto_gastos (company_id, mes, cuenta_codigo, monto)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE monto = VALUES(monto)`,
        [companyId, mes, item.cuenta, item.monto],
      );
    }

    return NextResponse.json({
      success: true,
      actualizados: validos.length,
    });
  } catch (error: any) {
    console.error("Error guardando presupuesto:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
