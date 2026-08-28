import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/tickets-sin-ingreso  (issue #40)
 *
 * Tickets que el cliente creó desde el portal y que todavía no tienen un
 * ingreso registrado en el almacén.
 *
 * Es el hueco que cerraba este issue: hoy un cliente reporta una falla por
 * supricom.com.ve y en el almacén nadie se entera hasta que aparece con el
 * equipo en la mano. Esta lista es lo que le permite al Seguridad saber qué
 * está por llegar.
 *
 * Solo `origen = 'portal'`: los casos que el técnico crea a mano en el panel
 * no pasan por recepción de almacén.
 */
export async function GET(request: NextRequest) {
  const auth = await requireSeguridad(request);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  const { searchParams } = new URL(request.url);
  // Por defecto 30 días: un ticket del portal más viejo que eso y sin ingreso
  // es que el cliente no llevó el equipo, no algo pendiente de recibir.
  const dias = Math.min(
    365,
    Math.max(1, parseInt(searchParams.get("dias") || "30", 10) || 30),
  );

  try {
    // `rma_cases` no tiene columna `cids`: usa `company_id`, mismo espacio
    // numerico (9/10/7).
    const params: any[] = [dias];
    let filtroCids = "";
    if (cids !== null) {
      filtroCids = " AND c.company_id = ?";
      params.push(cids);
    }

    const result = await query(
      `SELECT c.id, c.case_number, c.client_name, c.client_phone,
              c.model, c.hardware, c.brand, c.serial, c.invoice_number,
              c.status, c.created_at,
              c.garantia_estado
         FROM rma_cases c
    LEFT JOIN seguridad_ingresos i ON i.rma_case_id = c.id
        WHERE c.origen = 'portal'
          AND i.id IS NULL
          AND c.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
          ${filtroCids}
     ORDER BY c.created_at DESC
        LIMIT 100`,
      params,
    );

    const rows = ((result as any).rows ?? []) as any[];

    return NextResponse.json({
      success: true,
      total: rows.length,
      tickets: rows.map((r) => ({
        id: r.id,
        case_number: r.case_number,
        cliente: r.client_name || "",
        telefono: r.client_phone || null,
        // `model` es el nombre del producto y `hardware` la categoría, según
        // la convención del módulo interno.
        producto: r.model || r.hardware || "",
        marca: r.brand || "",
        serial: r.serial || null,
        factura: r.invoice_number || "",
        estado: r.status,
        garantia: r.garantia_estado || null,
        reportado_at: r.created_at,
      })),
    });
  } catch (error: any) {
    // Si la tabla de ingresos no existe todavía en este entorno, esto no puede
    // tumbar el mostrador: se devuelve vacío y el resto de la pantalla sigue.
    console.error("[seguridad/tickets-sin-ingreso]", error?.message);
    return NextResponse.json({ success: true, total: 0, tickets: [] });
  }
}
