import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaParaBI, terminosSinIC } from "@/lib/intercompania";
import { resolverCompanies } from "@/lib/adminleads/rotacion";

async function leerGET(request: NextRequest) {
  // El Diseñador usa este mismo dashboard en /disenador/dashboard: ve las
  // ventas de su sucursal (cids) igual que AdminLeads. Inteligencia de
  // Negocio (y el SuperAdmin) eligen sede con `?sede=` (resolverCompanies).
  const auth = await requireRoles(request, ["adminleads", "diseñador", ROL_BI]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companies = resolverCompanies(auth.payload!, searchParams.get("sede"));
    if (!companies)
      return NextResponse.json({ success: false, brands: [], categories: [] }, { status: 403 });
    const companyFilter = ["company_id", "in", companies];

    // `desde`/`hasta` (YYYY-MM-DD) tienen prioridad; si no vienen, se cae al
    // viejo `months` (rango de los últimos N meses) para no romper llamadas
    // existentes.
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    const now = new Date();

    let startDate: string;
    let endDate: string;
    if (desdeParam && dateRegex.test(desdeParam)) {
      startDate = desdeParam;
      endDate = hastaParam && dateRegex.test(hastaParam) ? hastaParam : now.toISOString().split("T")[0];
    } else {
      const months = parseInt(searchParams.get("months") || "3", 10);
      startDate = new Date(now.getFullYear(), now.getMonth() - months, 1)
        .toISOString()
        .split("T")[0];
      endDate = now.toISOString().split("T")[0];
    }
    // No al revés: evita un rango invertido si cargan mal las fechas.
    if (startDate > endDate) [startDate, endDate] = [endDate, startDate];

    // Fetch invoice lines with product details. Las notas de crédito se leen
    // aparte y restan unidades; display_type = 'product' deja fuera las
    // líneas de costo, que repiten producto y cantidad (unidades ×3).
    const leerLineas = (tipo: string) => callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [
        [
          ["move_id.move_type", "=", tipo],
          ["display_type", "=", "product"],
          ["move_id.state", "=", "posted"],
          ["move_id.invoice_date", ">=", startDate],
          ["move_id.invoice_date", "<=", endDate],
          ["product_id", "!=", false],
          ["quantity", ">", 0],
          // Clientes internos / inter-compañía: sin esto, "SUPRICOM CCS 21, C.A."
          // por sí sola aporta más de $1.6M en 90 días a Valencia y distorsiona
          // por completo el ranking de marcas más vendidas (mismo criterio que
          // lib/reportes-comerciales/reporteTrimestral.ts y reporte-diario).
          ["partner_id.name", "not ilike", "supricom"],
          ["partner_id.name", "not ilike", "office solution"],
          ...terminosSinIC("move_id.commercial_partner_id"),
          companyFilter,
        ],
      ],
      {
        fields: ["product_id", "quantity", "balance"],
        limit: 50000,
      },
    );
    const [facturas, notas] = await Promise.all([leerLineas("out_invoice"), leerLineas("out_refund")]);
    // Monto = −balance: USD de la empresa sin IVA, positivo en la factura y
    // negativo en la nota de crédito (Caracas tiene documentos en bolívares).
    const lines = [
      ...(facturas || []),
      ...(notas || []).map((l: any) => ({ ...l, quantity: -(Number(l.quantity) || 0) })),
    ].map((l: any) => ({ ...l, monto: -(Number(l.balance) || 0) }));

    if (lines.length === 0) {
      return NextResponse.json({
        success: true,
        brands: [],
        categories: [],
        period: { startDate, endDate },
      });
    }

    // Fetch product details to get brand and category
    const productIds = [...new Set(lines.map((l: any) => l.product_id?.[0]).filter(Boolean))];

    // Process in batches of 100
    const productMap = new Map<number, { brand: string; category: string; name: string; code: string }>();
    for (let i = 0; i < productIds.length; i += 100) {
      const batch = productIds.slice(i, i + 100);
      const products = await callOdooRPC<any[]>(
        "product.product",
        "read",
        [batch],
        {
          fields: ["name", "default_code", "x_studio_marca", "categ_id"],
        },
      );
      for (const p of products || []) {
        productMap.set(p.id, {
          brand: Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : (p.x_studio_marca || "Sin marca"),
          category: Array.isArray(p.categ_id) ? p.categ_id[1] : "Sin categoría",
          name: p.name || "",
          code: p.default_code || "",
        });
      }
    }

    // Por marca y por categoría, en unidades y monto, con sus productos (y, en
    // la categoría, sus marcas). La pantalla elige la medida y ordena.
    type Suma = { qty: number; monto: number };
    type Grupo = Suma & { products: Map<string, Suma & { name: string; code: string }>; brands: Map<string, Suma> };
    const nuevoGrupo = (): Grupo => ({ qty: 0, monto: 0, products: new Map(), brands: new Map() });
    const sumar = (s: Suma, qty: number, monto: number) => {
      s.qty += qty;
      s.monto += monto;
    };
    const brandMap = new Map<string, Grupo>();
    const categoryMap = new Map<string, Grupo>();

    for (const line of lines) {
      const pid = line.product_id?.[0];
      if (!pid) continue;
      const info = productMap.get(pid);
      if (!info) continue;
      const qty = Number(line.quantity) || 0;
      const monto = line.monto;
      if (qty === 0 && monto === 0) continue;

      const productKey = info.code || info.name;
      for (const [mapa, clave] of [[brandMap, info.brand], [categoryMap, info.category]] as const) {
        if (!mapa.has(clave)) mapa.set(clave, nuevoGrupo());
        const g = mapa.get(clave)!;
        sumar(g, qty, monto);
        if (!g.products.has(productKey)) g.products.set(productKey, { qty: 0, monto: 0, name: info.name, code: info.code });
        sumar(g.products.get(productKey)!, qty, monto);
        if (mapa === categoryMap) {
          if (!g.brands.has(info.brand)) g.brands.set(info.brand, { qty: 0, monto: 0 });
          sumar(g.brands.get(info.brand)!, qty, monto);
        }
      }
    }

    // Lo devuelto entero (neto ≤ 0 en las dos medidas) no entra en los rankings.
    const positivo = (s: Suma) => s.qty > 0 || s.monto > 0;
    const redondear = (s: Suma) => ({ qty: s.qty, monto: Math.round(s.monto * 100) / 100 });
    // Los productos que más venden en cualquiera de las dos medidas.
    const mejores = <T extends Suma>(mapa: Map<string, T>, n: number) => {
      const lista = [...mapa.values()].filter(positivo);
      const top = new Set([
        ...[...lista].sort((a, b) => b.qty - a.qty).slice(0, n),
        ...[...lista].sort((a, b) => b.monto - a.monto).slice(0, n),
      ]);
      return [...top];
    };
    const productos = (g: Grupo) =>
      mejores(g.products, 10).map((p) => ({ code: p.code, name: p.name, ...redondear(p) }));

    const brands = [...brandMap.entries()]
      .filter(([, g]) => positivo(g))
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([name, g]) => ({ name, ...redondear(g), products: productos(g) }));

    const categories = [...categoryMap.entries()]
      .filter(([, g]) => positivo(g))
      .sort((a, b) => b[1].qty - a[1].qty)
      .map(([name, g]) => ({
        name,
        ...redondear(g),
        products: productos(g),
        brands: [...g.brands.entries()]
          .filter(([, b]) => positivo(b))
          .map(([marca, b]) => ({ name: marca, ...redondear(b) })),
      }));

    return NextResponse.json({
      success: true,
      brands,
      categories,
      period: { startDate, endDate },
    });
  } catch (error: any) {
    console.error("GET /api/adminleads/product-stats error:", error.message);
    return NextResponse.json({ success: false, brands: [], categories: [] }, { status: 500 });
  }
}

// Inteligencia de Negocio no ve intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);
