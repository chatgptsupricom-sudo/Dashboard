import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI, veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { sedeDelToken } from "@/lib/auth/sedeRol";
import { leerDepartamentos, guardarManual } from "@/lib/stoplight/departamentos/datos";
import { companyDeKpi, defKpi } from "@/lib/stoplight/departamentos/definiciones";

// KPIs por departamento del Stoplight (lib/stoplight/departamentos).
// GET: los bloques de una sede y un mes. Solo el SuperAdmin (y BI, que solo
// lee) elige la sede; el Gerente de Operaciones ve la suya.
// POST: carga a mano del valor de un KPI en un mes (solo SuperAdmin).

const ROLES_LEEN = ["gerente de operaciones", ROL_BI];
const SEDES = [9, 10, 7];
const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEEN);
  if (auth.error) return auth.error;
  const rol = String(auth.payload.role || "").toLowerCase().trim();
  const sp = request.nextUrl.searchParams;

  const pedida = parseInt(sp.get("company_id") || "", 10);
  const companyId = veTodasLasSedes(rol) && SEDES.includes(pedida) ? pedida : sedeDelToken(auth.payload);
  if (!companyId) return NextResponse.json({ error: "Sede no válida" }, { status: 400 });

  const ahora = new Date();
  const mes = RE_MES.test(sp.get("mes") || "") ? (sp.get("mes") as string) : `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;

  try {
    const datos = await leerDepartamentos(companyId, mes, { refrescar: sp.get("refrescar") === "1" });
    return NextResponse.json({ success: true, companyId, mes, ...datos });
  } catch (e: any) {
    console.error("[stoplight departamentos] GET", e?.message);
    return NextResponse.json({ error: "No se pudieron leer los KPIs de los departamentos" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  // Solo el SuperAdmin (requireRoles lo deja entrar siempre).
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const key = String(body?.kpi_key || "");
  const def = defKpi(key);
  if (!def) return NextResponse.json({ error: "KPI no válido" }, { status: 400 });
  if (def.fuente === "auto") return NextResponse.json({ error: "Este KPI se calcula solo" }, { status: 400 });
  const mes = String(body?.mes || "");
  if (!RE_MES.test(mes)) return NextResponse.json({ error: "Mes no válido" }, { status: 400 });
  const sede = Number(body?.company_id);
  if (!SEDES.includes(sede)) return NextResponse.json({ error: "Sede no válida" }, { status: 400 });

  // Vacío = borrar la carga (vuelve al cálculo automático, si tiene).
  const crudo = body?.valor;
  let valor: number | null = null;
  if (crudo !== null && crudo !== undefined && String(crudo).trim() !== "") {
    valor = Number(String(crudo).replace(",", "."));
    if (!Number.isFinite(valor) || valor < 0 || valor > 1e9) {
      return NextResponse.json({ error: "Valor no válido" }, { status: 400 });
    }
  }
  const nota = body?.nota ? String(body.nota).trim().slice(0, 500) || null : null;
  const usuario = String(auth.payload.email || auth.payload.name || "").slice(0, 190) || null;

  try {
    await guardarManual(key, companyDeKpi(key, sede), mes, valor, nota, usuario);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[stoplight departamentos] POST", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
