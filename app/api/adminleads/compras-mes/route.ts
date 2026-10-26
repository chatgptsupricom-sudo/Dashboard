// GET /api/adminleads/compras-mes?desde=YYYY-MM&hasta=YYYY-MM&sede= (o ?mes= para uno)
//
// Clientes que compraron en el mes, sus facturas y el detalle de cada una.
// Ver lib/adminleads/comprasMes.ts. AdminLeads queda en la sede de su `cids`
// (sin cids válido: 403); los demás roles de Leads y el SuperAdmin eligen
// sede o ven todas.

import { comprasDelPeriodo, periodoPedido, sedesDelUsuario } from "@/lib/adminleads/comprasMes";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { respuestaDeError } from "@/lib/administracion/lectura";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDelUsuario(auth.payload, sp);
  if (!sedes) return respuestaSedeNoPermitida();

  try {
    const { desde, hasta } = periodoPedido(sp);
    return NextResponse.json(await comprasDelPeriodo(desde, hasta, sedes));
  } catch (error: any) {
    return respuestaDeError(error, "GET /api/adminleads/compras-mes");
  }
}
