import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const COMPANY_MAP: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

export async function GET() {
  try {
    const [resultSellers]: any = await db.query(
      "SELECT id, name, user_id, cids FROM sellers",
    );
    const sellers = resultSellers || [];

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

    const odooTotals =
      (await callOdooRPC<any[]>("account.move.line", "read_group", [
        [
          ["move_id.move_type", "=", "out_invoice"],
          ["move_id.state", "=", "posted"],
          ["move_id.invoice_date", ">=", firstDayOfMonth],
          ["product_id", "!=", false],
        ],
        ["price_subtotal", "move_id.invoice_user_id"],
        ["move_id.invoice_user_id"],
      ])) || [];

    const grouped: Record<number, { cids: number; sucursal: string; sellers: any[] }> = {};

    for (const seller of sellers) {
      if (seller.name?.toUpperCase().trim() === "MARIA AUXILIADORA TOVAR CARO") continue;
      const cid = seller.cids || 0;
      if (!grouped[cid]) {
        grouped[cid] = {
          cids: cid,
          sucursal: COMPANY_MAP[cid] || `Sucursal ${cid}`,
          sellers: [],
        };
      }

      const meta = cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0;
      const facturado = odooTotals.reduce((sum: number, item: any) => {
        const odooId = item["move_id.invoice_user_id"]?.[0];
        const odooName = item["move_id.invoice_user_id"]?.[1]?.toUpperCase().trim();
        const sellerName = seller.name.toUpperCase().trim();
        if (Number(odooId) === Number(seller.user_id) || odooName === sellerName) {
          return sum + (item.price_subtotal || 0);
        }
        return sum;
      }, 0);

      grouped[cid].sellers.push({
        id: seller.id,
        name: seller.name,
        user_id: seller.user_id,
        meta: parseFloat(meta.toString()),
        facturado: parseFloat(facturado.toFixed(2)),
        porcentaje: meta > 0 ? parseFloat(((facturado / meta) * 100).toFixed(2)) : 0,
        falta: parseFloat(Math.max(0, meta - facturado).toFixed(2)),
      });
    }

    const ordenSucursales = [9, 10, 7];
    const result = ordenSucursales
      .filter((cid) => grouped[cid])
      .map((cid) => ({
        ...grouped[cid],
        sellers: grouped[cid].sellers.sort((a, b) => b.facturado - a.facturado),
      }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error en API cuota superadmin:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader.split("token=")[1]?.split(";")[0];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const { seller_id, cuota } = await req.json();

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
          payload.role || "SuperAdmin",
          "EDIT_CUOTA",
          JSON.stringify({ seller_id, nueva_cuota: cuota }),
        ],
      );
    } catch (_) {}

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error en POST cuota superadmin:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
