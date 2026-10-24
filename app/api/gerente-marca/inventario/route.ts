import { NextRequest, NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { alcanceGerente } from "@/lib/gerente-marca/acceso";
import { inventarioGerente } from "@/lib/gerente-marca/datos";

export const maxDuration = 60;

/**
 * Inventario de las marcas del Gerente de Marca (lib/gerente-marca/datos.ts):
 * stock, por llegar, costo, antigüedad por tramos y unidades vendidas en el
 * mes en curso y en los últimos 6 meses, por sede. Lo usan Inventario,
 * Antigüedad y el Dashboard del rol.
 *
 * GET ?sede=9|10|ambas&gerente=correo (gerente: solo el SuperAdmin)
 */
export async function GET(request: NextRequest) {
  const a = await alcanceGerente(request);
  if (a.error) return a.error;
  try {
    const data = await inventarioGerente(a.asignaciones, a.sedes);
    return NextResponse.json({ success: true, data: { ...data, generado: new Date().toISOString() } });
  } catch (error: any) {
    console.error("Error en gerente-marca/inventario:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "No se pudo leer el inventario de Odoo" }, { status });
  }
}
