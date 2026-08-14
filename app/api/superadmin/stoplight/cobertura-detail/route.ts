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
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);

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
      periodoLabel = `${now.toLocaleString("es-VE", { month: "long" })} ${anio}`;
    }

    const semanas = (() => {
      const result: { inicio: Date; fin: Date; diasUtiles: number; label: string }[] = [];
      const fechaInicioDate = new Date(fechaInicio);
      const fechaFinDate = new Date(fechaFin);
      let inicio = new Date(fechaInicioDate);

      while (inicio <= fechaFinDate) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > fechaFinDate) fin = new Date(fechaFinDate);
        
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        const label = `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`;
        
        result.push({
          inicio: new Date(inicio),
          fin: new Date(fin),
          diasUtiles: contarDiasUtiles(inicio, fin),
          label,
        });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    // 1. Fetch invoices for the period
    const invoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
          ["invoice_date", ">=", fechaInicio],
          ["invoice_date", "<=", fechaFin],
        ],
      ],
      {
        fields: ["id", "invoice_user_id", "invoice_date", "move_type"],
        limit: 50000,
      }
    );

    // 2. Fetch invoice lines
    const invoiceIds = (invoices || []).map((inv: any) => inv.id);
    let invoiceLines: any[] = [];
    if (invoiceIds.length > 0) {
      invoiceLines = (await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [
          [
            ["move_id", "in", invoiceIds],
            ["display_type", "=", "product"],
            ["product_id", "!=", false],
          ],
        ],
        {
          fields: ["move_id", "product_id", "quantity", "price_subtotal"],
          limit: 50000,
        }
      )) || [];
    }

    // 3. Fetch product details and brands
    const productIds = [...new Set(invoiceLines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
    const productBrandMap: Record<number, string> = {};
    const productNameMap: Record<number, string> = {};
    const productCostMap: Record<number, number> = {};

    if (productIds.length > 0) {
      const variants = (await callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        { fields: ["id", "name", "product_tmpl_id"], limit: 0 }
      )) || [];

      variants.forEach((v: any) => {
        productNameMap[v.id] = v.name || "Sin nombre";
      });

      const variantToTmpl: Record<number, number> = {};
      variants.forEach((v: any) => {
        if (v.id && v.product_tmpl_id?.[0]) variantToTmpl[v.id] = v.product_tmpl_id[0];
      });

      const tmplIds = [...new Set(variants.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];

      if (tmplIds.length > 0) {
        // First try to get brand from product.template
        const templates = (await callOdooRPC<any[]>(
          "product.template",
          "search_read",
          [[["id", "in", tmplIds]]],
          { fields: ["id", "name", "spiff_brand_id", "standard_price"], limit: 0 }
        )) || [];

        const tmplBrandMap: Record<number, string> = {};
        const tmplCostMap: Record<number, number> = {};
        templates.forEach((t: any) => {
          const brandName = t.spiff_brand_id?.[1] || null;
          tmplBrandMap[t.id] = brandName || "Sin marca";
          tmplCostMap[t.id] = Number(t.standard_price) || 0;
        });

        productIds.forEach((pid: number) => {
          const tid = variantToTmpl[pid];
          if (tid) {
            productBrandMap[pid] = tmplBrandMap[tid] || "Sin marca";
            productCostMap[pid] = tmplCostMap[tid] || 0;
          } else {
            productBrandMap[pid] = "Sin marca";
          }
        });
      }
    }

    // 4. Build invoice lookup
    const invoiceMap: Record<number, any> = {};
    (invoices || []).forEach((inv: any) => {
      invoiceMap[inv.id] = inv;
    });

    // 5. Process by brand
    interface BrandData {
      marca: string;
      revenue: number;
      costo: number;
      cantidad: number;
      productos: Set<number>;
      vendedores: Set<string>;
      semanas: { revenue: number; costo: number; cantidad: number }[];
    }

    const brandMap: Record<string, BrandData> = {};

    (invoiceLines || []).forEach((line: any) => {
      const moveId = line.move_id?.[0];
      const inv = invoiceMap[moveId];
      if (!inv) return;

      const productId = line.product_id?.[0];
      if (!productId) return;

      const brand = productBrandMap[productId] || "Sin marca";
      const qty = Math.abs(Number(line.quantity) || 0);
      const revenue = Math.abs(Number(line.price_subtotal) || 0);
      const unitCost = productCostMap[productId] || 0;
      const costo = qty * unitCost;

      const isRefund = inv.move_type === "out_refund";
      const revenueFinal = isRefund ? -revenue : revenue;
      const costoFinal = isRefund ? -costo : costo;

      if (!brandMap[brand]) {
        brandMap[brand] = {
          marca: brand,
          revenue: 0,
          costo: 0,
          cantidad: 0,
          productos: new Set(),
          vendedores: new Set(),
          semanas: semanas.map(() => ({ revenue: 0, costo: 0, cantidad: 0 })),
        };
      }

      brandMap[brand].revenue += revenueFinal;
      brandMap[brand].costo += costoFinal;
      brandMap[brand].cantidad += qty;
      brandMap[brand].productos.add(productId);

      const sellerName = inv.invoice_user_id?.[1];
      if (sellerName) brandMap[brand].vendedores.add(sellerName);

      // Distribute by week
      const invDate = new Date(inv.invoice_date);
      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          brandMap[brand].semanas[i].revenue += revenueFinal;
          brandMap[brand].semanas[i].costo += costoFinal;
          brandMap[brand].semanas[i].cantidad += qty;
          break;
        }
      }
    });

    // 6. Load meta (cantidad vendida total como meta)
    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["cobertura_marcas", companyId, mes]
    );
    const metaCantidad = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    // 7. Build response
    const result = Object.values(brandMap).map((brand) => {
      const ganancia = Math.round((brand.revenue - brand.costo) * 100) / 100;

      const semanasCalc = brand.semanas.map((sem, i) => {
        const semanaInicio = semanas[i].inicio;
        const esFuturo = semanaInicio > new Date();
        const gananciaSem = Math.round((sem.revenue - sem.costo) * 100) / 100;
        const cantidadPct = metaCantidad > 0 ? Math.round((sem.cantidad / metaCantidad) * 100) : null;
        return {
          numero: i + 1,
          label: semanas[i].label,
          revenue: Math.round(sem.revenue * 100) / 100,
          costo: Math.round(sem.costo * 100) / 100,
          ganancia: gananciaSem,
          cantidad: Math.round(sem.cantidad * 100) / 100,
          cantidadPct: esFuturo ? null : cantidadPct,
        };
      });

      return {
        marca: brand.marca,
        revenue: Math.round(brand.revenue * 100) / 100,
        costo: Math.round(brand.costo * 100) / 100,
        ganancia,
        cantidad: Math.round(brand.cantidad * 100) / 100,
        productosVendidos: brand.productos.size,
        vendedores: brand.vendedores.size,
        vendedoresLista: [...brand.vendedores],
        semanas: semanasCalc,
      };
    });

    result.sort((a, b) => b.revenue - a.revenue);

    // 8. Global totals
    const globalRevenue = result.reduce((sum, b) => sum + b.revenue, 0);
    const globalCosto = result.reduce((sum, b) => sum + b.costo, 0);
    const globalMargen = globalRevenue > 0 ? Math.round(((globalRevenue - globalCosto) / globalRevenue) * 100) : 0;
    const globalCantidad = result.reduce((sum, b) => sum + b.cantidad, 0);
    const globalProductos = result.reduce((sum, b) => sum + b.productosVendidos, 0);
    const allVendedores = new Set<string>();
    result.forEach(b => b.vendedoresLista.forEach(v => allVendedores.add(v)));
    const globalCantidadPct = metaCantidad > 0 ? Math.round((globalCantidad / metaCantidad) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        mes,
        periodo: periodoParam,
        periodoLabel,
        fechaInicio,
        fechaFin,
        global: {
          totalMarcas: result.length,
          revenue: Math.round(globalRevenue * 100) / 100,
          costo: Math.round(globalCosto * 100) / 100,
          margen: globalMargen,
          cantidad: Math.round(globalCantidad * 100) / 100,
          cantidadPct: globalCantidadPct,
          totalProductos: globalProductos,
          totalVendedores: allVendedores.size,
        },
        marcas: result,
      },
    });
  } catch (error: any) {
    console.error("Error en API cobertura-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
