import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { query } from "@/lib/db";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import { COMPANY_ID_PANAMA } from "@/lib/reportes-comerciales/reporteTrimestral";
import { ensureTablasReportesComerciales } from "@/lib/reportes-comerciales/tablas";

export const runtime = "nodejs";

const JWT_SECRET = jwtSecretBytes();

async function sesion(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (!puedeVerReportesComerciales({ role: payload.role as string, email: payload.email as string })) {
      return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };
    }
    return { payload };
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }
}

export async function GET(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  try {
    await ensureTablasReportesComerciales();
    const { searchParams } = new URL(request.url);
    const anio = parseInt(searchParams.get("anio") || `${new Date().getFullYear()}`, 10);
    const marca = (searchParams.get("marca") || "EZVIZ").toUpperCase();

    const { rows } = await query(
      `SELECT id, anio, marca, cliente_nombre, odoo_partner_id, meta_anual, activo
         FROM epp_clientes
        WHERE company_id = ? AND anio = ? AND marca = ?
        ORDER BY meta_anual DESC, cliente_nombre ASC`,
      [COMPANY_ID_PANAMA, anio, marca],
    );
    return NextResponse.json({ cuentas: rows, anio, marca });
  } catch (error: any) {
    console.error("Error EPP GET:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  try {
    await ensureTablasReportesComerciales();
    const body = await request.json();
    const accion: string = body.accion;
    const marca: string = (body.marca || "EZVIZ").toUpperCase();

    if (accion === "crear") {
      const { cliente_nombre, meta_anual, anio, odoo_partner_id } = body;
      if (!cliente_nombre || !anio) {
        return NextResponse.json({ error: "Faltan cliente_nombre o anio" }, { status: 400 });
      }
      await query(
        `INSERT INTO epp_clientes (company_id, anio, marca, cliente_nombre, odoo_partner_id, meta_anual, activo)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE meta_anual = VALUES(meta_anual), odoo_partner_id = VALUES(odoo_partner_id), activo = 1`,
        [COMPANY_ID_PANAMA, anio, marca, String(cliente_nombre).trim(), odoo_partner_id || null, Number(meta_anual) || 0],
      );
      return NextResponse.json({ success: true });
    }

    if (accion === "editar") {
      const { id, cliente_nombre, meta_anual, odoo_partner_id, activo } = body;
      if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
      await query(
        `UPDATE epp_clientes
            SET cliente_nombre = ?, meta_anual = ?, odoo_partner_id = ?, activo = ?
          WHERE id = ? AND company_id = ?`,
        [
          String(cliente_nombre).trim(),
          Number(meta_anual) || 0,
          odoo_partner_id || null,
          activo === 0 || activo === false ? 0 : 1,
          id,
          COMPANY_ID_PANAMA,
        ],
      );
      return NextResponse.json({ success: true });
    }

    if (accion === "eliminar") {
      const { id } = body;
      if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
      await query(`DELETE FROM epp_clientes WHERE id = ? AND company_id = ?`, [id, COMPANY_ID_PANAMA]);
      return NextResponse.json({ success: true });
    }

    if (accion === "copiar_anio") {
      const desde = parseInt(body.desde, 10);
      const hacia = parseInt(body.hacia, 10);
      if (!desde || !hacia || desde === hacia) {
        return NextResponse.json({ error: "Parametros desde/hacia invalidos" }, { status: 400 });
      }
      await query(
        `INSERT INTO epp_clientes (company_id, anio, marca, cliente_nombre, odoo_partner_id, meta_anual, activo)
         SELECT company_id, ?, marca, cliente_nombre, odoo_partner_id, meta_anual, 1
           FROM epp_clientes
          WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
         ON DUPLICATE KEY UPDATE meta_anual = VALUES(meta_anual), activo = 1`,
        [hacia, COMPANY_ID_PANAMA, desde, marca],
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Accion desconocida: ${accion}` }, { status: 400 });
  } catch (error: any) {
    console.error("Error EPP POST:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
