import { requireNC } from "@/lib/notas-credito/acceso";
import { buscarFacturas } from "@/lib/notas-credito/odoo";
import { OdooUnreachableError } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * GET ?company_id=&q=  facturas de cliente publicadas (número o cliente) para
 * crear una nota de crédito o asignarle la factura. Solo quien preaprueba o
 * hace la NC en esa sede.
 */
export async function GET(request: NextRequest) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  const companyId = Number(request.nextUrl.searchParams.get("company_id"));
  const q = request.nextUrl.searchParams.get("q") || "";
  const pasos = acceso!.pasos[companyId] ?? [];
  if (!pasos.includes("preaprueba") && !pasos.includes("procesa")) {
    return NextResponse.json({ error: "No buscas facturas en esta sede." }, { status: 403 });
  }
  try {
    return NextResponse.json({ success: true, facturas: await buscarFacturas(companyId, q) });
  } catch (e: any) {
    const status = e instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: e?.message || "Error" }, { status });
  }
}
