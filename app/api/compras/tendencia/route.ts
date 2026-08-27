import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


const tendenciaCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

const MESES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

function buildWeeksForMonth(year: number, month: number) {
  const weeks: { label: string; start: Date; end: Date }[] = [];
  const lastDay = new Date(year, month, 0, 23, 59, 59, 999);
  let cursor = new Date(year, month - 1, 1, 0, 0, 0, 0);
  let weekNum = 1;
  while (cursor <= lastDay) {
    const start = new Date(cursor);
    const end = new Date(cursor);
    end.setDate(cursor.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    if (end > lastDay) end.setTime(lastDay.getTime());
    weeks.push({
      label: `Sem ${weekNum} (${start.getDate()}/${start.getMonth() + 1}–${end.getDate()}/${end.getMonth() + 1})`,
      start,
      end,
    });
    cursor.setDate(cursor.getDate() + 7);
    weekNum++;
  }
  return weeks;
}

async function fetchLines(domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [domain],
      {
        fields,
        order: "id asc",
        limit: 5000,
        offset,
      },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const historico = searchParams.get("historico") === "true";

    const today = new Date();
    const defaultMes = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const mesParam = historico ? null : (searchParams.get("mes") ?? defaultMes);

    const cacheKey = historico
      ? `compras_tendencia_v5_historico_sede${sedeParam ?? "todas"}`
      : `compras_tendencia_v5_mes${mesParam}_sede${sedeParam ?? "todas"}`;

    const cached = tendenciaCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    // Base domain — igual para histórico y mensual
    const baseDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.partner_id.name", "not ilike", "office solution"],
      ["product_id", "!=", false],
    ];
    if (sedeParam)
      baseDomain.push(["move_id.company_id", "=", parseInt(sedeParam, 10)]);

    // ── MODO HISTÓRICO ──────────────────────────────────────────────────────
    if (historico) {
      // Últimos 24 meses
      const since = new Date(today.getFullYear(), today.getMonth() - 23, 1);
      const sinceStr = since.toISOString().split("T")[0];
      const domain = [...baseDomain, ["move_id.invoice_date", ">=", sinceStr]];

      const lines = await fetchLines(domain, [
        "product_id",
        "quantity",
        "date",
      ]);

      // Acumular por mes y por producto
      const monthTotals: Record<string, number> = {};
      const productTotals: Record<number, { name: string; qty: number }> = {};

      lines.forEach((line: any) => {
        if (!line.product_id || !line.date) return;
        const d = new Date(line.date);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const qty = line.quantity || 0;
        const pId = line.product_id[0];
        const pName = line.product_id[1] || "";

        monthTotals[monthKey] = (monthTotals[monthKey] ?? 0) + qty;
        if (!productTotals[pId]) productTotals[pId] = { name: pName, qty: 0 };
        productTotals[pId].qty += qty;
      });

      const totalHistorico = Object.values(monthTotals).reduce(
        (s, v) => s + v,
        0,
      );
      const mesesConVenta = Object.keys(monthTotals).length || 1;
      const promedioMensual = Math.round(totalHistorico / mesesConVenta);

      const mejorMesKey =
        Object.entries(monthTotals).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      const mejorMesTotal = mejorMesKey
        ? Math.round(monthTotals[mejorMesKey])
        : 0;
      const mejorMesLabel = mejorMesKey
        ? (() => {
            const [y, m] = mejorMesKey.split("-");
            return `${MESES_ES[parseInt(m, 10) - 1]} ${y}`;
          })()
        : "-";

      const topProductos = Object.values(productTotals)
        .map((v) => ({ nombre: v.name, qty: Math.round(v.qty) }))
        .filter((p) => p.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);

      const resultado = {
        historico: true,
        totalHistorico: Math.round(totalHistorico),
        promedioMensual,
        mejorMes: { label: mejorMesLabel, total: mejorMesTotal },
        mesesConVenta,
        topProductos,
      };

      tendenciaCache.set(cacheKey, { data: resultado, ts: Date.now() });
      return NextResponse.json({ success: true, data: resultado });
    }

    // ── MODO MENSUAL ────────────────────────────────────────────────────────
    const [yearStr, monthStr] = mesParam!.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Parámetro mes inválido" },
        { status: 400 },
      );
    }

    const weeks = buildWeeksForMonth(year, month);
    const startStr = weeks[0].start.toISOString().split("T")[0];
    const endStr = weeks[weeks.length - 1].end.toISOString().split("T")[0];

    const domain = [
      ...baseDomain,
      ["move_id.invoice_date", ">=", startStr],
      ["move_id.invoice_date", "<=", endStr],
    ];

    const invoiceLines = await fetchLines(domain, [
      "product_id",
      "quantity",
      "date",
    ]);

    const weeklyTotals: Record<string, number> = {};
    weeks.forEach((w) => {
      weeklyTotals[w.label] = 0;
    });

    const productTotals: Record<number, { name: string; qty: number }> = {};
    const weekProductMap: Record<
      string,
      Record<number, { nombre: string; qty: number }>
    > = {};
    weeks.forEach((w) => {
      weekProductMap[w.label] = {};
    });

    invoiceLines.forEach((line: any) => {
      if (!line.product_id || !line.date) return;
      const date = new Date(line.date);
      const qty = line.quantity || 0;
      const pId = line.product_id[0];
      const pName = line.product_id[1] || "";

      if (!productTotals[pId]) productTotals[pId] = { name: pName, qty: 0 };
      productTotals[pId].qty += qty;

      for (const w of weeks) {
        if (date >= w.start && date <= w.end) {
          weeklyTotals[w.label] = (weeklyTotals[w.label] ?? 0) + qty;
          if (!weekProductMap[w.label][pId])
            weekProductMap[w.label][pId] = { nombre: pName, qty: 0 };
          weekProductMap[w.label][pId].qty += qty;
          break;
        }
      }
    });

    const topProductos = Object.entries(productTotals)
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 10)
      .map(([id, v]) => ({
        id: Number(id),
        nombre: v.name,
        totalVentas: Math.round(v.qty),
      }));

    const ventasPorProducto: Record<number, Record<string, number>> = {};
    topProductos.forEach((p) => {
      ventasPorProducto[p.id] = {};
      weeks.forEach((w) => {
        ventasPorProducto[p.id][w.label] = 0;
      });
    });
    invoiceLines.forEach((line: any) => {
      if (!line.product_id || !line.date) return;
      const pId = line.product_id[0];
      if (!ventasPorProducto[pId]) return;
      const date = new Date(line.date);
      for (const w of weeks) {
        if (date >= w.start && date <= w.end) {
          ventasPorProducto[pId][w.label] =
            (ventasPorProducto[pId][w.label] ?? 0) + (line.quantity || 0);
          break;
        }
      }
    });

    const productosPorSemana: Record<
      string,
      { nombre: string; qty: number }[]
    > = {};
    weeks.forEach((w) => {
      productosPorSemana[w.label] = Object.values(weekProductMap[w.label])
        .map((v) => ({ nombre: v.nombre, qty: Math.round(v.qty) }))
        .filter((p) => p.qty > 0)
        .sort((a, b) => b.qty - a.qty);
    });

    const productosTotal = Object.values(productTotals)
      .map((v) => ({ nombre: v.name, qty: Math.round(v.qty) }))
      .filter((p) => p.qty > 0)
      .sort((a, b) => b.qty - a.qty);

    const resultado = {
      historico: false,
      mes: mesParam,
      semanas: weeks.map((w) => w.label),
      totalPorSemana: weeks.map((w) => ({
        semana: w.label,
        total: Math.round(weeklyTotals[w.label] ?? 0),
      })),
      topProductos: topProductos.map((p) => ({
        ...p,
        semanal: weeks.map((w) =>
          Math.round(ventasPorProducto[p.id][w.label] ?? 0),
        ),
      })),
      productosPorSemana,
      productosTotal,
    };

    tendenciaCache.set(cacheKey, { data: resultado, ts: Date.now() });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error: any) {
    console.error("❌ Error en API tendencia:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
