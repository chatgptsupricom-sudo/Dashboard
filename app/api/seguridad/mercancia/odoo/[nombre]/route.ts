import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { metodosEvaluados } from "@/lib/ventas/metodoRetiro";
import {
  buscarFacturaCompra,
  buscarPickingEgreso,
  motivoOrdenNoLista,
} from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/odoo/{nombre}?tipo=ingreso|egreso[&id=<picking>]
 *
 * Trae de Odoo el documento con el que viaja la mercancia y sus lineas, para
 * prellenar el acta:
 *
 *   egreso  -> orden de despacho (stock.picking, entrega/outgoing). Ej: CENT1/OUT/06321
 *   ingreso -> factura de la orden de compra (account.move, in_invoice). Ej: FACTU/2026/08/0064
 *
 * El ingreso sigue por factura — Seguridad no maneja el picking de ingreso en
 * el dia a dia. El egreso paso de factura de venta a picking porque la
 * factura no decia si el almacen ya habia alistado el pedido.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nombre: string }> },
) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { nombre } = await params;
    const sp = new URL(request.url).searchParams;
    const tipo = sp.get("tipo");
    // Id del picking, cuando se llega desde la lista de pendientes: el nombre
    // se repite entre compañias y, sin sucursal (superadmin), no alcanza.
    const pickingId = Number(sp.get("id"));
    const buscado = decodeURIComponent(nombre);

    // El ingreso (factura de compra) sigue siendo exclusivo de Seguridad —
    // Almacen solo busca facturas de venta para el egreso.
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    if (tipo === "ingreso" && rol !== "seguridad" && rol !== "superadmin") {
      return NextResponse.json(
        { error: "El ingreso de mercancia lo registra Seguridad" },
        { status: 403 },
      );
    }

    const factura =
      tipo === "ingreso"
        ? await buscarFacturaCompra(buscado, cids)
        : await buscarPickingEgreso(buscado, cids, Number.isInteger(pickingId) ? pickingId : null);

    if (!factura) {
      return NextResponse.json(
        {
          error:
            tipo === "ingreso"
              ? "No encontramos esa factura de compra"
              : "No encontramos esa orden de despacho",
        },
        { status: 404 },
      );
    }

    // Solo una orden Lista, o Hecha desde el corte (Almacén ya la validó y
    // falta que salga), en Odoo: cancelada, esperando inventario o validada
    // antes del corte no se registra. El POST lo vuelve a comprobar.
    if (tipo !== "ingreso") {
      const noLista = motivoOrdenNoLista((factura as any).estado || "", (factura as any).fecha_hecho);
      if (noLista) {
        return NextResponse.json({ error: noLista.mensaje, codigo: noLista.codigo }, { status: 409 });
      }
    }

    // Una orden sin facturar no se arma (issue #298): se avisa y no se deja
    // seguir. El POST del egreso lo vuelve a comprobar por su cuenta.
    if (tipo !== "ingreso" && (factura.facturas || []).length === 0) {
      return NextResponse.json(
        { error: "Esta orden todavía no está facturada", codigo: "sin_factura" },
        { status: 409 },
      );
    }

    // Egreso: el método de retiro que cargó el vendedor para el pedido.
    if (tipo !== "ingreso") {
      const saleId = (factura as any).odoo_sale_id as number | null;
      const metodo = saleId ? (await metodosEvaluados([saleId]).catch(() => new Map())).get(saleId) : null;
      return NextResponse.json({ success: true, picking: { ...factura, metodo_retiro: metodo || null } });
    }
    return NextResponse.json({ success: true, picking: factura });
  } catch (error: any) {
    console.error("Error buscando factura en Odoo:", error);
    return NextResponse.json(
      { error: "No se pudo consultar Odoo" },
      { status: 502 },
    );
  }
}
