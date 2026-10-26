import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { buscarFacturaConSeriales, OdooNoDisponibleError } from "@/lib/servicio-tecnico/factura";
import { buscarSerial, limpiarSerial } from "@/lib/rma/buscarSerial";
import { comprasDelProducto, facturasSmartbit, idsDeProducto, serialSmartbit } from "@/lib/rma/buscarCompras";

export const dynamic = "force-dynamic";

const SEDES = [7, 9, 10];
const comparable = (s: string) => s.trim().toUpperCase();

/**
 * GET /api/rma/buscar-factura?factura=&serial=&producto=&cliente=&sede=7|9|10
 *
 * Buscar Factura de RMA: valida si un equipo se compró en la empresa, con
 * Odoo (desde abril 2026) y Smartbit (antes). Cualquier combinación:
 * - factura: la de Odoo con sus productos, seriales y garantía
 *   (lib/servicio-tecnico/factura.ts, sin pedir RIF) y la de Smartbit con sus
 *   productos y seriales, o lo que ese cliente compró ese día si la sede no
 *   se cargó con número (lib/rma/buscarCompras.ts).
 * - serial: por dónde pasó en Odoo y el veredicto (lib/rma/buscarSerial.ts), y
 *   en qué facturas de Smartbit salió (`serialSmartbit`, sedes cargadas con
 *   serial). Con producto, solo los seriales de ese producto.
 * - producto (+ cliente): quién lo compró y cuándo, en Odoo y en Smartbit.
 * - Factura + serial: `enFactura` dice si el serial es de esa factura de Odoo
 *   (en Smartbit lo marca la pantalla con los seriales de cada producto).
 * Busca en las tres sedes salvo que se pida una. No devuelve precios ni montos.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const numero = (sp.get("factura") || "").trim();
  const serial = limpiarSerial(sp.get("serial") || "");
  const producto = (sp.get("producto") || "").trim();
  const cliente = (sp.get("cliente") || "").trim();
  const sedePedida = Number(sp.get("sede"));
  const sede = SEDES.includes(sedePedida) ? sedePedida : undefined;
  if (!numero && !serial && !producto) {
    return NextResponse.json({ error: "Escribe una factura, un serial o un producto." }, { status: 400 });
  }
  if (serial && serial.length < 3) {
    return NextResponse.json({ error: "El serial debe tener al menos 3 caracteres." }, { status: 400 });
  }
  if (producto && producto.length < 3) {
    return NextResponse.json({ error: "El producto debe tener al menos 3 caracteres." }, { status: 400 });
  }

  try {
    const productoIds = serial && producto ? (await idsDeProducto(producto)).ids : [];
    const [factura, smartbit, resultadoSerial, resultadoSerialSb, compras] = await Promise.all([
      numero ? buscarFacturaConSeriales(numero, undefined, sede) : Promise.resolve(null),
      numero ? facturasSmartbit(numero, sede) : Promise.resolve(null),
      serial ? buscarSerial(serial, productoIds) : Promise.resolve(null),
      serial ? serialSmartbit(serial, producto, sede) : Promise.resolve(null),
      producto ? comprasDelProducto(producto, cliente, sede) : Promise.resolve(null),
    ]);
    // partner_id es interno de la creación de tickets: no sale.
    const facturaPublica = factura && factura.estado === "ok" ? (({ partner_id, ...resto }) => resto)(factura) : factura;
    const enFactura =
      factura?.estado === "ok" && serial
        ? factura.items.some((i) => i.serial && comparable(i.serial) === comparable(serial))
        : null;
    return NextResponse.json({
      success: true,
      factura: facturaPublica,
      facturasSmartbit: smartbit,
      serial: resultadoSerial,
      serialSmartbit: resultadoSerialSb,
      enFactura,
      compras,
    });
  } catch (e: any) {
    if (e instanceof OdooNoDisponibleError) {
      return NextResponse.json({ error: "Odoo no respondió. Intenta de nuevo en unos minutos.", odooUnreachable: true }, { status: 502 });
    }
    console.error("[rma/buscar-factura]", e?.message);
    return NextResponse.json({ error: "No se pudo hacer la búsqueda." }, { status: 500 });
  }
}
