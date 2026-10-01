import { callOdooRPC } from "@/lib/odoo";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

// Umbral unico (no 3 franjas): el usuario pidio 2 secciones, buena paga /
// mala paga. Un cliente con un atraso promedio de hasta esta cantidad de
// dias se considera buena paga; mas de esto, mala paga. Ajustable si el
// negocio quiere otro corte.
const DIAS_BUENA_PAGA = 7;
// Por encima de este promedio, la sugerencia pasa de "bajar" a "quitar" el
// credito -- atraso cronico, no ocasional.
const DIAS_MALA_PAGA_SEVERA = 30;
// Utilizacion del cupo de credito (credit / credit_limit) a partir de la
// cual, si el cliente ademas es buena paga, se sugiere subirle el cupo en
// vez de solo "mantener".
const UTILIZACION_ALTA = 0.8;
// Un cliente con menos de esta cantidad de facturas cobradas en el periodo
// no tiene historial suficiente para juzgar su comportamiento de pago --
// se deja afuera de ambas listas en vez de clasificarlo con 1 solo dato.
const MIN_FACTURAS_PARA_CLASIFICAR = 2;

type PagoCliente = {
  partnerId: number;
  partnerName: string;
  diasAtraso: number; // 0 si pago a tiempo o antes -- nunca negativo.
  monto: number;
};

/**
 * Cobros del periodo con dias de atraso reales (fecha de CONFIRMACION del pago
 * vs fecha de VENCIMIENTO de la factura). Sale de lib/cxc/cobros.ts, la misma
 * fuente de "Cobrado" que Contado/Credito y los KPIs: solo banco/caja real,
 * solo facturas (una nota de credito no es "el cliente pago tarde"), sin
 * partner interno.
 */
async function pagosConciliadosDelPeriodo(companyIds: number[], desde: Date): Promise<PagoCliente[]> {
  const cobros = await obtenerCobros(companyIds, {
    desde,
    hasta: new Date(),
    dominioFactura: [["move_type", "=", "out_invoice"]],
  });

  return cobros
    .filter((c) => !c.interno && c.partnerId)
    .map((c) => {
      let diasAtraso = 0;
      if (c.vencimiento) {
        const diff = Math.round(
          (new Date(c.fecha + "T00:00:00").getTime() - new Date(c.vencimiento + "T00:00:00").getTime()) / 86400000,
        );
        diasAtraso = Math.max(0, diff);
      }
      return {
        partnerId: c.partnerId!,
        partnerName: c.partnerName || "Sin cliente",
        diasAtraso,
        monto: c.monto,
      };
    });
}

type ClienteClasificado = {
  partnerId: number;
  partnerName: string;
  diasAtrasoPromedio: number;
  facturasPagadas: number;
  montoTotal: number;
  creditLimit: number | null;
  creditUsado: number | null;
  utilizacionPct: number | null;
  clasificacion: "buena_paga" | "mala_paga";
  sugerencia: string;
};

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const mesesParam = searchParams.get("meses");
    const meses = Math.min(24, Math.max(1, parseInt(mesesParam || "6", 10) || 6));

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const desde = new Date();
    desde.setMonth(desde.getMonth() - meses);

    const pagos = await pagosConciliadosDelPeriodo(companyIds, desde);

    const porCliente = new Map<number, { partnerName: string; dias: number[]; monto: number }>();
    pagos.forEach((p) => {
      const acc = porCliente.get(p.partnerId) ?? { partnerName: p.partnerName, dias: [], monto: 0 };
      acc.dias.push(p.diasAtraso);
      acc.monto += p.monto;
      porCliente.set(p.partnerId, acc);
    });

    const elegibles = [...porCliente.entries()].filter(([, v]) => v.dias.length >= MIN_FACTURAS_PARA_CLASIFICAR);

    // Cupo de credito de Odoo (res.partner.credit_limit / credit), mismo
    // campo que ya usa app/api/vendedores/top-clientes/route.ts -- se
    // consulta solo para los clientes con historial suficiente.
    const partnerIds = elegibles.map(([id]) => id);
    let creditMap: Record<number, { limit: number; used: number }> = {};
    if (partnerIds.length > 0) {
      const partners = await callOdooRPC<any[]>(
        "res.partner", "read", [partnerIds],
        { fields: ["id", "credit_limit", "credit"] },
      );
      (partners || []).forEach((p) => {
        creditMap[p.id] = { limit: p.credit_limit || 0, used: p.credit || 0 };
      });
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const clientes: ClienteClasificado[] = elegibles.map(([partnerId, v]) => {
      const diasAtrasoPromedio = round2(v.dias.reduce((s, d) => s + d, 0) / v.dias.length);
      const clasificacion: "buena_paga" | "mala_paga" = diasAtrasoPromedio <= DIAS_BUENA_PAGA ? "buena_paga" : "mala_paga";
      const credito = creditMap[partnerId];
      const creditLimit = credito?.limit ?? null;
      const creditUsado = credito?.used ?? null;
      const utilizacionPct = creditLimit && creditLimit > 0 && creditUsado != null
        ? round2((creditUsado / creditLimit) * 100)
        : null;

      let sugerencia: string;
      if (clasificacion === "buena_paga") {
        sugerencia = utilizacionPct != null && utilizacionPct >= UTILIZACION_ALTA * 100
          ? "Subir crédito"
          : "Mantener crédito";
      } else {
        sugerencia = diasAtrasoPromedio > DIAS_MALA_PAGA_SEVERA ? "Quitar crédito" : "Bajar crédito";
      }

      return {
        partnerId,
        partnerName: v.partnerName,
        diasAtrasoPromedio,
        facturasPagadas: v.dias.length,
        montoTotal: round2(v.monto),
        creditLimit,
        creditUsado,
        utilizacionPct,
        clasificacion,
        sugerencia,
      };
    });

    const buenaPaga = clientes
      .filter((c) => c.clasificacion === "buena_paga")
      .sort((a, b) => a.diasAtrasoPromedio - b.diasAtrasoPromedio);
    const malaPaga = clientes
      .filter((c) => c.clasificacion === "mala_paga")
      .sort((a, b) => b.diasAtrasoPromedio - a.diasAtrasoPromedio);

    return NextResponse.json({
      success: true,
      data: {
        buenaPaga,
        malaPaga,
        meses,
        totalClientesConHistorial: elegibles.length,
        criterios: {
          diasBuenaPaga: DIAS_BUENA_PAGA,
          diasMalaPagaSevera: DIAS_MALA_PAGA_SEVERA,
          utilizacionAlta: UTILIZACION_ALTA * 100,
          minFacturasParaClasificar: MIN_FACTURAS_PARA_CLASIFICAR,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error CxC clasificacion-clientes API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
