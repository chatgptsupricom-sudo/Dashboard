import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    const userId = payload.userId || payload.odooId || "0";
    const userName = payload.name || "Usuario Desconocido";

    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { moqData } = body;

    if (!Array.isArray(moqData) || moqData.length === 0) {
      return NextResponse.json(
        { error: "No se enviaron datos válidos" },
        { status: 400 },
      );
    }

    // Obtenemos los MOQs y Costos actuales
    const currentMoqsResult = await query(
      "SELECT sku, cantidad, costo FROM moqs",
    );
    const currentMap = new Map(
      currentMoqsResult.rows.map((row: any) => [row.sku, row]),
    );

    const changesToApply = [];
    const auditDetails = [];

    for (const item of moqData) {
      const current = currentMap.get(item.sku);

      // Comparamos cantidad o costo
      // Forzamos la comparación de costo como Number
      const currentQty = current ? current.cantidad : undefined;
      const currentCosto = current ? Number(current.costo) : undefined;

      if (currentQty !== item.cantidad || currentCosto !== item.costo) {
        changesToApply.push(item);
        auditDetails.push({
          sku: item.sku,
          moq_anterior: currentQty || null,
          moq_nuevo: item.cantidad,
          costo_anterior: currentCosto || null,
          costo_nuevo: item.costo,
        });
      }
    }

    if (changesToApply.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message:
            "No se detectaron cambios. Todos los registros ya están actualizados.",
        },
        { status: 200 },
      );
    }

    // Actualización en BD (Upsert) incluyendo el COSTO
    const promesasSQL = changesToApply.map((item) => {
      const sql = `
        INSERT INTO moqs (sku, cantidad, costo)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          cantidad = VALUES(cantidad),
          costo = VALUES(costo),
          updatedAt = CURRENT_TIMESTAMP
      `;
      // Enviamos el costo, si no hay costo lo mandamos como null
      return query(sql, [
        item.sku,
        item.cantidad,
        item.costo !== undefined ? item.costo : null,
      ]);
    });

    await Promise.all(promesasSQL);

    // Registro en auditoría
    try {
      const auditId = Math.floor(Date.now() / 1000);
      const auditChangesJson = JSON.stringify({ actualizados: auditDetails });

      const auditSql = `
        INSERT INTO audit_logs
        (id, user_id, user_name, role, action, changes)
        VALUES (?, ?, ?, ?, ?, ?)
      `;

      await query(auditSql, [
        auditId,
        String(userId),
        userName,
        userRole,
        "UPDATE_MASSIVE_MOQ_COST",
        auditChangesJson,
      ]);
    } catch (auditError) {
      console.error("❌ Fallo crítico al guardar el audit_log:", auditError);
    }

    return NextResponse.json(
      {
        success: true,
        message: `Se actualizaron y registraron ${changesToApply.length} productos correctamente.`,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Error guardando MOQ/Costo:", error.message);
    return NextResponse.json(
      { error: "Error interno procesando el archivo." },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();

    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const moqsResult = await query("SELECT sku, cantidad, costo FROM moqs ORDER BY sku ASC");
    const moqs = moqsResult.rows as any[];

    if (moqs.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const skus = moqs.map((m: any) => m.sku);
    const productsData = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["default_code", "in", skus], ["active", "=", true]]],
      { fields: ["default_code", "name", "categ_id"], limit: 0 },
    );

    const productMap = new Map<string, any>();
    if (productsData) {
      productsData.forEach((p: any) => {
        if (p.default_code) productMap.set(p.default_code.trim(), p);
      });
    }

    const result = moqs.map((m: any) => {
      const prod = productMap.get(m.sku);
      return {
        sku: m.sku,
        nombre: prod?.name || "Sin nombre en Odoo",
        categoria: prod?.categ_id ? prod.categ_id[1] : "Sin categoría",
        cantidad: Number(m.cantidad) || 0,
        costo: Number(m.costo) || 0,
      };
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error obteniendo MOQs:", error.message);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
