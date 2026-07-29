import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader.split("token=")[1]?.split(";")[0];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userCids = payload.cids as number;

    const [resultSellers]: any = await db.query(
      "SELECT id, name, user_id FROM sellers WHERE cids = ?",
      [userCids],
    );
    const sellers = (resultSellers || []).filter(
      (s: any) => s.name?.toUpperCase().trim() !== "MARIA AUXILIADORA TOVAR CARO",
    );

    const [resultCuotas]: any = await db.query(`
      SELECT c.seller_id, c.cuota FROM cuota c
      INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest
      ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date
    `);
    const cuotas = resultCuotas || [];

    const firstDayOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )
      .toISOString()
      .split("T")[0];

    const allInvoices =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "in", ["out_invoice", "out_refund"]],
            ["state", "=", "posted"],
            ["invoice_date", ">=", firstDayOfMonth],
            ["company_id", "=", userCids],
          ],
        ],
        {
          fields: [
            "amount_untaxed",
            "invoice_user_id",
            "company_id",
            "move_type",
          ],
        },
      )) || [];

    const normalize = (s: string) =>
      (s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\./g, "")
        .trim()
        .replace(/\s+/g, " ");

    const odooNameMap: Record<string, number> = {};
    const odooUserIdMap: Record<number, number> = {};
    allInvoices.forEach((inv: any) => {
      const userId = inv.invoice_user_id?.[0] || 0;
      const odooName = inv.invoice_user_id?.[1] || "";
      const amount =
        inv.move_type === "out_refund"
          ? -(inv.amount_untaxed || 0)
          : inv.amount_untaxed || 0;
      if (userId) odooUserIdMap[userId] = (odooUserIdMap[userId] || 0) + amount;
      if (odooName) {
        const key = normalize(odooName);
        odooNameMap[key] = (odooNameMap[key] || 0) + amount;
      }
    });

    const data = sellers.map((seller: any) => {
      const meta =
        cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0;
      const sellerKey = normalize(seller.name);
      const facturado = parseFloat(
        (
          odooNameMap[sellerKey] ??
          odooUserIdMap[seller.user_id] ??
          0
        ).toFixed(2),
      );

      return {
        ...seller,
        meta: parseFloat(meta.toString()),
        facturado,
        porcentaje:
          meta > 0
            ? parseFloat(((facturado / meta) * 100).toFixed(2))
            : 0,
        falta: parseFloat(Math.max(0, meta - facturado).toFixed(2)),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error en cuota gerente_venta:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader.split("token=")[1]?.split(";")[0];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const { seller_id, cuota } = await req.json();

    const firstDayOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )
      .toISOString()
      .split("T")[0];

    const [existing]: any = await db.query(
      "SELECT id FROM cuota WHERE seller_id = ? AND created_at >= ?",
      [seller_id, firstDayOfMonth],
    );
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "Ya se modificó la cuota de este vendedor este mes" },
        { status: 403 },
      );
    }

    const [seller]: any = await db.query(
      "SELECT user_id FROM sellers WHERE id = ?",
      [seller_id],
    );
    const targetUserId = seller[0]?.user_id || 0;

    await db.query(
      "INSERT INTO cuota (id, user_id, seller_id, cuota, created_at) VALUES (?, ?, ?, ?, NOW())",
      [Math.floor(Date.now() / 1000), targetUserId, seller_id, cuota],
    );

    try {
      await db.query(
        `INSERT INTO audit_logs (user_id, user_name, role, action, changes) VALUES (?, ?, ?, ?, ?)`,
        [
          payload.uid || "0",
          payload.name || "Sistema",
          payload.role || "Gerencia",
          "EDIT_CUOTA",
          JSON.stringify({ seller_id, nueva_cuota: cuota }),
        ],
      );
    } catch (_) {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en POST cuota gerente ventas:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
