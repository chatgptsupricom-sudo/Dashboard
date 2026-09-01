import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "15");
    const type = searchParams.get("type") || "all";
    const offset = (page - 1) * limit;

    // 1. CÁLCULO DE LAS ÚLTIMAS 24 HORAS
    const yesterday = new Date();
    yesterday.setHours(yesterday.getHours() - 24);
    // Formato Odoo: YYYY-MM-DD HH:mm:ss
    const odooDateLimit = yesterday
      .toISOString()
      .replace("T", " ")
      .split(".")[0];

    // 2. DOMINIO OPTIMIZADO
    const domain: any[] = [
      ["date", ">=", odooDateLimit], // FILTRO CRÍTICO: Solo últimas 24h
      ["model", "!=", false],
      ["message_type", "=", "notification"],
    ];

    if (type === "critical") domain.push(["body", "ilike", "eliminó"]);
    if (type === "action") domain.push(["body", "ilike", "actualizó"]);

    // 3. CONSULTA EN PARALELO
    const [logs, totalCount] = await Promise.all([
      callOdooRPC<any[]>("mail.message", "search_read", [
        domain,
        ["date", "author_id", "body", "model", "record_name"],
        offset,
        limit,
        "date desc",
      ]),
      callOdooRPC<number>("mail.message", "search_count", [domain]),
    ]);

    const MODEL_LABELS: Record<string, string> = {
      "sale.order": "Orden de venta",
      "account.move": "Factura / Asiento contable",
      "account.payment": "Pago",
      "stock.picking": "Transferencia",
      "stock.move": "Movimiento de inventario",
      "res.partner": "Cliente / Proveedor",
      "purchase.order": "Orden de compra",
      "product.product": "Producto",
      "product.template": "Producto",
      "crm.lead": "Oportunidad",
      "hr.employee": "Empleado",
      "account.move.line": "Línea contable",
      "account.bank.statement": "Extracto bancario",
      "account.bank.statement.line": "Línea de extracto",
      "sale.order.line": "Línea de venta",
      "purchase.order.line": "Línea de compra",
      "stock.quant": "Inventario",
      "ir.sequence": "Secuencia",
    };

    const formattedLogs = logs.map((log) => {
      const rawBody = log.body || "";
      const cleanBody = rawBody.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      let level = "INFO";
      if (
        cleanBody.toLowerCase().includes("borró") ||
        cleanBody.toLowerCase().includes("eliminó")
      )
        level = "CRITICAL";
      else if (cleanBody.toLowerCase().includes("creó")) level = "SUCCESS";
      else if (cleanBody.toLowerCase().includes("actualizó")) level = "ACTION";

      let description = cleanBody;
      if (!description && log.record_name) {
        const modelLabel = MODEL_LABELS[log.model] || log.model || "";
        description = modelLabel ? `${modelLabel} ${log.record_name}` : log.record_name;
      }
      if (!description && log.model) {
        description = MODEL_LABELS[log.model] || log.model;
      }

      return {
        id: log.id,
        timestamp: log.date,
        user: log.author_id ? log.author_id[1] : "Sistema",
        action: description || "Sin descripción",
        target: log.record_name || log.model,
        level: level,
      };
    });

    return NextResponse.json({
      logs: formattedLogs,
      total_count: totalCount,
      period: "Last 24 Hours",
    });
  } catch (error: any) {
    console.error("❌ Audit API Error:", error);
    return NextResponse.json(
      { error: "Error de conexión con Odoo" },
      { status: 500 },
    );
  }
}
