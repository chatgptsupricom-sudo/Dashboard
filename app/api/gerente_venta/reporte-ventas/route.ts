import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import {
  cargarFiltros,
  cargarDesglose,
  clientesInactivos,
  COMPANY_IDS_ALL,
  COMPANY_NAME,
} from "@/lib/gerente_venta/reporteVentas";

/**
 * Reporte de Ventas del Gerente de Ventas (equivalente a la vista de Smartbitt).
 *
 *   ?tipo=filtros                       -> selectores (vendedores / clientes / marcas)
 *   ?tipo=desglose&desde&hasta&...      -> desglose agregado + totales
 *   ?tipo=inactivos&meses=3|6&vendedor  -> cartera sin compras en N meses
 *
 * Alcance: gerencia de ventas ve su compañía (payload.cids); superadmin ve las
 * tres sedes y puede acotar con ?sede=. El rango de fechas se limita a 12 meses.
 */

const MS_DIA = 24 * 60 * 60 * 1000;
const RANGO_MAX_DIAS = 366;

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function primerDiaMesISO(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

/** Normaliza el rango: fechas válidas, desde <= hasta, span <= 12 meses. */
function normalizarRango(desdeRaw: string | null, hastaRaw: string | null) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  let hasta = hastaRaw && re.test(hastaRaw) ? hastaRaw : hoyISO();
  let desde = desdeRaw && re.test(desdeRaw) ? desdeRaw : primerDiaMesISO();
  if (desde > hasta) desde = hasta;
  const span = (new Date(hasta).getTime() - new Date(desde).getTime()) / MS_DIA;
  if (span > RANGO_MAX_DIAS) {
    const d = new Date(new Date(hasta).getTime() - RANGO_MAX_DIAS * MS_DIA);
    desde = d.toISOString().slice(0, 10);
  }
  return { desde, hasta };
}

function resolverCompanyIds(payload: any, sedeParam: string | null) {
  const role = ((payload.role as string) || "").toLowerCase().trim();
  const isSuper = role === "superadmin" || role === "super admin";
  if (isSuper) {
    if (sedeParam && sedeParam !== "all" && /^\d+$/.test(sedeParam)) {
      return { companyIds: [parseInt(sedeParam, 10)], isSuper };
    }
    return { companyIds: COMPANY_IDS_ALL, isSuper };
  }
  const cid = Number(payload.cids);
  return { companyIds: Number.isFinite(cid) && cid > 0 ? [cid] : [], isSuper };
}

function sedesPayload(isSuper: boolean) {
  return isSuper
    ? COMPANY_IDS_ALL.map((id) => ({ id, name: COMPANY_NAME[id] || `Sede ${id}` }))
    : [];
}

export async function GET(req: NextRequest) {
  const auth = await requireRoles(req, ["gerencia de ventas"]);
  if (auth.error) return auth.error;

  try {
    const payload = auth.payload!;
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get("tipo") || "desglose";
    const { companyIds, isSuper } = resolverCompanyIds(
      payload,
      searchParams.get("sede"),
    );
    const sedes = sedesPayload(isSuper);

    if (companyIds.length === 0) {
      return NextResponse.json({
        error: "Tu usuario no tiene una sede asignada (cids).",
        sedes,
      }, { status: 400 });
    }

    if (tipo === "filtros") {
      const filtros = await cargarFiltros(companyIds);
      return NextResponse.json({ ...filtros, sedes });
    }

    if (tipo === "inactivos") {
      const mesesRaw = parseInt(searchParams.get("meses") || "3", 10);
      const meses = mesesRaw === 6 ? 6 : 3;
      const vendedorRaw = searchParams.get("vendedor");
      const vendedorUserId =
        vendedorRaw && /^\d+$/.test(vendedorRaw) ? parseInt(vendedorRaw, 10) : null;
      const clientes = await clientesInactivos({
        companyIds,
        meses,
        vendedorUserId,
      });
      return NextResponse.json({ meses, clientes, sedes });
    }

    // tipo === "desglose"
    const { desde, hasta } = normalizarRango(
      searchParams.get("desde"),
      searchParams.get("hasta"),
    );
    const vendedorRaw = searchParams.get("vendedor");
    const clienteRaw = searchParams.get("cliente");
    const marca = searchParams.get("marca");
    const vendedorUserId =
      vendedorRaw && /^\d+$/.test(vendedorRaw) ? parseInt(vendedorRaw, 10) : null;
    const clienteId =
      clienteRaw && /^\d+$/.test(clienteRaw) ? parseInt(clienteRaw, 10) : null;

    const data = await cargarDesglose({
      companyIds,
      desde,
      hasta,
      vendedorUserId,
      clienteId,
      marca,
    });

    return NextResponse.json({ periodo: { desde, hasta }, ...data, sedes });
  } catch (error: any) {
    console.error("Error en reporte-ventas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
