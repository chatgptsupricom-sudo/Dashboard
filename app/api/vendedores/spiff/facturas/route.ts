import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/roles";
import { sedeDelSpiff, veFacturasDeOtros } from "@/lib/spiff/acceso";
import { calcularSpiffDelMes } from "@/lib/spiff/calculo";

/**
 * Facturas de un vendedor que cuentan para una regla de Spiff en un mes (lo
 * que se abre al pulsar su fila en el ranking del administrador de reglas).
 * Sale del MISMO cálculo que el ranking (`calcularSpiffDelMes` con
 * `conFacturas`), así las facturas suman exactamente la Unidad y el Monto de
 * la fila: solo las líneas de la marca (o del producto) de la regla, dentro
 * de sus fechas, y las notas de crédito restan.
 *
 * Mismo guard y misma sede que `/api/vendedores/spiff`; además, fuera de los
 * roles que administran reglas, cada quien solo ve sus propias facturas.
 *
 * `?regla_id=&vendedor=<nombre del ranking>&year=&month=[&company_id=]`
 */
export async function GET(request: NextRequest) {
  const sesion = await requireSession(request);
  if (sesion.error) return sesion.error;
  const payload = sesion.payload;

  try {
    const sp = request.nextUrl.searchParams;
    const now = new Date();
    const mes = parseInt(sp.get("month") || "", 10) || now.getMonth() + 1;
    const anio = parseInt(sp.get("year") || "", 10) || now.getFullYear();
    const reglaId = parseInt(sp.get("regla_id") || "", 10);
    const nombre = String(sp.get("vendedor") || "").trim();
    if (!Number.isFinite(reglaId) || !nombre) {
      return NextResponse.json({ error: "Faltan regla_id o vendedor" }, { status: 400 });
    }

    const companyId = sedeDelSpiff(payload, sp);
    const resumen = await calcularSpiffDelMes(companyId, anio, mes, { incluirReglaId: reglaId, conFacturas: true });
    const vendedor = resumen.vendedores.find((v) => !v.excluido && v.nombre === nombre);
    if (vendedor && !veFacturasDeOtros(payload) && vendedor.userId !== Number(payload.uid)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    const detalle = vendedor?.detalle.find((d) => d.reglaId === reglaId);

    return NextResponse.json({
      vendedor: nombre,
      monto: detalle?.monto ?? 0,
      cantidad: detalle?.cantidad ?? 0,
      facturas: detalle?.facturas ?? [],
    });
  } catch (e: any) {
    console.error("Error API spiff facturas:", e.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
