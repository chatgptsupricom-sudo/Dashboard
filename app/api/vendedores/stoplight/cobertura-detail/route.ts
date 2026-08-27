import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;

    const semanas = (() => {
      const result: { inicio: Date; fin: Date }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        result.push({ inicio: new Date(inicio), fin: new Date(fin) });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    const sellerResult = await query(
      `SELECT s.id as seller_id, s.name FROM sellers s WHERE s.cids = ? AND s.user_id = ?`,
      [companyId, uid]
    );
    const sellers = sellerResult.rows as any[];
    if (sellers.length === 0) {
      return NextResponse.json({ success: true, data: { mes, sellers: [], marcas: [] } });
    }

    const invoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", fechaInicio],
        ["invoice_date", "<=", fechaFin],
        ["invoice_user_id", "=", uid],
      ]],
      { fields: ["id", "invoice_date", "move_type"], limit: 10000 }
    );

    const invoiceIds = (invoices || []).map((inv: any) => inv.id);
    const invDateMap: Record<number, Date> = {};
    (invoices || []).forEach((inv: any) => { invDateMap[inv.id] = new Date(inv.invoice_date); });

    let lines: any[] = [];
    if (invoiceIds.length > 0) {
      lines = (await callOdooRPC<any[]>(
        "account.move.line", "search_read",
        [[["move_id", "in", invoiceIds], ["display_type", "=", "product"], ["product_id", "!=", false]]],
        { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 }
      )) || [];
    }

    const productIds = [...new Set(lines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
    const productCostMap: Record<number, number> = {};
    const productNameMap: Record<number, string> = {};

    if (productIds.length > 0) {
      const details = (await callOdooRPC<any[]>(
        "product.product", "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        { fields: ["id", "name", "product_tmpl_id"], limit: 0 }
      )) || [];
      details.forEach((p: any) => { productNameMap[p.id] = p.name || "Sin nombre"; });
      const varToTmpl: Record<number, number> = {};
      details.forEach((p: any) => { if (p.product_tmpl_id?.[0]) varToTmpl[p.id] = p.product_tmpl_id[0]; });
      const tmplIds = [...new Set(details.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
      if (tmplIds.length > 0) {
        const templates = (await callOdooRPC<any[]>(
          "product.template", "search_read",
          [[["id", "in", tmplIds]]],
          { fields: ["id", "standard_price"], limit: 0 }
        )) || [];
        const tmplCost: Record<number, number> = {};
        templates.forEach((t: any) => { tmplCost[t.id] = Number(t.standard_price) || 0; });
        productIds.forEach((pid) => { const tid = varToTmpl[pid]; productCostMap[pid] = tid ? (tmplCost[tid] || 0) : 0; });
      }
    }

    // Brand aggregation
    const brandMap: Record<string, { revenue: number; costo: number; cantidad: number; semanas: { revenue: number; costo: number; cantidad: number }[] }> = {};
    const semanasData = semanas.map(() => ({ revenue: 0, costo: 0, cantidad: 0 }));

    lines.forEach((line: any) => {
      const moveId = line.move_id?.[0];
      const invDate = invDateMap[moveId];
      if (!invDate) return;
      const productId = line.product_id?.[0];
      const qty = Math.abs(Number(line.quantity) || 0);
      const revenue = Math.abs(Number(line.price_subtotal) || 0);
      const unitCost = productId ? (productCostMap[productId] || 0) : 0;
      const costo = qty * unitCost;

      const inv = (invoices || []).find((i: any) => i.id === moveId);
      const isRefund = inv?.move_type === "out_refund";
      const rFinal = isRefund ? -revenue : revenue;
      const cFinal = isRefund ? -costo : costo;
      const qFinal = isRefund ? -qty : qty;

      const brandName = productNameMap[productId] || "Sin marca";
      if (!brandMap[brandName]) brandMap[brandName] = { revenue: 0, costo: 0, cantidad: 0, semanas: semanas.map(() => ({ revenue: 0, costo: 0, cantidad: 0 })) };
      brandMap[brandName].revenue += rFinal;
      brandMap[brandName].costo += cFinal;
      brandMap[brandName].cantidad += qFinal;

      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          brandMap[brandName].semanas[i].revenue += rFinal;
          brandMap[brandName].semanas[i].costo += cFinal;
          brandMap[brandName].semanas[i].cantidad += qFinal;
          break;
        }
      }
    });

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["cobertura_marcas", companyId, mes]
    );
    const metaCantidad = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    const marcasResult = Object.entries(brandMap).map(([marca, data]) => {
      const margen = data.revenue > 0 ? Math.round(((data.revenue - data.costo) / data.revenue) * 100) : 0;
      return { marca, revenue: Math.round(data.revenue * 100) / 100, costo: Math.round(data.costo * 100) / 100, ganancia: Math.round((data.revenue - data.costo) * 100) / 100, cantidad: Math.round(data.cantidad * 100) / 100, margen };
    }).sort((a, b) => b.revenue - a.revenue);

    const sellerSemanas = semanas.map((sem, i) => {
      const esFuturo = sem.inicio > now;
      const cantidad = Object.values(brandMap).reduce((sum, b) => sum + b.semanas[i].cantidad, 0);
      const pct = metaCantidad > 0 ? Math.round((cantidad / metaCantidad) * 100) : (cantidad > 0 ? Math.round(cantidad) : null);
      return { numero: i + 1, cantidad: Math.round(cantidad * 100) / 100, pctMeta: esFuturo ? null : pct };
    });

    return NextResponse.json({
      success: true,
      data: {
        mes,
        sellers: [{
          nombre: sellers[0].name,
          sellerId: sellers[0].seller_id,
          cantidadVendida: marcasResult.reduce((sum, b) => sum + b.cantidad, 0),
          metaCantidad,
          semanas: sellerSemanas,
        }],
        marcas: marcasResult,
      },
    });
  } catch (error: any) {
    console.error("Error en API cobertura-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
