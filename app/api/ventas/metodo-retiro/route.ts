import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { listarAgenciasConSede, listarRutasConSede } from "@/lib/rma/rutasEnvio";
import { esDeLaSede } from "@/lib/ventas/metodoRetiroTipos";
import { ErrorMetodo, guardarMetodoRetiro, listarPedidosPendientes } from "@/lib/ventas/metodoRetiro";

/**
 * Sección "Método de retiro" (lib/ventas/metodoRetiro.ts).
 *
 *  - Vendedor: solo sus pedidos (sale.order.user_id = su usuario de Odoo).
 *  - Asistente de Ventas: los de todos los vendedores de su sucursal, y puede
 *    cargar el método por cualquiera de ellos. `?vendedor=<uid>` filtra.
 */
const ROLES = ["seller", "vendedor", "asistente de ventas"];

function alcance(payload: any): { error?: NextResponse; cids: number | null; vendedorUid: number | null; rol: string } {
  const rol = String(payload?.role || "").toLowerCase().trim();
  const esVendedor = rol === "seller" || rol === "vendedor";
  const cids = Number(payload?.cids);
  const tieneCids = Number.isInteger(cids) && cids > 0;
  if (rol !== "superadmin" && !tieneCids) {
    return {
      error: NextResponse.json({ error: "Tu usuario no tiene sucursal asignada" }, { status: 403 }),
      cids: null,
      vendedorUid: null,
      rol,
    };
  }
  const uid = Number(payload?.uid);
  if (esVendedor && !(Number.isInteger(uid) && uid > 0)) {
    return {
      error: NextResponse.json({ error: "Tu usuario no está enlazado a Odoo" }, { status: 403 }),
      cids: null,
      vendedorUid: null,
      rol,
    };
  }
  return { cids: tieneCids ? cids : null, vendedorUid: esVendedor ? uid : null, rol };
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;
  const a = alcance(auth.payload);
  if (a.error) return a.error;

  try {
    const filtro = parseInt(new URL(request.url).searchParams.get("vendedor") || "", 10) || null;
    const vendedorUid = a.vendedorUid ?? filtro;
    const [pedidos, rutas, agencias] = await Promise.all([
      listarPedidosPendientes({ cids: a.cids, vendedorUid }),
      listarRutasConSede(),
      listarAgenciasConSede(),
    ]);
    // Cada una con su sede (`cids`): la pantalla muestra en cada pedido las de
    // su sede. Con sucursal en la sesion, ni se mandan las de la otra.
    const deMiSede = <T extends { cids: number | null }>(xs: T[]) =>
      a.cids === null ? xs : xs.filter((x) => esDeLaSede(x.cids, a.cids));
    return NextResponse.json({
      success: true,
      pedidos,
      rutas: deMiSede(rutas),
      agencias: deMiSede(agencias),
      puedeElegirVendedor: a.vendedorUid === null,
    });
  } catch (error: any) {
    console.error("GET /api/ventas/metodo-retiro error:", error?.message);
    return NextResponse.json({ error: "No se pudieron cargar los pedidos de Odoo" }, { status: 502 });
  }
}

/** PUT: { sale_id, metodo: sucursal|ruta|encomienda, ruta_id?, agencia?, nota? } */
export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;
  const a = alcance(auth.payload);
  if (a.error) return a.error;

  try {
    const body = await request.json().catch(() => ({}));
    const saleId = parseInt(String(body.sale_id ?? ""), 10);
    if (!saleId) return NextResponse.json({ error: "sale_id requerido" }, { status: 400 });

    const fila = await guardarMetodoRetiro({
      saleId,
      metodo: body.metodo,
      rutaId: parseInt(String(body.ruta_id ?? ""), 10) || null,
      agencia: body.agencia ? String(body.agencia) : null,
      nota: body.nota ? String(body.nota) : null,
      cids: a.cids,
      vendedorUid: a.vendedorUid,
      autor: auth.payload?.name || auth.payload?.email || "Ventas",
      rol: a.rol,
    });
    return NextResponse.json({ success: true, metodo: fila });
  } catch (error: any) {
    if (error instanceof ErrorMetodo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/ventas/metodo-retiro error:", error?.message);
    return NextResponse.json({ error: "No se pudo guardar el método de retiro" }, { status: 500 });
  }
}
