import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";

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

    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const firstDayStr = firstDayOfMonth.toISOString().split("T")[0];

    const odooTotals =
      (await callOdooRPC<any[]>("account.move", "search_read", [
        [
          ["invoice_date", ">=", firstDayStr],
          ["state", "=", "posted"],
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["company_id", "=", userCids],
          ["invoice_user_id", "=", seller.user_id],
        ],
        ["amount_untaxed", "move_type"],
      ])) || [];

    let facturado = 0;
    odooTotals.forEach((item: any) => {
      const amount = item.amount_untaxed || 0;
      facturado += item.move_type === "out_refund" ? -amount : amount;
    });

    facturado = parseFloat(facturado.toFixed(2));

    const porcentaje = meta > 0 ? parseFloat(((facturado / meta) * 100).toFixed(2)) : 0;
    const falta = parseFloat(Math.max(0, meta - facturado).toFixed(2));

    const totalDiasUtilesMes = contarDiasUtiles(firstDayOfMonth, lastDayOfMonth);
    const diasTranscurridos = contarDiasUtiles(firstDayOfMonth, now);
    const diasHabilesRestantes = Math.max(0, totalDiasUtilesMes - diasTranscurridos);
    const ventaDiariaNecesaria = diasHabilesRestantes > 0 ? parseFloat((falta / diasHabilesRestantes).toFixed(2)) : 0;
    const meta150 = meta * 1.5;
    const faltaPara150 = parseFloat(Math.max(0, meta150 - facturado).toFixed(2));

    return NextResponse.json({
      meta,
      facturado,
      porcentaje,
      falta,
      totalDiasUtilesMes,
      diasTranscurridos,
      diasHabilesRestantes,
      ventaDiariaNecesaria,
      meta150,
      faltaPara150,
    });
  } catch (error) {
    return NextResponse.json(null);
  }
}
