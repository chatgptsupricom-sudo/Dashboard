import { query } from "@/lib/db";
import { requireRmaOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";
import { leerProductosIngreso } from "@/lib/seguridad/productosEnvio";



export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // RMA tambien puede leer esta acta (issue de verificacion de ingreso):
    // llama al cliente y confirma que el ingreso quedo bien hecho antes de
    // intervenir el equipo. Sigue siendo solo lectura — capturar firmas y
    // calificar al almacenista requieren `requireSeguridad` exclusivo.
    const auth = await requireRmaOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { id } = await params;
    const ingresoId = parseInt(id, 10);
    if (isNaN(ingresoId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const ingresoResult = await query(
      "SELECT * FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );

    if (ingresoResult.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    const ingreso = ingresoResult.rows[0];

    // 404 y no 403: adivinar un id de otra sucursal no debe ni confirmar que
    // existe.
    if (cids !== null && Number((ingreso as any).cids) !== cids) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    let rmaCase: any = null;
    if (ingreso.rma_case_id) {
      try {
        const rmaResult = await query(
          // El telefono se lee del ticket y NO se copia a seguridad_ingresos:
          // duplicarlo significaria que el dia que el cliente lo corrija en
          // RMA, el acta siga mostrando el viejo. Aqui hace falta para poder
          // llamar al cliente cuando el equipo lleva dias sin retirar, sin
          // tener que salir del modulo a buscarlo.
          //
          // `SELECT *` y se elige despues: `producto_externo` la crea el portal
          // la primera vez y una base sin ella no debe tumbar el detalle.
          `SELECT * FROM rma_cases WHERE id = ?`,
          [ingreso.rma_case_id],
        );
        if (rmaResult.rows.length > 0) {
          const c = rmaResult.rows[0] as any;
          rmaCase = {
            id: c.id,
            case_number: c.case_number,
            status: c.status,
            invoice_number: c.invoice_number,
            client_phone: c.client_phone,
            garantia_estado: c.garantia_estado ?? null,
            garantia_meses: c.garantia_meses ?? null,
            garantia_vence: c.garantia_vence ?? null,
            garantia_marca: c.garantia_marca ?? null,
            // Equipo que no se compro en Supricom: sin factura ni garantia nuestra.
            producto_externo: Number(c.producto_externo) === 1,
            // Como eligio el cliente recibir el equipo (portal): define quien
            // firma el despacho. null = no eligio (retira en sucursal).
            entrega_metodo: c.entrega_metodo ?? null,
            entrega_ciudad: c.entrega_ciudad ?? null,
            entrega_agencia: c.entrega_agencia ?? null,
            client_name: c.client_name ?? null,
            model: c.model ?? null,
            hardware: c.hardware ?? null,
            serial: c.serial ?? c.serial_quantity ?? null,
          };
        }
      } catch (e: any) {
        console.warn("rma_cases no disponible para join:", e?.message);
      }
    }

    let calificacion: any = null;
    try {
      const calResult = await query(
        `SELECT id, calificacion, comentario, calificado_por, created_at
         FROM seguridad_calificaciones
         WHERE relacionado_a = 'ingreso' AND relacionado_id = ? AND almacenista_nombre = ?
         ORDER BY created_at DESC LIMIT 1`,
        [ingresoId, ingreso.recibido_por],
      );
      if (calResult.rows.length > 0) {
        const row = calResult.rows[0] as any;
        calificacion = {
          id: row.id,
          calificacion: Number(row.calificacion),
          comentario: row.comentario ?? null,
          calificado_por: row.calificado_por ?? null,
          created_at: row.created_at,
        };
      }
    } catch (e: any) {
      console.warn("seguridad_calificaciones no disponible:", e?.message);
    }

    // Lo que se revisó de cada producto del envío (issue #331) y si ya salió.
    let productos: any[] = [];
    try {
      productos = await leerProductosIngreso(ingresoId);
    } catch (e: any) {
      console.warn("seguridad_ingreso_items no disponible:", e?.message);
    }

    return NextResponse.json({ success: true, ingreso, rma_case: rmaCase, calificacion, productos });
  } catch (error: any) {
    console.error("Error obteniendo ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
