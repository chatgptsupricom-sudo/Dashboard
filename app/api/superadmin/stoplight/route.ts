import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const COMPANY_MAP: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

const KPI_NAMES = [
  "cumplimiento_cuota",
  "margen_bruto",
  "visitas_semanales",
  "efectividad_cierre",
  "activacion_cartera",
  "clientes_nuevos",
  "cobertura_marcas",
];

function getMonthRange(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return {
    firstDay: first.toISOString().split("T")[0],
    lastDay: last.toISOString().split("T")[0],
    totalDays: last.getDate(),
  };
}

function getWeeksOfMonth(year: number, month: number) {
  const weeks: { start: string; end: string; label: string }[] = [];
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  let weekStart = new Date(first);
  let weekNum = 1;
  while (weekStart <= last) {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    if (weekEnd > last) weekEnd.setTime(last.getTime());
    weeks.push({
      start: weekStart.toISOString().split("T")[0],
      end: weekEnd.toISOString().split("T")[0],
      label: `Sem ${weekNum}`,
    });
    weekStart.setDate(weekStart.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

function isVenezuelanHoliday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const holidays: Record<string, boolean> = {
    "01-01": true,
    "01-06": true,
    "05-01": true,
    "06-24": true,
    "07-05": true,
    "07-24": true,
    "10-12": true,
    "12-24": true,
    "12-25": true,
    "12-31": true,
  };
  const key = `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (holidays[key]) return true;
  const year = d.getFullYear();
  const easter = getEasterDate(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(goodFriday.getDate() - 2);
  const carnival1 = new Date(easter);
  carnival1.setDate(carnival1.getDate() - 48);
  const carnival2 = new Date(easter);
  carnival2.setDate(carnival2.getDate() - 47);
  const ascension = new Date(easter);
  ascension.setDate(ascension.getDate() + 39);
  const corpus = new Date(easter);
  corpus.setDate(corpus.getDate() + 60);
  const movingHolidays = [goodFriday, carnival1, carnival2, ascension, corpus];
  for (const mh of movingHolidays) {
    if (
      mh.getFullYear() === year &&
      mh.getMonth() + 1 === m &&
      mh.getDate() === day
    )
      return true;
  }
  return false;
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function countBusinessDays(year: number, month: number): number {
  const { firstDay, lastDay } = getMonthRange(year, month);
  let count = 0;
  const d = new Date(firstDay + "T00:00:00");
  const end = new Date(lastDay + "T00:00:00");
  while (d <= end) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6 && !isVenezuelanHoliday(d.toISOString().split("T")[0])) {
      count++;
    }
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const companyId = parseInt(searchParams.get("company_id") || "9");
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

    const { firstDay, lastDay } = getMonthRange(year, month);
    const weeks = getWeeksOfMonth(year, month);
    const businessDays = countBusinessDays(year, month);
    const totalWeeks = weeks.length;

    const [metasResult]: any = await db.query(
      "SELECT kpi_name, meta_value FROM stoplight_kpis WHERE company_id = ? AND year = ? AND month = ?",
      [companyId, year, month]
    );
    const metas: Record<string, number> = {};
    (metasResult || []).forEach((r: any) => {
      metas[r.kpi_name] = Number(r.meta_value);
    });

    const invoicesDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["invoice_date", ">=", firstDay],
      ["invoice_date", "<=", lastDay],
      ["company_id", "=", companyId],
    ];
    const allInvoices = (await callOdooRPC<any[]>("account.move", "search_read", [invoicesDomain], {
      fields: ["amount_untaxed", "invoice_user_id", "invoice_date", "company_id", "move_type"],
      limit: 5000,
    })) || [];

    let totalFacturado = 0;
    allInvoices.forEach((inv: any) => {
      const amt = inv.move_type === "out_refund" ? -(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0);
      totalFacturado += amt;
    });

    const cuotaResult: any = await db.query(
      "SELECT c.seller_id, c.cuota FROM cuota c INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date"
    );
    const cuotaRows = cuotaResult || [];
    const sellerResult: any = await db.query(
      "SELECT id, name, user_id, cids FROM sellers WHERE cids = ?",
      [companyId]
    );
    const sellers = sellerResult || [];
    const totalCuota = sellers.reduce((sum: number, s: any) => {
      const cuotaVal = cuotaRows.find((c: any) => c.seller_id === s.id)?.cuota || 0;
      return sum + Number(cuotaVal);
    }, 0);

    const metaCuota = metas["cumplimiento_cuota"] || 0;
    const actualCuotaPct = metaCuota > 0 ? (totalFacturado / metaCuota) * 100 : 0;

    let margenBruto = 0;
    let margenBrutoPct = 0;
    try {
      const productIds = new Set<number>();
      const linesDomain: any[] = [
        ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
        ["move_id.state", "=", "posted"],
        ["move_id.invoice_date", ">=", firstDay],
        ["move_id.invoice_date", "<=", lastDay],
        ["move_id.company_id", "=", companyId],
        ["product_id", "!=", false],
      ];
      let lines: any[] = [];
      let offset = 0;
      while (true) {
        const page = await callOdooRPC<any[]>("account.move.line", "search_read", [linesDomain], {
          fields: ["product_id", "price_subtotal", "quantity"],
          limit: 5000,
          offset,
        });
        if (!page || page.length === 0) break;
        lines = lines.concat(page);
        if (page.length < 5000) break;
        offset += 5000;
      }
      lines.forEach((l: any) => {
        if (l.product_id) productIds.add(l.product_id[0]);
      });
      const prodIds = [...productIds];
      let costMap: Record<number, number> = {};
      if (prodIds.length > 0) {
        const prods = await callOdooRPC<any[]>("product.product", "search_read", [
          [["id", "in", prodIds]],
        ], { fields: ["id", "standard_price"], limit: 0 });
        (prods || []).forEach((p: any) => {
          costMap[p.id] = Number(p.standard_price) || 0;
        });
      }
      let totalVentas = 0;
      let totalCosto = 0;
      lines.forEach((l: any) => {
        const qty = l.quantity || 0;
        const subtotal = l.price_subtotal || 0;
        const cost = costMap[l.product_id?.[0]] || 0;
        totalVentas += subtotal;
        totalCosto += cost * qty;
      });
      margenBruto = totalVentas - totalCosto;
      margenBrutoPct = totalVentas > 0 ? (margenBruto / totalVentas) * 100 : 0;
    } catch (_) {}

    let leadsTotales = 0;
    let leadsCerrados = 0;
    let clientesNuevos = 0;
    try {
      const leadsDomain: any[] = [
        ["create_date", ">=", firstDay],
        ["create_date", "<=", lastDay + " 23:59:59"],
      ];
      const leads = (await callOdooRPC<any[]>("crm.lead", "search_read", [leadsDomain], {
        fields: ["id", "stage_id", "partner_id", "company_id"],
        limit: 5000,
      })) || [];
      const filteredLeads = companyId ? leads.filter((l: any) => !l.company_id || l.company_id[0] === companyId) : leads;
      leadsTotales = filteredLeads.length;
      leadsCerrados = filteredLeads.filter((l: any) =>
        l.stage_id && (l.stage_id[1]?.toLowerCase().includes("ganado") || l.stage_id[1]?.toLowerCase().includes("won") || l.stage_id[1]?.toLowerCase().includes("cerrado"))
      ).length;

      const partnersDomain: any[] = [
        ["create_date", ">=", firstDay],
        ["create_date", "<=", lastDay + " 23:59:59"],
        ["is_company", "=", false],
      ];
      const partners = (await callOdooRPC<any[]>("res.partner", "search_read", [partnersDomain], {
        fields: ["id", "company_id"],
        limit: 5000,
      })) || [];
      clientesNuevos = companyId ? partners.filter((p: any) => !p.company_id || p.company_id[0] === companyId).length : partners.length;
    } catch (_) {}

    let totalBrands = 0;
    let brandsSold = 0;
    try {
      const brandDomain: any[] = [
        ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
        ["move_id.state", "=", "posted"],
        ["move_id.invoice_date", ">=", firstDay],
        ["move_id.invoice_date", "<=", lastDay],
        ["move_id.company_id", "=", companyId],
        ["product_id", "!=", false],
      ];
      const brandLines = (await callOdooRPC<any[]>("account.move.line", "search_read", [brandDomain], {
        fields: ["product_id"],
        limit: 5000,
      })) || [];
      const brandProdIds = [...new Set(brandLines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
      if (brandProdIds.length > 0) {
        const bprods = await callOdooRPC<any[]>("product.product", "search_read", [
          [["id", "in", brandProdIds]],
        ], { fields: ["id", "x_studio_marca"], limit: 0 });
        const soldBrands = new Set<string>();
        (bprods || []).forEach((p: any) => {
          const marca = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca;
          if (marca) soldBrands.add(marca.toUpperCase().trim());
        });
        brandsSold = soldBrands.size;
      }
      const allBrands = await callOdooRPC<any[]>("product.product", "search_read", [
        [["active", "=", true], ["sale_ok", "=", true], ["company_id", "in", [companyId, false]]],
      ], { fields: ["id", "x_studio_marca"], limit: 0 });
      const allBrandSet = new Set<string>();
      (allBrands || []).forEach((p: any) => {
        const marca = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca;
        if (marca) allBrandSet.add(marca.toUpperCase().trim());
      });
      totalBrands = allBrandSet.size;
    } catch (_) {}

    let visitasSemanales = 0;
    try {
      const actDomain: any[] = [
        ["date_start", ">=", firstDay],
        ["date_start", "<=", lastDay + " 23:59:59"],
      ];
      const activities = (await callOdooRPC<any[]>("crm.activity.report", "search_read", [actDomain], {
        fields: ["id"],
        limit: 10000,
      })) || [];
      visitasSemanales = totalWeeks > 0 ? Math.round(activities.length / totalWeeks) : 0;
    } catch (_) {}

    const activateCarteraPct = 0;

    const kpiData = [
      {
        id: "cumplimiento_cuota",
        nombre: "Cumplimiento de cuota de ventas",
        peso: 30,
        meta: metaCuota,
        actual: totalFacturado,
        porcentaje: Math.min(actualCuotaPct, 100),
        cumple: actualCuotaPct >= 100,
        detalle: `Facturado: $${totalFacturado.toLocaleString()} / Meta: $${metaCuota.toLocaleString()}`,
      },
      {
        id: "margen_bruto",
        nombre: "Margen bruto",
        peso: 15,
        meta: metas["margen_bruto"] || 0,
        actual: margenBrutoPct,
        porcentaje: metas["margen_bruto"] > 0 ? Math.min((margenBrutoPct / metas["margen_bruto"]) * 100, 100) : 0,
        cumple: margenBrutoPct >= (metas["margen_bruto"] || 0),
        detalle: `Margen: ${margenBrutoPct.toFixed(1)}%`,
      },
      {
        id: "visitas_semanales",
        nombre: "Cantidad de visitas semanales",
        peso: 10,
        meta: metas["visitas_semanales"] || 0,
        actual: visitasSemanales,
        porcentaje: metas["visitas_semanales"] > 0 ? Math.min((visitasSemanales / metas["visitas_semanales"]) * 100, 100) : 0,
        cumple: visitasSemanales >= (metas["visitas_semanales"] || 0),
        detalle: `${visitasSemanales} visitas/semana`,
      },
      {
        id: "efectividad_cierre",
        nombre: "Tasa de efectividad de cierre",
        peso: 15,
        meta: metas["efectividad_cierre"] || 0,
        actual: leadsTotales > 0 ? (leadsCerrados / leadsTotales) * 100 : 0,
        porcentaje: metas["efectividad_cierre"] > 0 ? Math.min(((leadsTotales > 0 ? (leadsCerrados / leadsTotales) * 100 : 0) / metas["efectividad_cierre"]) * 100, 100) : 0,
        cumple: (leadsTotales > 0 ? (leadsCerrados / leadsTotales) * 100 : 0) >= (metas["efectividad_cierre"] || 0),
        detalle: `${leadsCerrados}/${leadsTotales} leads cerrados`,
      },
      {
        id: "activacion_cartera",
        nombre: "Porcentaje de activación de cartera",
        peso: 15,
        meta: metas["activacion_cartera"] || 0,
        actual: activateCarteraPct,
        porcentaje: metas["activacion_cartera"] > 0 ? Math.min((activateCarteraPct / metas["activacion_cartera"]) * 100, 100) : 0,
        cumple: activateCarteraPct >= (metas["activacion_cartera"] || 0),
        detalle: `${activateCarteraPct.toFixed(1)}% cartera activa`,
      },
      {
        id: "clientes_nuevos",
        nombre: "Clientes nuevos captados",
        peso: 5,
        meta: metas["clientes_nuevos"] || 0,
        actual: clientesNuevos,
        porcentaje: metas["clientes_nuevos"] > 0 ? Math.min((clientesNuevos / metas["clientes_nuevos"]) * 100, 100) : 0,
        cumple: clientesNuevos >= (metas["clientes_nuevos"] || 0),
        detalle: `${clientesNuevos} clientes nuevos`,
      },
      {
        id: "cobertura_marcas",
        nombre: "Cobertura de marcas",
        peso: 10,
        meta: metas["cobertura_marcas"] || 0,
        actual: totalBrands > 0 ? (brandsSold / totalBrands) * 100 : 0,
        porcentaje: metas["cobertura_marcas"] > 0 ? Math.min(((totalBrands > 0 ? (brandsSold / totalBrands) * 100 : 0) / metas["cobertura_marcas"]) * 100, 100) : 0,
        cumple: (totalBrands > 0 ? (brandsSold / totalBrands) * 100 : 0) >= (metas["cobertura_marcas"] || 0),
        detalle: `${brandsSold}/${totalBrands} marcas`,
      },
    ];

    const scoreGeneral = kpiData.reduce((sum, k) => sum + (k.porcentaje * k.peso) / 100, 0);

    return NextResponse.json({
      kpis: kpiData,
      scoreGeneral: Math.round(scoreGeneral * 10) / 10,
      weeks,
      businessDays,
      totalWeeks,
      company_id: companyId,
      year,
      month,
      metaCuota,
      totalFacturado,
    });
  } catch (error: any) {
    console.error("Error en API stoplight:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const body = await request.json();
    const { company_id, year, month, kpis } = body;

    if (!company_id || !year || !month || !kpis) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    for (const kpi of kpis) {
      await db.query(
        `INSERT INTO stoplight_kpis (company_id, year, month, kpi_name, meta_value)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE meta_value = VALUES(meta_value)`,
        [company_id, year, month, kpi.name, kpi.meta_value]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en POST stoplight:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
