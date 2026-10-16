import { requireNC } from "@/lib/notas-credito/acceso";
import { buscarFacturas } from "@/lib/notas-credito/odoo";
import { ErrorNC, productosParaNota } from "@/lib/notas-credito/solicitudes";
import { OdooUnreachableError } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET ?company_id=&q=           facturas de cliente publicadas (número o cliente)
 *                               para crear una nota de crédito o asignarle la factura.
 *     ?company_id=&factura_id=  la factura con sus productos (marca, lo que queda
 *                               por acreditar y seriales despachados) para
 *                               "Nueva nota de crédito".
 * Buscan quien preaprueba o hace la NC en esa sede y el SuperAdmin; los
 * productos, solo quien crea (preaprueba) y el SuperAdmin.
 */
export async function GET(request: NextRequest) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  const sp = request.nextUrl.searchParams;
  const companyId = Number(sp.get("company_id"));
  const facturaId = Number(sp.get("factura_id")) || 0;
  const pasos = acceso!.pasos[companyId] ?? [];
  const puedeBuscar = acceso!.superadmin || pasos.includes("preaprueba") || pasos.includes("procesa");
  if (!puedeBuscar || (facturaId && !acceso!.superadmin && !pasos.includes("preaprueba"))) {
    return NextResponse.json({ error: "No buscas facturas en esta sede." }, { status: 403 });
  }
  try {
    if (facturaId) return NextResponse.json({ success: true, ...(await productosParaNota(companyId, facturaId)) });
    return NextResponse.json({ success: true, facturas: await buscarFacturas(companyId, sp.get("q") || "") });
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ error: e.message }, { status: e.status });
    const status = e instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: e?.message || "Error" }, { status });
  }
}
