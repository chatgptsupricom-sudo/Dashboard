import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

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

export async function GET(request: Request) {
  const payload = await getUserFromRequest(request);
  if (!payload) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");

    const role = payload.role as string;
    const userCids = payload.cids as number;

    let targetCompanyId: number | null = null;
    if (role === "superAdmin") {
      targetCompanyId = companyId ? parseInt(companyId) : null;
    } else {
      targetCompanyId = userCids;
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
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operations"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { company_id, brand_name, target_amount, spiff_amount } = body;

    if (!brand_name || !target_amount || !spiff_amount) {
      return NextResponse.json({ error: "Faltan campos obligatorios" }, { status: 400 });
    }

    const effectiveCompanyId = role === "superAdmin" ? (company_id || payload.cids) : payload.cids;
    const userId = parseInt(payload.uid as string);

    const result = await query(
      "INSERT INTO spiff_rules (company_id, brand_name, target_amount, spiff_amount, created_by) VALUES (?, ?, ?, ?, ?)",
      [effectiveCompanyId, brand_name.trim(), target_amount, spiff_amount, userId]
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
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operations"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id, brand_name, target_amount, spiff_amount, active } = body;

    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const updates: string[] = [];
    const params: any[] = [];

    if (brand_name !== undefined) { updates.push("brand_name = ?"); params.push(brand_name.trim()); }
    if (target_amount !== undefined) { updates.push("target_amount = ?"); params.push(target_amount); }
    if (spiff_amount !== undefined) { updates.push("spiff_amount = ?"); params.push(spiff_amount); }
    if (active !== undefined) { updates.push("active = ?"); params.push(active ? 1 : 0); }

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
  const allowedRoles = ["superAdmin", "Gerencia De Ventas", "Gerente de Operations"];
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "Acceso denegado" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    await query("DELETE FROM spiff_rules WHERE id = ?", [id]);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/spiff/rules error:", error);
    return NextResponse.json({ error: "Error al eliminar regla" }, { status: 500 });
  }
}
