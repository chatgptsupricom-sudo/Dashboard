import { requireRoles } from "@/lib/auth/roles";
import { aprobadores, ErrorAprobadores, guardarAprobadores, usuariosPanel } from "@/lib/notas-credito/datos";
import { NOMBRE_SEDE, PASOS, type PasoNC } from "@/lib/notas-credito/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** GET: responsables de cada paso por sede y los usuarios del panel que se pueden elegir. Solo SuperAdmin. */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  try {
    const [valor, usuarios] = await Promise.all([aprobadores(), usuariosPanel()]);
    return NextResponse.json({ success: true, aprobadores: valor, usuarios, sedes: NOMBRE_SEDE });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}

/** PUT { company_id, pasos: { preaprueba: [correos], aprueba: [...], procesa: [...] } }. Solo SuperAdmin. */
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => ({}));
    const companyId = Number(body.company_id);
    if (!NOMBRE_SEDE[companyId]) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
    const pasos = Object.fromEntries(
      PASOS.map((p) => [p, Array.isArray(body.pasos?.[p]) ? body.pasos[p].map(String) : []]),
    ) as Record<PasoNC, string[]>;
    await guardarAprobadores(companyId, pasos, String(auth.payload?.email || auth.payload?.name || ""));
    return NextResponse.json({ success: true, aprobadores: await aprobadores() });
  } catch (e: any) {
    const status = e instanceof ErrorAprobadores ? 400 : 500;
    return NextResponse.json({ error: e?.message || "Error" }, { status });
  }
}
