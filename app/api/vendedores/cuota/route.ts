import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

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
    const uid = parseInt(payload.uid as string);
    const userCids = payload.cids as number;

    const [resultSellers]: any = await db.query(
      "SELECT id, name, user_id FROM sellers WHERE cids = ? AND user_id = ?",
      [userCids, uid],
    );
    const seller = resultSellers?.[0];

    if (!seller) {
      return NextResponse.json(null);
    }

    const [resultCuotas]: any = await db.query(
      "SELECT cuota FROM cuota WHERE seller_id = ? ORDER BY created_at DESC LIMIT 1",
      [seller.id],
    );
    const meta = resultCuotas?.[0]?.cuota || 0;

    const firstDayOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1,
    )
      .toISOString()
      .split("T")[0];

    const odooTotals =
      (await callOdooRPC<any[]>("account.move", "read_group", [
        [
          ["invoice_date", ">=", firstDayOfMonth],
          ["state", "=", "posted"],
          ["move_type", "=", "out_invoice"],
        ],
        ["amount_total", "invoice_user_id"],
        ["invoice_user_id"],
      ])) || [];

    let facturado = 0;
    odooTotals.forEach((item: any) => {
      const odooId = item.invoice_user_id?.[0];
      const odooName = item.invoice_user_id?.[1]?.toUpperCase().trim();
      const sellerName = seller.name.toUpperCase().trim();

      if (Number(odooId) === Number(seller.user_id) || odooName === sellerName) {
        facturado += item.amount_total || 0;
      }
    });

    facturado = parseFloat(facturado.toFixed(2));

    const porcentaje = meta > 0 ? parseFloat(((facturado / meta) * 100).toFixed(2)) : 0;
    const falta = parseFloat(Math.max(0, meta - facturado).toFixed(2));

    return NextResponse.json({
      meta,
      facturado,
      porcentaje,
      falta,
    });
  } catch (error) {
    return NextResponse.json(null);
  }
}
