import { NextRequest, NextResponse } from "next/server";
import { fechaValida, hoyCaracas, sedesDe } from "@/lib/auditoria-nc/servicio";

/** Sede y período de la query. Sin fechas: el mes en curso. Máximo 400 días. */
export function leerPeriodo(request: NextRequest): { sedes: number[]; desde: string; hasta: string } | { error: NextResponse } {
  const sp = request.nextUrl.searchParams;
  const sedes = sedesDe(sp.get("company_id"));
  if (!sedes) return { error: NextResponse.json({ error: "Sede inválida" }, { status: 400 }) };
  const hoy = hoyCaracas();
  const desde = fechaValida(sp.get("desde")) || `${hoy.slice(0, 7)}-01`;
  const hasta = fechaValida(sp.get("hasta")) || hoy;
  if (desde > hasta) return { error: NextResponse.json({ error: "El período está al revés" }, { status: 400 }) };
  if ((Date.parse(hasta) - Date.parse(desde)) / 86400000 > 400) {
    return { error: NextResponse.json({ error: "El período no puede superar 400 días" }, { status: 400 }) };
  }
  return { sedes, desde, hasta };
}
