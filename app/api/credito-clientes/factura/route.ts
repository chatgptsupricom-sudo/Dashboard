import { facturaParaCliente } from "@/lib/notas-credito/cliente";
import { ErrorNC } from "@/lib/notas-credito/solicitudes";
import { OdooUnreachableError } from "@/lib/odoo";
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { esSucursalValida } from "@/lib/servicio-tecnico/sucursales";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/credito-clientes/factura?numero=&rif=&sucursal=
 *
 * PÚBLICO (servicio de notas de crédito, sin sesión): la factura del cliente con los productos que
 * puede poner en una nota de crédito (lib/notas-credito/cliente.ts). El RIF es
 * obligatorio por lo mismo que en /api/servicio-tecnico/factura: sin él, con
 * números correlativos cualquiera saca nombres de clientes y sus compras.
 * Sin precios ni montos.
 */
export async function GET(request: Request) {
  const bloqueo = aplicarLimites(request, "nc-factura", [
    { max: 10, ventanaSegundos: 60 },
    { max: 50, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return bloqueo;

  const sp = new URL(request.url).searchParams;
  const numero = (sp.get("numero") || "").trim();
  const rif = (sp.get("rif") || "").trim();
  const cid = parseInt(sp.get("sucursal") || "", 10);
  if (!numero) return NextResponse.json({ estado: "invalida", error: "Falta el número de factura" }, { status: 400 });
  if (!esSucursalValida(cid)) return NextResponse.json({ estado: "invalida", error: "Falta elegir la sucursal" }, { status: 400 });
  if (!rif) return NextResponse.json({ estado: "invalida", error: "Falta el RIF o cédula del cliente de la factura" }, { status: 400 });

  try {
    return NextResponse.json(await facturaParaCliente(numero, rif, cid));
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ estado: "invalida", error: e.message }, { status: e.status });
    console.error("GET /api/credito-clientes/factura:", e?.message);
    const status = e instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ estado: "error", error: "No pudimos consultar la factura. Intenta de nuevo en unos minutos." }, { status });
  }
}
