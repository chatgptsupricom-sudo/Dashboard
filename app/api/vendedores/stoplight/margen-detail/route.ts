import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

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
      const result: { inicio: Date; fin: Date; diasUtiles: number }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        result.push({ inicio: new Date(inicio), fin: new Date(fin), diasUtiles: contarDiasUtiles(inicio, fin) });
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
      return NextResponse.json({ success: true, data: { mes, totalDiasUtilesMes: 0, sellers: [], products: [] } });
    }

    const invoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", fechaInicio],
        ["invoice_date", "<=", fechaFin],
        ["invoice_user_id", "=", uid],
      ]],
      { fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "move_type"], limit: 10000 }
    );

    const invoiceIds = (invoices || []).map((inv: any) => inv.id);
    let invoiceLines: any[] = [];
    if (invoiceIds.length > 0) {
      invoiceLines = (await callOdooRPC<any[]>(
        "account.move.line", "search_read",
        [[["move_id", "in", invoiceIds], ["display_type", "=", "product"], ["product_id", "!=", false]]],
        { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 }
      )) || [];
    }

    const productIds = [...new Set(invoiceLines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
    const productCostMap: Record<number, number> = {};
    const productNameMap: Record<number, string> = {};

    if (productIds.length > 0) {
      const productDetails = (await callOdooRPC<any[]>(
        "product.product", "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        { fields: ["id", "name", "product_tmpl_id"], limit: 0 }
      )) || [];
      productDetails.forEach((p: any) => { productNameMap[p.id] = p.name || "Sin nombre"; });
      const variantToTmpl: Record<number, number> = {};
      productDetails.forEach((p: any) => { if (p.product_tmpl_id?.[0]) variantToTmpl[p.id] = p.product_tmpl_id[0]; });
      const tmplIds = [...new Set(productDetails.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
      if (tmplIds.length > 0) {
        const templates = (await callOdooRPC<any[]>(
          "product.template", "search_read",
          [[["id", "in", tmplIds]]],
          { fields: ["id", "standard_price"], limit: 0 }
        )) || [];
        const tmplCostMap: Record<number, number> = {};
        templates.forEach((t: any) => { tmplCostMap[t.id] = Number(t.standard_price) || 0; });
        productIds.forEach((pid: number) => { const tid = variantToTmpl[pid]; productCostMap[pid] = tid ? (tmplCostMap[tid] || 0) : 0; });
      }
    }

    const invoiceMap: Record<number, any> = {};
    (invoices || []).forEach((inv: any) => { invoiceMap[inv.id] = inv; });

    let totalRevenue = 0;
    let totalCosto = 0;
    const semanasData = semanas.map(() => ({ revenue: 0, costo: 0 }));
    const productDataMap: Record<number, { productId: number; nombre: string; cantidadVendida: number; revenue: number; costo: number }> = {};

    invoiceLines.forEach((line: any) => {
      const moveId = line.move_id?.[0];
      const inv = invoiceMap[moveId];
      if (!inv) return;
      const productId = line.product_id?.[0];
      const qty = Number(line.quantity) || 0;
      const revenue = Number(line.price_subtotal) || 0;
      const unitCost = productId ? (productCostMap[productId] || 0) : 0;
      const costo = qty * unitCost;
      const isRefund = inv.move_type === "out_refund";
      const rFinal = isRefund ? -revenue : revenue;
      const cFinal = isRefund ? -costo : costo;

      totalRevenue += rFinal;
      totalCosto += cFinal;

      if (productId) {
        if (!productDataMap[productId]) productDataMap[productId] = { productId, nombre: productNameMap[productId] || "Sin nombre", cantidadVendida: 0, revenue: 0, costo: 0 };
        productDataMap[productId].cantidadVendida += qty;
        productDataMap[productId].revenue += rFinal;
        productDataMap[productId].costo += cFinal;
      }

      const invDate = new Date(inv.invoice_date);
      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          semanasData[i].revenue += rFinal;
          semanasData[i].costo += cFinal;
          break;
        }
      }
    });

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["margen_bruto", companyId, mes]
    );
    const metaMargen = (metaResult.rows as any[])[0]?.meta_mensual || 15;

    const margenMensual = totalRevenue > 0 ? Math.round(((totalRevenue - totalCosto) / totalRevenue) * 100) : 0;
    const margenMensualPct = metaMargen > 0 ? Math.round((margenMensual / metaMargen) * 100) : 0;

    const sellerSemanas = semanasData.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      const margenActual = sem.revenue > 0 ? ((sem.revenue - sem.costo) / sem.revenue) * 100 : null;
      const margen = margenActual !== null && metaMargen > 0 ? Math.round((margenActual / metaMargen) * 100) : null;
      return {
        numero: i + 1,
        revenue: Math.round(sem.revenue * 100) / 100,
        costo: Math.round(sem.costo * 100) / 100,
        margen: esFuturo ? null : margen,
      };
    });

    const productsResult = Object.values(productDataMap).map((prod) => ({
      ...prod,
      ganancia: Math.round((prod.revenue - prod.costo) * 100) / 100,
      margen: prod.revenue > 0 ? Math.round(((prod.revenue - prod.costo) / prod.revenue) * 100) : 0,
    })).sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        totalDiasUtilesMes: contarDiasUtiles(new Date(anio, mesNum - 1, 1), new Date(anio, mesNum, 0)),
        sellers: [{
          nombre: sellers[0].name,
          revenue: Math.round(totalRevenue * 100) / 100,
          costo: Math.round(totalCosto * 100) / 100,
          margenMensual,
          margenMensualPct,
          semanas: sellerSemanas,
        }],
        products: productsResult,
      },
    });
  } catch (error: any) {
    console.error("Error en API margen-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
