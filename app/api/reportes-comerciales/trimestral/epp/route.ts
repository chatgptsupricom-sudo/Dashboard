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

/** Normaliza las razones sociales que llegan del cliente a [{id, nombre}]. */
function normalizarRazones(raw: any): { id: number | null; nombre: string }[] {
  if (!Array.isArray(raw)) return [];
  const vistos = new Set<string>();
  const out: { id: number | null; nombre: string }[] = [];
  for (const r of raw) {
    const id = r?.id != null && r.id !== "" ? Number(r.id) : null;
    const nombre = String(r?.nombre || "").trim();
    if (id == null && !nombre) continue;
    const clave = id != null ? `id:${id}` : `n:${nombre.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push({ id, nombre });
  }
  return out;
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
      `SELECT id, anio, marca, cliente_nombre, odoo_partner_id, razones_sociales, meta_anual, activo
         FROM epp_clientes
        WHERE company_id = ? AND anio = ? AND marca = ?
        ORDER BY meta_anual DESC, cliente_nombre ASC`,
      [COMPANY_ID_PANAMA, anio, marca],
    );
    const cuentas = (rows as any[]).map((r) => ({
      ...r,
      razones_sociales: parseJson(r.razones_sociales) ?? [
        { id: r.odoo_partner_id ?? null, nombre: r.cliente_nombre },
      ],
    }));
    return NextResponse.json({ cuentas, anio, marca });
  } catch (error: any) {
    console.error("Error EPP GET:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

function parseJson(s: any): any[] | null {
  if (!s) return null;
  try {
    const a = JSON.parse(s);
    return Array.isArray(a) && a.length > 0 ? a : null;
  } catch {
    return null;
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

    if (accion === "crear" || accion === "editar") {
      const razones = normalizarRazones(body.razones_sociales);
      if (razones.length === 0) {
        return NextResponse.json(
          { error: "Agrega al menos una razón social" },
          { status: 400 },
        );
      }
      const label = String(body.cliente_nombre || razones[0].nombre).trim();
      const principal = razones[0].id ?? null;
      const razonesJson = JSON.stringify(razones);
      const meta = Number(body.meta_anual) || 0;

      if (accion === "crear") {
        if (!body.anio) {
          return NextResponse.json({ error: "Falta anio" }, { status: 400 });
        }
        await query(
          `INSERT INTO epp_clientes
             (company_id, anio, marca, cliente_nombre, odoo_partner_id, razones_sociales, meta_anual, activo)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)
           ON DUPLICATE KEY UPDATE
             meta_anual = VALUES(meta_anual),
             odoo_partner_id = VALUES(odoo_partner_id),
             razones_sociales = VALUES(razones_sociales),
             activo = 1`,
          [COMPANY_ID_PANAMA, body.anio, marca, label, principal, razonesJson, meta],
        );
        return NextResponse.json({ success: true });
      }

      // editar
      if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
      await query(
        `UPDATE epp_clientes
            SET cliente_nombre = ?, odoo_partner_id = ?, razones_sociales = ?, meta_anual = ?, activo = ?
          WHERE id = ? AND company_id = ?`,
        [
          label,
          principal,
          razonesJson,
          meta,
          body.activo === 0 || body.activo === false ? 0 : 1,
          body.id,
          COMPANY_ID_PANAMA,
        ],
      );
      return NextResponse.json({ success: true });
    }

    if (accion === "eliminar") {
      if (!body.id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
      await query(`DELETE FROM epp_clientes WHERE id = ? AND company_id = ?`, [
        body.id,
        COMPANY_ID_PANAMA,
      ]);
      return NextResponse.json({ success: true });
    }

    if (accion === "copiar_anio") {
      const desde = parseInt(body.desde, 10);
      const hacia = parseInt(body.hacia, 10);
      if (!desde || !hacia || desde === hacia) {
        return NextResponse.json({ error: "Parametros desde/hacia invalidos" }, { status: 400 });
      }
      await query(
        `INSERT INTO epp_clientes
           (company_id, anio, marca, cliente_nombre, odoo_partner_id, razones_sociales, meta_anual, activo)
         SELECT company_id, ?, marca, cliente_nombre, odoo_partner_id, razones_sociales, meta_anual, 1
           FROM epp_clientes
          WHERE company_id = ? AND anio = ? AND marca = ? AND activo = 1
         ON DUPLICATE KEY UPDATE
           meta_anual = VALUES(meta_anual),
           odoo_partner_id = VALUES(odoo_partner_id),
           razones_sociales = VALUES(razones_sociales),
           activo = 1`,
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
