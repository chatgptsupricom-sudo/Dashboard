import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { listarSolicitudes } from "@/lib/adminleads/material-pop/requests";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ESTADOS = ["pendiente", "aprobada", "rechazada", "entregada", "cancelada"];

/** Bandeja de solicitudes de los vendedores. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const estado = searchParams.get("status");

    // Se traen todas y se filtra acá: el contador de pendientes tiene que
    // seguir siendo el total aunque la pantalla esté mirando otro estado.
    const todas = await listarSolicitudes({ cids: resolveMaterialPopCids(auth.payload) });
    const filtro = estado && ESTADOS.includes(estado) ? estado : null;

    return NextResponse.json({
      success: true,
      requests: filtro ? todas.filter((s) => s.status === filtro) : todas,
      pendientes: todas.filter((s) => s.status === "pendiente").length,
    });
  } catch (error: any) {
    console.error("Error listando solicitudes POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
