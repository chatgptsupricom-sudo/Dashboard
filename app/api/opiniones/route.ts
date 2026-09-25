import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { COMPANY_IDS_ALL, COMPANY_NAME } from "@/lib/gerente_venta/reporteVentas";
import { listarOpiniones } from "@/lib/opiniones/consulta";

/**
 * Opiniones de clientes: respuestas de la encuesta pública de ventas y RMA.
 *
 *   GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD[&sede=9|10|7]
 *
 * Alcance: gerencia de ventas ve solo su sede (payload.cids). Superadmin ve
 * todas, incluidas las respuestas sin ejecutivo identificado (sin sede), y
 * puede acotar con ?sede=. El asistente de ventas entra a /gerente_venta pero
 * no a este endpoint.
 */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

function isoHaceDias(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas"]);
  if (auth.error) return auth.error;

  const role = ((auth.payload!.role as string) || "").toLowerCase().trim();
  const esSuperAdmin = role === "superadmin";

  const sp = request.nextUrl.searchParams;
  const hasta = RE_FECHA.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : isoHaceDias(0);
  let desde = RE_FECHA.test(sp.get("desde") ?? "") ? sp.get("desde")! : isoHaceDias(90);
  if (desde > hasta) desde = hasta;

  let sedeCid: number | null;
  if (esSuperAdmin) {
    const sede = Number(sp.get("sede"));
    sedeCid = COMPANY_IDS_ALL.includes(sede) ? sede : null;
  } else {
    const cid = Number(auth.payload!.cids);
    if (!COMPANY_IDS_ALL.includes(cid)) {
      return NextResponse.json({ error: "Tu usuario no tiene una sede asignada." }, { status: 403 });
    }
    sedeCid = cid;
  }

  try {
    const { respuestas, sinDatosDeSede } = await listarOpiniones({ desde, hasta, sedeCid });
    return NextResponse.json({
      periodo: { desde, hasta },
      esSuperAdmin,
      sedes: esSuperAdmin
        ? COMPANY_IDS_ALL.map((id) => ({ id, name: COMPANY_NAME[id] }))
        : [],
      sedeActual: sedeCid !== null ? COMPANY_NAME[sedeCid] : null,
      sinDatosDeSede,
      respuestas,
    });
  } catch (error) {
    console.error("[api/opiniones] error:", error);
    return NextResponse.json({ error: "No se pudieron cargar las opiniones." }, { status: 500 });
  }
}
