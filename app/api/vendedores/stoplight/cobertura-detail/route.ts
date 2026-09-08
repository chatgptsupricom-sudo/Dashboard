import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
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
    const periodoParam = url.searchParams.get("periodo") || "mes";
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    let fechaInicio: string;
    let fechaFin: string;
    let periodoLabel: string;

    if (periodoParam === "trimestre") {
      const trimestre = Math.ceil(mesNum / 3);
      const mesInicioTrimestre = (trimestre - 1) * 3 + 1;
      fechaInicio = `${anio}-${String(mesInicioTrimestre).padStart(2, "0")}-01`;
      const ultimoDiaTrimestre = new Date(anio, mesInicioTrimestre + 2, 0).getDate();
      fechaFin = `${anio}-${String(mesInicioTrimestre + 2).padStart(2, "0")}-${ultimoDiaTrimestre}`;
      periodoLabel = `Trimestre ${trimestre} ${anio}`;
    } else if (periodoParam === "anio") {
      fechaInicio = `${anio}-01-01`;
      fechaFin = `${anio}-12-31`;
      periodoLabel = `Año ${anio}`;
    } else if (periodoParam === "todo") {
      fechaInicio = "2000-01-01";
      fechaFin = "2099-12-31";
      periodoLabel = "Todo el tiempo";
    } else {
      fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mesNum, 0).getDate();
      fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;
      periodoLabel = `${new Date(anio, mesNum - 1, 1).toLocaleString("es-VE", { month: "long" })} ${anio}`;
    }

    const semanas = (() => {
      const result: { inicio: Date; fin: Date; label: string }[] = [];
      const fechaFinDate = new Date(fechaFin);
      let inicio = new Date(fechaInicio);
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      while (inicio <= fechaFinDate) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > fechaFinDate) fin = new Date(fechaFinDate);
        result.push({
          inicio: new Date(inicio),
          fin: new Date(fin),
          label: `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`,
        });
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
      return NextResponse.json({ success: true, data: { mes, periodo: periodoParam, periodoLabel, sellers: [], marcas: [] } });
    }
    const sellerName = sellers[0].name;

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
      { fields: ["id", "invoice_date", "move_type"], limit: 50000 }
    );

    const invoiceIds = (invoices || []).map((inv: any) => inv.id);
    const invMap: Record<number, any> = {};
    (invoices || []).forEach((inv: any) => { invMap[inv.id] = inv; });

    let lines: any[] = [];
    if (invoiceIds.length > 0) {
      lines = (await callOdooRPC<any[]>(
        "account.move.line", "search_read",
        [[["move_id", "in", invoiceIds], ["display_type", "=", "product"], ["product_id", "!=", false]]],
        { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 }
      )) || [];
    }

    // Producto -> marca (spiff_brand_id de product.template) + costo unitario.
    // Antes esto mapeaba producto -> NOMBRE del producto y lo trataba como
    // "marca", así que la tabla mostraba productos en vez de marcas.
    const productIds = [...new Set(lines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
    const productBrandMap: Record<number, string> = {};
    const productCostMap: Record<number, number> = {};

    if (productIds.length > 0) {
      const variants = (await callOdooRPC<any[]>(
        "product.product", "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        { fields: ["id", "product_tmpl_id"], limit: 0 }
      )) || [];
      const varToTmpl: Record<number, number> = {};
      variants.forEach((v: any) => { if (v.product_tmpl_id?.[0]) varToTmpl[v.id] = v.product_tmpl_id[0]; });

      const tmplIds = [...new Set(variants.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
      const tmplBrand: Record<number, string> = {};
      const tmplCost: Record<number, number> = {};
      if (tmplIds.length > 0) {
        const templates = (await callOdooRPC<any[]>(
          "product.template", "search_read",
          [[["id", "in", tmplIds]]],
          { fields: ["id", "spiff_brand_id", "standard_price"], limit: 0 }
        )) || [];
        templates.forEach((t: any) => {
          tmplBrand[t.id] = t.spiff_brand_id?.[1] || "Sin marca";
          tmplCost[t.id] = Number(t.standard_price) || 0;
        });
      }
      productIds.forEach((pid: number) => {
        const tid = varToTmpl[pid];
        productBrandMap[pid] = tid ? (tmplBrand[tid] || "Sin marca") : "Sin marca";
        productCostMap[pid] = tid ? (tmplCost[tid] || 0) : 0;
      });
    }

    interface BrandData {
      revenue: number;
      costo: number;
      cantidad: number;
      productos: Set<number>;
      semanas: { revenue: number; costo: number; cantidad: number }[];
    }
    const brandMap: Record<string, BrandData> = {};

    lines.forEach((line: any) => {
      const moveId = line.move_id?.[0];
      const inv = invMap[moveId];
      if (!inv) return;
      const productId = line.product_id?.[0];
      if (!productId) return;

      const qty = Math.abs(Number(line.quantity) || 0);
      const revenue = Math.abs(Number(line.price_subtotal) || 0);
      const unitCost = productCostMap[productId] || 0;
      const costo = qty * unitCost;

      const isRefund = inv.move_type === "out_refund";
      const rFinal = isRefund ? -revenue : revenue;
      const cFinal = isRefund ? -costo : costo;

      const brand = productBrandMap[productId] || "Sin marca";
      if (!brandMap[brand]) {
        brandMap[brand] = { revenue: 0, costo: 0, cantidad: 0, productos: new Set(), semanas: semanas.map(() => ({ revenue: 0, costo: 0, cantidad: 0 })) };
      }
      brandMap[brand].revenue += rFinal;
      brandMap[brand].costo += cFinal;
      brandMap[brand].cantidad += qty;
      brandMap[brand].productos.add(productId);

      const invDate = new Date(inv.invoice_date);
      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          brandMap[brand].semanas[i].revenue += rFinal;
          brandMap[brand].semanas[i].costo += cFinal;
          brandMap[brand].semanas[i].cantidad += qty;
          break;
        }
      }
    });

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["cobertura_marcas", companyId, mes]
    );
    const metaCantidad = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    const marcas = Object.entries(brandMap).map(([marca, data]) => {
      const ganancia = Math.round((data.revenue - data.costo) * 100) / 100;
      const margen = data.revenue > 0 ? Math.round(((data.revenue - data.costo) / data.revenue) * 100) : 0;
      const semanasCalc = data.semanas.map((sem, i) => {
        const esFuturo = semanas[i].inicio > now;
        const cantidadPct = metaCantidad > 0 ? Math.round((sem.cantidad / metaCantidad) * 100) : null;
        return {
          numero: i + 1,
          label: semanas[i].label,
          revenue: Math.round(sem.revenue * 100) / 100,
          costo: Math.round(sem.costo * 100) / 100,
          ganancia: Math.round((sem.revenue - sem.costo) * 100) / 100,
          cantidad: Math.round(sem.cantidad * 100) / 100,
          cantidadPct: esFuturo ? null : cantidadPct,
        };
      });
      return {
        marca,
        revenue: Math.round(data.revenue * 100) / 100,
        costo: Math.round(data.costo * 100) / 100,
        ganancia,
        cantidad: Math.round(data.cantidad * 100) / 100,
        margen,
        productosVendidos: data.productos.size,
        vendedores: 1,
        vendedoresLista: [sellerName],
        semanas: semanasCalc,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const globalRevenue = marcas.reduce((s, b) => s + b.revenue, 0);
    const globalCosto = marcas.reduce((s, b) => s + b.costo, 0);
    const globalCantidad = marcas.reduce((s, b) => s + b.cantidad, 0);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        periodo: periodoParam,
        periodoLabel,
        fechaInicio,
        fechaFin,
        global: {
          totalMarcas: marcas.length,
          revenue: Math.round(globalRevenue * 100) / 100,
          costo: Math.round(globalCosto * 100) / 100,
          margen: globalRevenue > 0 ? Math.round(((globalRevenue - globalCosto) / globalRevenue) * 100) : 0,
          cantidad: Math.round(globalCantidad * 100) / 100,
          cantidadPct: metaCantidad > 0 ? Math.round((globalCantidad / metaCantidad) * 100) : 0,
          totalProductos: marcas.reduce((s, b) => s + b.productosVendidos, 0),
          totalVendedores: 1,
        },
        sellers: [{
          nombre: sellerName,
          sellerId: sellers[0].seller_id,
          cantidadVendida: Math.round(globalCantidad * 100) / 100,
          metaCantidad,
        }],
        marcas,
      },
    });
  } catch (error: any) {
    console.error("Error en API cobertura-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
