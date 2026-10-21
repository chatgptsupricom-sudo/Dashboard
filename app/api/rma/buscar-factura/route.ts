import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { buscarFacturaConSeriales, OdooNoDisponibleError } from "@/lib/servicio-tecnico/factura";
import { buscarSerial, limpiarSerial } from "@/lib/rma/buscarSerial";

export const dynamic = "force-dynamic";

const SEDES = [7, 9, 10];
const comparable = (s: string) => s.trim().toUpperCase();

/**
 * GET /api/rma/buscar-factura?factura=&serial=&sede=7|9|10
 *
 * Buscar Factura de RMA: valida si un equipo se compró en la empresa.
 * - factura: la factura de cliente con sus productos, el serial despachado
 *   de cada uno y su garantía (la misma búsqueda del portal de servicio
 *   técnico, lib/servicio-tecnico/factura.ts, sin pedir RIF).
 * - serial: por dónde pasó ese serial en Odoo y el veredicto
 *   (lib/rma/buscarSerial.ts).
 * - Con los dos, `enFactura` dice si el serial es de esa factura.
 * Busca en las tres sedes salvo que se pida una: el cliente pudo comprar en
 * otra. No devuelve precios ni montos.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const numero = (sp.get("factura") || "").trim();
  const serial = limpiarSerial(sp.get("serial") || "");
  const sedePedida = Number(sp.get("sede"));
  const sede = SEDES.includes(sedePedida) ? sedePedida : undefined;
  if (!numero && !serial) {
    return NextResponse.json({ error: "Escribe un número de factura o un serial." }, { status: 400 });
  }
  if (serial && serial.length < 3) {
    return NextResponse.json({ error: "El serial debe tener al menos 3 caracteres." }, { status: 400 });
  }

  try {
    const [factura, resultadoSerial] = await Promise.all([
      numero ? buscarFacturaConSeriales(numero, undefined, sede) : Promise.resolve(null),
      serial ? buscarSerial(serial) : Promise.resolve(null),
    ]);
    // partner_id es interno de la creación de tickets: no sale.
    const facturaPublica = factura && factura.estado === "ok" ? (({ partner_id, ...resto }) => resto)(factura) : factura;
    const enFactura =
      factura?.estado === "ok" && serial
        ? factura.items.some((i) => i.serial && comparable(i.serial) === comparable(serial))
        : null;
    return NextResponse.json({ success: true, factura: facturaPublica, serial: resultadoSerial, enFactura });
  } catch (e: any) {
    if (e instanceof OdooNoDisponibleError) {
      return NextResponse.json({ error: "Odoo no respondió. Intenta de nuevo en unos minutos.", odooUnreachable: true }, { status: 502 });
    }
    console.error("[rma/buscar-factura]", e?.message);
    return NextResponse.json({ error: "No se pudo hacer la búsqueda." }, { status: 500 });
  }
}
