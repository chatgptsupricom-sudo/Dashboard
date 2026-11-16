import { query } from "@/lib/db";
import { veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

async function getUserFromRequest(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, { algorithms: ["HS256"] });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Sede de quien no es SuperAdmin: su cids o, si no tiene, su compañía en Odoo
 * (mismo criterio con el que POST crea la regla). null = no se pudo saber.
 */
async function sedeDelUsuario(payload: Record<string, unknown>): Promise<number | null> {
  const cids = Number(payload.cids);
  if (Number.isInteger(cids) && cids > 0) return cids;
  const uid = parseInt(String(payload.uid ?? ""), 10);
  if (!uid) return null;
  try {
    const users = await callOdooRPC<any[]>("res.users", "read", [[uid]], { fields: ["company_id"] });
    return users?.[0]?.company_id?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Para editar o borrar: el SuperAdmin cualquier regla; los gerentes solo las
 * de su sede. Antes PATCH/DELETE actuaban por id sin mirar la sede, así que
 * un gerente podía tocar las reglas de otra sede llamando a la API.
 */
async function errorReglaAjena(payload: Record<string, unknown>, id: unknown): Promise<NextResponse | null> {
  const { rows } = await query("SELECT company_id FROM spiff_rules WHERE id = ?", [id]);
  const regla = (rows as any[])[0];
  if (!regla) return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
  if (payload.role === "superAdmin") return null;
  const sede = await sedeDelUsuario(payload);
  if (!sede || Number(regla.company_id) !== sede)
    return NextResponse.json({ error: "Esa regla es de otra sede" }, { status: 403 });
  return null;
}

export async function GET(request: Request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");

    const role = payload.role as string;

    let targetCompanyId: number | null = null;
    if (veTodasLasSedes(role)) {
      targetCompanyId = companyId ? parseInt(companyId) : null;
    } else {
      // Sin sede conocida no se listan todas: antes, un usuario sin cids veía
      // las reglas de las tres sedes.
      targetCompanyId = await sedeDelUsuario(payload);
      if (!targetCompanyId) return NextResponse.json([]);
    }

    let result;
    if (targetCompanyId) {
      result = await query("SELECT * FROM spiff_rules WHERE company_id = ? ORDER BY created_at DESC", [targetCompanyId]);
    } else {
      result = await query("SELECT * FROM spiff_rules ORDER BY company_id, created_at DESC");
    }

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error("GET /api/spiff/rules error:", error);
    return NextResponse.json([]);
  }
}

export async function POST(request: Request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const role = payload.role as string;
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operaciones"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const {
      company_id, brand_name, target_amount, spiff_amount,
      tipo, product_name, product_id, modo, fecha_inicio, fecha_fin,
    } = body;

    if (!brand_name || !target_amount || !spiff_amount) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    let effectiveCompanyId = role === "superAdmin"
      ? (company_id ? parseInt(company_id) : null)
      : Number(payload.cids);

    if (!effectiveCompanyId || effectiveCompanyId === 0) {
      effectiveCompanyId = await sedeDelUsuario(payload);
    }

    if (!effectiveCompanyId || effectiveCompanyId === 0) {
      return NextResponse.json({ error: "Se requiere company_id válido" }, { status: 400 });
    }
    const userId = parseInt(payload.uid as string);

    const result = await query(
      `INSERT INTO spiff_rules
        (company_id, brand_name, tipo, product_name, product_id, target_amount, spiff_amount, modo, fecha_inicio, fecha_fin, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        effectiveCompanyId,
        brand_name.trim(),
        tipo || "marca",
        product_name || null,
        product_id || null,
        target_amount,
        spiff_amount,
        modo || "acumulado",
        fecha_inicio || null,
        fecha_fin || null,
        userId,
      ]
    );

    return NextResponse.json({ ok: true, id: result.rows.insertId });
  } catch (error) {
    console.error("POST /api/spiff/rules error:", error);
    return NextResponse.json({ error: "Error al crear regla" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const role = payload.role as string;
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operaciones"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, brand_name, target_amount, spiff_amount, active, tipo, product_name, product_id, modo, fecha_inicio, fecha_fin } = body;

    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const ajena = await errorReglaAjena(payload, id);
    if (ajena) return ajena;

    const updates: string[] = [];
    const params: any[] = [];

    if (brand_name !== undefined) { updates.push("brand_name = ?"); params.push(brand_name.trim()); }
    if (target_amount !== undefined) { updates.push("target_amount = ?"); params.push(target_amount); }
    if (spiff_amount !== undefined) { updates.push("spiff_amount = ?"); params.push(spiff_amount); }
    if (active !== undefined) { updates.push("active = ?"); params.push(active ? 1 : 0); }
    if (tipo !== undefined) { updates.push("tipo = ?"); params.push(tipo); }
    if (product_name !== undefined) { updates.push("product_name = ?"); params.push(product_name || null); }
    if (product_id !== undefined) { updates.push("product_id = ?"); params.push(product_id || null); }
    if (modo !== undefined) { updates.push("modo = ?"); params.push(modo); }
    if (fecha_inicio !== undefined) { updates.push("fecha_inicio = ?"); params.push(fecha_inicio || null); }
    if (fecha_fin !== undefined) { updates.push("fecha_fin = ?"); params.push(fecha_fin || null); }

    if (updates.length === 0) return NextResponse.json({ error: "Sin cambios" }, { status: 400 });

    params.push(id);
    await query(`UPDATE spiff_rules SET ${updates.join(", ")} WHERE id = ?`, params);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/spiff/rules error:", error);
    return NextResponse.json({ error: "Error al actualizar regla" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const role = payload.role as string;
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operaciones"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });
    const ajena = await errorReglaAjena(payload, id);
    if (ajena) return ajena;

    await query("DELETE FROM spiff_rules WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/spiff/rules error:", error);
    return NextResponse.json({ error: "Error al eliminar regla" }, { status: 500 });
  }
}
