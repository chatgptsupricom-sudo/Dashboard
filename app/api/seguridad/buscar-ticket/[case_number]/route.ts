import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ case_number: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { case_number } = await params;
    if (!case_number || case_number.length > 20) {
      return NextResponse.json({ error: "case_number invalido" }, { status: 400 });
    }

    let rmaResult;
    try {
      // `model` es el nombre del producto y `hardware` la categoria, segun la
      // convencion del modulo RMA. Sin traer `model`, el alta se prellenaba
      // con la categoria: el acta de recepcion decia "PERIFERICOS" en vez de
      // "Mouse HP". Eso es lo que se firma y lo que se mira cuando un cliente
      // reclama que faltaba algo, asi que tiene que nombrar el equipo.
      //
      // El portal ya hacia esta misma distincion para lo que ve el cliente
      // (`product_name: row.model || row.hardware`); faltaba de este lado.
      //
      // `company_id` en vez de `cids`: `rma_cases` no tiene columna `cids`,
      // usa `company_id` en el mismo espacio numerico (9/10/7).
      rmaResult = await query(
        `SELECT id, case_number, client_name, model, hardware, serial,
                invoice_number, reported_fault, company_id
         FROM rma_cases
         WHERE case_number = ?`,
        [case_number],
      );
    } catch (e: any) {
      console.error("Error buscando caso RMA:", e?.message);
      return NextResponse.json({ error: "Error al buscar el ticket" }, { status: 500 });
    }

    if (rmaResult.rows.length === 0) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    const caso = rmaResult.rows[0] as any;

    // 404 y no 403: adivinar el case_number de un ticket de otra sucursal no
    // debe ni confirmar que existe.
    if (cids !== null && Number(caso.company_id) !== cids) {
      return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
    }

    // `hardware` sale ya resuelto al nombre del producto, para que quien lo
    // consuma no tenga que repetir esta decision. La categoria queda aparte
    // por si alguna pantalla la necesita.
    return NextResponse.json({
      success: true,
      case: {
        ...caso,
        hardware: caso.model || caso.hardware || "",
        categoria: caso.hardware || null,
      },
    });
  } catch (error: any) {
    console.error("Error buscando ticket:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
