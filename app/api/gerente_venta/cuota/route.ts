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
    const userCids = payload.cids as number;

    // 1. Obtener vendedores de la DB local
    const [resultSellers]: any = await db.query(
      "SELECT id, name, user_id FROM sellers WHERE cids = ?",
      [userCids],
    );
    const sellers = (resultSellers || []).filter((s: any) => s.name?.toUpperCase().trim() !== "MARIA AUXILIADORA TOVAR CARO");

    // 2. Obtener cuotas actuales (último registro por seller)
    const [resultCuotas]: any = await db.query(`
      SELECT c.seller_id, c.cuota FROM cuota c
      INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest
      ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date
    `);
    const cuotas = resultCuotas || [];

    // 3. Obtener facturación usando READ_GROUP (Lógica a prueba de errores)
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

    const mapaFacturacion = odooTotals.reduce((acc: any, item: any) => {
      const odooUserId = item.invoice_user_id ? item.invoice_user_id[0] : null;
      if (odooUserId) acc[odooUserId] = item.amount_total;
      return acc;
    }, {});

    // 5. Cruzar datos
    const data = sellers.map((seller: any) => {
      const meta =
        cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0;
      const facturado = odooTotals.reduce((sum: number, item: any) => {
        const odooId = item.invoice_user_id?.[0];
        const odooName = item.invoice_user_id?.[1]?.toUpperCase().trim();
        const sellerName = seller.name.toUpperCase().trim();

        const coincidePorId = Number(odooId) === Number(seller.user_id);
        const coincidePorNombre = odooName === sellerName;

        if (coincidePorId || coincidePorNombre) {
          return sum + (item.amount_total || 0);
        }
        return sum;
      }, 0);

      return {
        ...seller,
        meta: parseFloat(meta.toString()),
        facturado: parseFloat(facturado.toFixed(2)),
        porcentaje:
          meta > 0 ? parseFloat(((facturado / meta) * 100).toFixed(2)) : 0,
        falta: parseFloat(Math.max(0, meta - facturado).toFixed(2)),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
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

    const connection = await (db as any).getConnection();
    await connection.beginTransaction();

    try {
      const [seller]: any = await connection.query(
        "SELECT user_id FROM sellers WHERE id = ?",
        [seller_id],
      );
      const targetUserId = seller[0]?.user_id || 0;

      // 1. Insertar cuota usando el user_id (Odoo) real
      await connection.query(
        "INSERT INTO cuota (user_id, seller_id, cuota, created_at) VALUES (?, ?, ?, NOW())",
        [targetUserId, seller_id, cuota],
      );

      // 2. Registrar en auditoría
      const uniqueId = Math.floor(Date.now() / 1000);

      await connection.query(
        `INSERT INTO audit_logs (id, user_id, user_name, role, action, changes) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          uniqueId, // Nuevo: ID único generado
          payload.uid || "0",
          payload.name || "Sistema",
          payload.role || "Gerencia",
          "EDIT_CUOTA",
          JSON.stringify({ seller_id, nueva_cuota: cuota }),
        ],
      );

      await connection.commit();
      return NextResponse.json({ success: true });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
