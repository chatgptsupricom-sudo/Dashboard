// GET /api/adminleads/reporte-campanas
// Reporte KPI por campana de Instagram / Facebook: la economia de cada pauta,
// con las formulas desarrolladas y sus numeros sustituidos.
//
// Es distinto del informe mensual de redes (informe-mensual): aquel mira el
// canal completo mes contra mes; este mira campana por campana y responde
// cuanto costo cada lead, cada cierre y cuanto volvio.
//
// Reusa getCampaignMetrics para que la inversion, los leads y el recaudo sean
// exactamente los mismos que muestra el tab de Campanas Meta.

import { getCampaignMetrics, type CampaignAggregate } from "@/lib/campanas-meta";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** Margen bruto por defecto para el ROAS ajustado; se puede pasar por query. */
const MARGEN_DEFECTO = 10;

async function getUserCids(request: Request): Promise<number | null> {
  const cookieHeader = request.headers.get("cookie");
  const token = cookieHeader
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];
  if (!token) return null;
  const { payload } = await jwtVerify(token, jwtSecretBytes());
  return (payload.cids as number) ?? null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Division que devuelve null en vez de Infinity o NaN cuando no hay divisor. */
function dividir(numerador: number, divisor: number): number | null {
  if (!divisor) return null;
  return numerador / divisor;
}

/**
 * Economia de una campana. Cada metrica viaja junto a su formula y a los
 * valores sustituidos, para que el informe pueda mostrarlas como el modelo:
 * "Costo campana / Leads calificados = 18,96 / 23 = 0,82".
 */
function economiaDeCampana(c: CampaignAggregate, margenPct: number) {
  const inversion = c.spend_usd;
  const ventas = c.recaudo_usd;
  const calificados = c.calificados;
  const leads = c.total_leads;
  const facturas = c.facturas || c.ventas_cerradas;

  const metrica = (
    nombre: string,
    formula: string,
    numerador: number,
    divisor: number,
    valor: number | null,
    unidad: "usd" | "pct" | "x" | "num",
    nota?: string,
  ) => ({ nombre, formula, numerador, divisor, valor, unidad, nota });

  return [
    metrica(
      "Tasa de conversión",
      "Cantidad de facturas ÷ Leads calificados × 100",
      facturas,
      calificados,
      dividir(facturas * 100, calificados),
      "pct",
    ),
    metrica(
      "Costo por lead promedio",
      "Costo campaña ÷ Leads totales",
      inversion,
      leads,
      dividir(inversion, leads),
      "usd",
    ),
    metrica(
      "Costo por lead calificado",
      "Costo campaña ÷ Leads calificados",
      inversion,
      calificados,
      dividir(inversion, calificados),
      "usd",
    ),
    metrica(
      "Costo por cierre",
      "Costo campaña ÷ Número de facturas",
      inversion,
      facturas,
      dividir(inversion, facturas),
      "usd",
    ),
    metrica(
      "Costo por alcance",
      "Costo campaña ÷ Alcance",
      inversion,
      c.reach,
      dividir(inversion, c.reach),
      "usd",
      "Por persona alcanzada",
    ),
    metrica(
      "CPV · Costo por visualización",
      "Costo campaña ÷ Reproducciones",
      inversion,
      c.reproducciones,
      dividir(inversion, c.reproducciones),
      "usd",
      "Por reproducción",
    ),
    metrica(
      "CPM · Costo por mil impresiones",
      "Costo campaña ÷ Impresiones × 1000",
      inversion,
      c.impressions,
      dividir(inversion * 1000, c.impressions),
      "usd",
    ),
    metrica(
      "ROI",
      "(Ventas − Costo campaña) ÷ Costo campaña × 100",
      ventas - inversion,
      inversion,
      dividir((ventas - inversion) * 100, inversion),
      "pct",
      "Retorno sobre lo invertido",
    ),
    metrica(
      "ROAS",
      "Ventas ÷ Costo campaña",
      ventas,
      inversion,
      dividir(ventas, inversion),
      "x",
      "Dólares generados por cada dólar invertido",
    ),
    metrica(
      `ROAS sobre margen (${margenPct}%)`,
      `Ventas × ${margenPct}% ÷ Costo campaña`,
      r2(ventas * (margenPct / 100)),
      inversion,
      dividir(ventas * (margenPct / 100), inversion),
      "x",
      "Cuánto vuelve en ganancia bruta, no en facturación",
    ),
  ];
}

export async function GET(request: Request) {
  try {
    const userCids = await getUserCids(request);
    if (userCids === null) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sede = searchParams.get("sede");
    const fechaInicio = DATE_REGEX.test(searchParams.get("fecha_inicio") || "")
      ? searchParams.get("fecha_inicio")!
      : null;
    const fechaFin = DATE_REGEX.test(searchParams.get("fecha_fin") || "")
      ? searchParams.get("fecha_fin")!
      : null;

    const margenParam = parseFloat(searchParams.get("margen") || "");
    const margenPct =
      Number.isFinite(margenParam) && margenParam > 0 && margenParam <= 100
        ? margenParam
        : MARGEN_DEFECTO;

    const { campaigns } = await getCampaignMetrics({
      userCids,
      sede,
      fechaInicio,
      fechaFin,
    });

    // Solo las campanas que efectivamente gastaron: sin inversion no hay
    // economia que analizar y las divisiones quedarian todas en null.
    const conInversion = campaigns.filter((c) => c.spend_usd > 0);

    const detalle = conInversion.map((c) => ({
      campana: c.campaign_name,
      pais: c.pais,
      objetivo: c.objetivo,
      anuncio: {
        reproducciones: c.reproducciones,
        alcance: c.reach,
        impresiones: c.impressions,
        frecuencia: r2(c.frequency),
        clics: c.clicks,
        inversion: r2(c.spend_usd),
        ventas_generadas: r2(c.recaudo_usd),
        leads_totales: c.total_leads,
        leads_calificados: c.calificados,
        no_calificados: c.no_calificados,
        facturas: c.facturas || c.ventas_cerradas,
      },
      metricas: economiaDeCampana(c, margenPct).map((m) => ({
        ...m,
        valor: m.valor === null ? null : m.unidad === "usd" ? r4(m.valor) : r2(m.valor),
      })),
    }));

    const totalInversion = conInversion.reduce((s, c) => s + c.spend_usd, 0);
    const totalVentas = conInversion.reduce((s, c) => s + c.recaudo_usd, 0);
    const totalLeads = conInversion.reduce((s, c) => s + c.total_leads, 0);
    const totalCalificados = conInversion.reduce((s, c) => s + c.calificados, 0);
    const totalFacturas = conInversion.reduce(
      (s, c) => s + (c.facturas || c.ventas_cerradas),
      0,
    );
    const totalAlcance = conInversion.reduce((s, c) => s + c.reach, 0);
    const totalImpresiones = conInversion.reduce((s, c) => s + c.impressions, 0);

    const consolidado = {
      campanas: conInversion.length,
      inversion: r2(totalInversion),
      ventas: r2(totalVentas),
      leads_totales: totalLeads,
      leads_calificados: totalCalificados,
      facturas: totalFacturas,
      alcance: totalAlcance,
      impresiones: totalImpresiones,
      margen_pct: margenPct,
      metricas: [
        {
          nombre: "ROAS combinado",
          formula: "Ventas totales ÷ Inversión total",
          numerador: r2(totalVentas),
          divisor: r2(totalInversion),
          valor: dividir(totalVentas, totalInversion),
          unidad: "x" as const,
        },
        {
          nombre: "Retorno neto",
          formula: "(Ventas totales − Inversión total) ÷ Inversión total × 100",
          numerador: r2(totalVentas - totalInversion),
          divisor: r2(totalInversion),
          valor: dividir((totalVentas - totalInversion) * 100, totalInversion),
          unidad: "pct" as const,
        },
        {
          nombre: `ROAS sobre margen (${margenPct}%)`,
          formula: `Ventas totales × ${margenPct}% ÷ Inversión total`,
          numerador: r2(totalVentas * (margenPct / 100)),
          divisor: r2(totalInversion),
          valor: dividir(totalVentas * (margenPct / 100), totalInversion),
          unidad: "x" as const,
          nota: "Un valor mayor a 1 significa que la pauta se paga con la ganancia bruta.",
        },
        {
          nombre: "Costo por lead consolidado",
          formula: "Inversión total ÷ Leads totales",
          numerador: r2(totalInversion),
          divisor: totalLeads,
          valor: dividir(totalInversion, totalLeads),
          unidad: "usd" as const,
        },
        {
          nombre: "Costo por cierre consolidado",
          formula: "Inversión total ÷ Facturas",
          numerador: r2(totalInversion),
          divisor: totalFacturas,
          valor: dividir(totalInversion, totalFacturas),
          unidad: "usd" as const,
        },
      ].map((m) => ({
        ...m,
        valor: m.valor === null ? null : r2(m.valor),
      })),
    };

    return NextResponse.json({
      periodo: {
        desde: fechaInicio,
        hasta: fechaFin,
        etiqueta:
          fechaInicio && fechaFin
            ? `${fechaInicio} al ${fechaFin}`
            : "Todo el histórico",
      },
      detalle,
      consolidado,
      sin_campanas: detalle.length === 0,
    });
  } catch (error: any) {
    console.error("Error generando reporte por campaña:", error);
    return NextResponse.json(
      {
        error: "Error generando el reporte",
        detail: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
