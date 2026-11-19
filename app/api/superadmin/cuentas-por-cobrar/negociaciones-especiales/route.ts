import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { ROLES_ADMINISTRACION } from "@/lib/auth/sedeRol";
import { COMPANY_IDS_ALL, companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { listarEspeciales, marcarEspecial, quitarEspecial } from "@/lib/cxc/negociacionesEspeciales";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Negociaciones especiales de cobro (lib/cxc/negociacionesEspeciales.ts): los
 * clientes que salen del DSO general y se ven aparte.
 *
 *   GET ?empresa=                       → marcas de las sedes que le tocan (vigentes y quitadas)
 *   POST {accion:"marcar", partnerId, companyId, motivo, desde?, hasta?}
 *   POST {accion:"quitar", id, motivo}
 *
 * Leen los roles de CxC (BI y Gerente de Operaciones incluidos); marcan y
 * quitan CxC, Administración y el SuperAdmin, solo en su sede (companyId 0 =
 * las tres, solo quien ve las tres).
 */

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MIN_TEXTO = 10;
const MAX_TEXTO = 2000;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, ROL_BI, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;
  const companyIds = companyIdsEnAlcance(auth.payload, new URL(request.url).searchParams.get("empresa") || "");
  if (!companyIds.length) return NextResponse.json({ error: "No tienes acceso a esa sede" }, { status: 403 });
  try {
    return NextResponse.json({ success: true, data: await listarEspeciales(companyIds) });
  } catch (e: any) {
    console.error("[negociaciones-especiales]", e?.message);
    return NextResponse.json({ error: "No se pudieron leer las negociaciones especiales" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar"]);
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const usuario = String(auth.payload?.name || auth.payload?.email || "Desconocido");
  const alcance = companyIdsEnAlcance(auth.payload, "");
  if (!alcance.length) return NextResponse.json({ error: "Tu usuario no tiene sede asignada" }, { status: 403 });
  const motivo = String(body.motivo || "").trim();
  if (motivo.length < MIN_TEXTO || motivo.length > MAX_TEXTO) {
    return NextResponse.json({ error: `El motivo debe tener entre ${MIN_TEXTO} y ${MAX_TEXTO} caracteres` }, { status: 400 });
  }

  try {
    if (body.accion === "quitar") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Marca inválida" }, { status: 400 });
      const veLasTres = COMPANY_IDS_ALL.every((c) => alcance.includes(c));
      const ok = await quitarEspecial(id, alcance, veLasTres, usuario, motivo);
      if (!ok) return NextResponse.json({ error: "No existe, ya se quitó o es de otra sede" }, { status: 404 });
      return NextResponse.json({ success: true });
    }

    if (body.accion !== "marcar") return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    const partnerId = Number(body.partnerId);
    const companyId = Number(body.companyId);
    if (!Number.isInteger(partnerId) || partnerId <= 0) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
    const todas = COMPANY_IDS_ALL.every((c) => alcance.includes(c));
    if (companyId === 0 ? !todas : !alcance.includes(companyId)) {
      return NextResponse.json({ error: "No puedes marcar clientes de esa sede" }, { status: 403 });
    }
    const hoy = hoyCaracas();
    const desde = FECHA.test(String(body.desde || "")) ? String(body.desde) : hoy;
    const hasta = FECHA.test(String(body.hasta || "")) ? String(body.hasta) : null;
    if (hasta && hasta < desde) return NextResponse.json({ error: "La fecha final es anterior a la inicial" }, { status: 400 });

    // El cliente se valida en Odoo: siempre la empresa (partner comercial).
    const [p] = (await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "=", partnerId]]], {
      fields: ["id", "name", "commercial_partner_id"],
      context: { active_test: false },
    })) || [];
    if (!p) return NextResponse.json({ error: "El cliente no existe en Odoo" }, { status: 400 });
    const comercial = Array.isArray(p.commercial_partner_id) ? p.commercial_partner_id : [p.id, p.name];

    const r = await marcarEspecial({
      companyId,
      partnerId: Number(comercial[0]),
      cliente: String(comercial[1] || p.name),
      motivo,
      desde,
      hasta,
      usuario,
    });
    if ("error" in r) return NextResponse.json({ error: r.error }, { status: 409 });
    return NextResponse.json({ success: true, id: r.id });
  } catch (e: any) {
    console.error("[negociaciones-especiales]", e?.message);
    return NextResponse.json({ error: "No se pudo guardar. Intenta de nuevo." }, { status: 500 });
  }
}
