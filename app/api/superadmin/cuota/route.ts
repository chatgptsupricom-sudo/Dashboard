import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";

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

    const nowSa = new Date();
    const firstDayOfMonth = new Date(nowSa.getFullYear(), nowSa.getMonth(), 1);
    const firstDayStr = `${firstDayOfMonth.getFullYear()}-${String(firstDayOfMonth.getMonth() + 1).padStart(2, "0")}-${String(firstDayOfMonth.getDate()).padStart(2, "0")}`;

    const sellersDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["invoice_date", ">=", firstDayStr],
    ];

    const allInvoices =
      (await callOdooRPC<any[]>("account.move", "search_read", [
        sellersDomain,
      ], {
        fields: ["amount_untaxed", "invoice_user_id", "company_id", "move_type"],
      })) || [];

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
      const amount = inv.move_type === "out_refund" ? -(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0);
      if (userId) odooUserIdMap[userId] = (odooUserIdMap[userId] || 0) + amount;
      if (odooName) {
        const key = normalize(odooName);
        odooNameMap[key] = (odooNameMap[key] || 0) + amount;
      }
    });

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
      const sellerKey = normalize(seller.name);
      const facturado = parseFloat(
        ((odooNameMap[sellerKey] ?? odooUserIdMap[seller.user_id] ?? 0)).toFixed(2)
      );

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const totalDiasUtilesMes = contarDiasUtiles(firstDay, lastDay);
      const diasTranscurridos = contarDiasUtiles(firstDay, now);
      const diasHabilesRestantes = Math.max(0, totalDiasUtilesMes - diasTranscurridos);

      if (sellers.indexOf(seller) === 0) {
        console.log(`[CUOTA] Hoy: ${now.toISOString()} | firstDay: ${firstDay.getFullYear()}-${firstDay.getMonth()+1}-${firstDay.getDate()} | lastDay: ${lastDay.getFullYear()}-${lastDay.getMonth()+1}-${lastDay.getDate()} | totalUtiles: ${totalDiasUtilesMes} | transcurridos: ${diasTranscurridos} | restantes: ${diasHabilesRestantes}`);
      }
      const falta = parseFloat(Math.max(0, meta - facturado).toFixed(2));
      const ventaDiariaNecesaria = diasHabilesRestantes > 0 ? parseFloat((falta / diasHabilesRestantes).toFixed(2)) : 0;
      const meta150 = meta * 1.5;
      const faltaPara150 = parseFloat(Math.max(0, meta150 - facturado).toFixed(2));

      grouped[cid].sellers.push({
        id: seller.id,
        name: seller.name,
        user_id: seller.user_id,
        meta: parseFloat(meta.toString()),
        facturado,
        porcentaje: meta > 0 ? parseFloat(((facturado / meta) * 100).toFixed(2)) : 0,
        falta,
        diasHabilesRestantes,
        ventaDiariaNecesaria,
        meta150,
        faltaPara150,
      });
    }

    const ordenSucursales = [9, 10, 7];
    const result = ordenSucursales
      .filter((cid) => grouped[cid])
      .map((cid) => {
        const g = grouped[cid];
        const totalMeta = g.sellers.reduce((s, v) => s + v.meta, 0);
        const totalFacturado = g.sellers.reduce((s, v) => s + v.facturado, 0);
        return {
          ...g,
          totalMeta: parseFloat(totalMeta.toFixed(2)),
          totalFacturado: parseFloat(totalFacturado.toFixed(2)),
          porcentaje: totalMeta > 0 ? parseFloat(((totalFacturado / totalMeta) * 100).toFixed(2)) : 0,
          sellers: g.sellers.sort((a, b) => b.facturado - a.facturado),
        };
      });

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
