import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { ErrorFlyer, cancelarSolicitud, crearSolicitud, listarSolicitudes } from "@/lib/banco-imagenes/solicitudes";
import { avisarFlyer } from "@/lib/banco-imagenes/avisoSolicitud";
import { ROLES_VENDEDOR_FLYERS, nombreDe, sedeDe, vendedorDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

function falla(e: any, que: string) {
  if (e instanceof ErrorFlyer) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`Solicitudes de flyers (${que}):`, e);
  return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
}

async function sesionVendedor(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_VENDEDOR_FLYERS);
  if (auth.error) return { error: auth.error };
  const vendedorId = vendedorDe(auth.payload);
  if (!vendedorId) return { error: NextResponse.json({ error: "Sesión sin usuario" }, { status: 403 }) };
  return { payload: auth.payload, vendedorId };
}

/** Las solicitudes del vendedor que consulta, nunca las de otro. */
export async function GET(request: NextRequest) {
  const s = await sesionVendedor(request);
  if (s.error) return s.error;
  try {
    const solicitudes = await listarSolicitudes({ cids: null, vendedorId: s.vendedorId });
    return NextResponse.json({ success: true, solicitudes });
  } catch (e) {
    return falla(e, "listar");
  }
}

export async function POST(request: NextRequest) {
  const s = await sesionVendedor(request);
  if (s.error) return s.error;
  try {
    const body = await request.json();
    const creada = await crearSolicitud({
      cids: sedeDe(s.payload),
      vendedorId: s.vendedorId!,
      vendedorNombre: nombreDe(s.payload),
      tipo: body?.tipo === "categoria" ? "categoria" : "productos",
      productos: Array.isArray(body?.productos) ? body.productos.map(Number) : [],
      categoriaId: Number(body?.categoriaId) || null,
      urgencia: body?.urgencia === "alta" ? "alta" : "normal",
      paraCuando: body?.paraCuando ? String(body.paraCuando) : null,
      motivo: String(body?.motivo || ""),
    });
    // Si todo ya estaba aprobado para otros vendedores, no hay nada que revisar.
    if (creada.estado === "pendiente") avisarFlyer("creada", creada.id, getPublicOrigin(request));
    return NextResponse.json({ success: true, ...creada });
  } catch (e) {
    return falla(e, "crear");
  }
}

/** Cancelar una solicitud propia que nadie ha revisado. */
export async function PATCH(request: NextRequest) {
  const s = await sesionVendedor(request);
  if (s.error) return s.error;
  try {
    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    if (body?.accion !== "cancelar") return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    await cancelarSolicitud({ id, cids: null, vendedorId: s.vendedorId!, usuario: nombreDe(s.payload) });
    return NextResponse.json({ success: true });
  } catch (e) {
    return falla(e, "cancelar");
  }
}
