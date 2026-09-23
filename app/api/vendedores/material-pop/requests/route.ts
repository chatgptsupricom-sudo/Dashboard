import { requireVendedorValencia } from "@/lib/adminleads/material-pop/auth";
import {
  ErrorSolicitud,
  cancelarSolicitud,
  crearSolicitud,
  leerOrden,
  listarSolicitudes,
} from "@/lib/adminleads/material-pop/requests";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** cids del vendedor. superAdmin prueba como Valencia. */
function cidsDe(payload: any): number {
  const cids = Number(payload?.cids);
  return Number.isFinite(cids) && cids > 0 ? cids : 9;
}

/**
 * Id del vendedor en el panel. El token lo trae en `sub` (id de users_config,
 * como string); `uid` es el id de Odoo, que va aparte.
 */
const idDe = (payload: any): number | null => {
  const id = Number(payload?.sub);
  return Number.isFinite(id) ? id : null;
};

/** Las solicitudes del vendedor que consulta, nunca las de otro. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireVendedorValencia(request);
    if (auth.error) return auth.error;

    const solicitudes = await listarSolicitudes({
      cids: cidsDe(auth.payload),
      sellerUserId: idDe(auth.payload),
    });

    return NextResponse.json({ success: true, requests: solicitudes });
  } catch (error: any) {
    console.error("Error listando solicitudes POP del vendedor:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireVendedorValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const cids = cidsDe(auth.payload);
    const clientId = Number(body?.clientId);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return NextResponse.json({ error: "Selecciona un cliente de Odoo" }, { status: 400 });
    }

    const condicion = body?.deliveryCondition === "al_comprar" ? "al_comprar" : "inmediata";
    const ordenNombre = String(body?.odooOrderName || "").trim() || null;

    // La orden se valida contra Odoo: que exista, que sea de la sede y que sea
    // del mismo cliente. Si no, la referencia no sirve para nada cuando el
    // adminLeads la abra.
    if (ordenNombre) {
      const orden = await leerOrden(ordenNombre, [cids]);
      if (!orden) {
        return NextResponse.json(
          { error: `La orden ${ordenNombre} no existe en Odoo para esta sede` },
          { status: 400 },
        );
      }
      if (orden.clienteId && orden.clienteId !== clientId) {
        return NextResponse.json(
          { error: `La orden ${ordenNombre} es de ${orden.cliente}, no del cliente elegido` },
          { status: 400 },
        );
      }
    }

    const items = Array.isArray(body?.items)
      ? body.items.map((it: any) => ({
          productId: Number(it?.productId),
          quantity: Number(it?.quantity),
        }))
      : [];

    const creada = await crearSolicitud({
      cids,
      sellerUserId: idDe(auth.payload),
      sellerName: String(auth.payload?.name || "Vendedor"),
      sellerOdooId: Number(auth.payload?.uid) || null,
      clientId,
      clientName: String(body?.clientName || ""),
      deliveryCondition: condicion,
      odooOrderName: ordenNombre,
      notes: body?.notes ? String(body.notes).slice(0, 2000) : null,
      items,
    });

    return NextResponse.json({ success: true, ...creada });
  } catch (error: any) {
    if (error instanceof ErrorSolicitud) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error creando solicitud POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Cancelar una solicitud propia que siga pendiente. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireVendedorValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const id = Number(body?.id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    }
    if (body?.action !== "cancelar") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }

    await cancelarSolicitud({
      id,
      cids: cidsDe(auth.payload),
      sellerUserId: idDe(auth.payload),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof ErrorSolicitud) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error cancelando solicitud POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
