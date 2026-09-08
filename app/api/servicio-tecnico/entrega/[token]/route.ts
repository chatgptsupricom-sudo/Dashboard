import { NextRequest, NextResponse } from "next/server";
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { NOMBRES_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { ensureEntregaSchema, obtenerCasoPorToken, guardarEleccionEntrega } from "@/lib/rma/entrega";
import { listarAgenciasActivas } from "@/lib/rma/rutasEnvio";

// GET/POST /api/servicio-tecnico/entrega/[token]
//
// Portal público, sin sesión -- el cliente llega aca desde el link del
// correo de "tu equipo esta reparado" (issue #119). Autentica por
// tracking_token, igual que /api/servicio-tecnico/ticket/[token].

// Mensaje generico para "no existe" y "token invalido" (mismo criterio de
// privacidad que ticket/[token]/route.ts): no dar pistas de por que fallo.
const NOT_FOUND = "No encontramos ese reporte";

function tokenValido(token: string): boolean {
  return Boolean(token) && token.length >= 16 && token.length <= 64;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const bloqueo = aplicarLimites(request, "entrega-token", [
      { max: 20, ventanaSegundos: 60 },
    ]);
    if (bloqueo) return bloqueo;

    const { token } = await params;
    if (!tokenValido(token)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    await ensureEntregaSchema();
    const caso = await obtenerCasoPorToken(token);
    if (!caso) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    const agencias = await listarAgenciasActivas();

    return NextResponse.json({
      success: true,
      caso: {
        case_number: caso.case_number,
        product_name: caso.product_name,
        status: caso.status,
        sucursal_nombre: caso.company_id ? NOMBRES_SUCURSAL[caso.company_id] || null : null,
        entrega_metodo: caso.entrega_metodo,
        entrega_ciudad: caso.entrega_ciudad,
        entrega_agencia: caso.entrega_agencia,
        entrega_elegida_at: caso.entrega_elegida_at,
      },
      agencias,
    });
  } catch (error: any) {
    console.error("[entrega-token] GET error:", error.message);
    return NextResponse.json({ error: NOT_FOUND }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    // Mas estricto que el GET: esto si escribe. Un cliente real elige una
    // sola vez; 10/hora deja margen de sobra para reintentos por error de
    // red sin abrir la puerta a spamear el endpoint de guardado.
    const bloqueo = aplicarLimites(request, "entrega-elegir", [
      { max: 10, ventanaSegundos: 3600 },
    ]);
    if (bloqueo) return bloqueo;

    const { token } = await params;
    if (!tokenValido(token)) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }

    await ensureEntregaSchema();
    const caso = await obtenerCasoPorToken(token);
    if (!caso) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }

    // El equipo tiene que estar realmente reparado para elegir como
    // recibirlo -- evita que alguien con un link viejo (caso reingresado,
    // por ejemplo) elija una entrega sobre un equipo que ya no esta listo.
    if (caso.status !== "reparado") {
      return NextResponse.json(
        { error: "Tu equipo todavia no esta listo para retirar o enviar." },
        { status: 409 },
      );
    }

    // Ya eligio antes -- no se pisa la eleccion, se devuelve la que ya hay
    // (idempotente: un doble-submit o un link reabierto no rompe nada).
    if (caso.entrega_metodo) {
      return NextResponse.json({
        success: true,
        yaElegido: true,
        entrega_metodo: caso.entrega_metodo,
      });
    }

    const metodo = body?.metodo;
    if (metodo === "sucursal") {
      await guardarEleccionEntrega(caso.id, { metodo: "sucursal" });
      return NextResponse.json({ success: true, entrega_metodo: "sucursal" });
    }

    if (metodo === "ruta") {
      const ciudad = String(body?.ciudad || "").trim();
      if (!ciudad) {
        return NextResponse.json({ error: "Indica tu ciudad." }, { status: 400 });
      }
      const resultado = await guardarEleccionEntrega(caso.id, { metodo: "ruta", ciudad });
      if (!resultado.ok) {
        return NextResponse.json(
          { error: "Tu ciudad no esta cubierta por nuestras rutas de despacho. Elige retiro en sucursal o envio por agencia." },
          { status: 422 },
        );
      }
      return NextResponse.json({ success: true, entrega_metodo: "ruta", rutaNombre: resultado.rutaNombre });
    }

    if (metodo === "agencia") {
      const agencia = String(body?.agencia || "").trim();
      const nombre = String(body?.nombre || "").trim();
      const cedula = String(body?.cedula || "").trim();
      const telefono = String(body?.telefono || "").trim();
      const direccion = String(body?.direccion || "").trim();
      if (!agencia || !nombre || !cedula || !telefono || !direccion) {
        return NextResponse.json({ error: "Completa todos los datos para el envio por agencia." }, { status: 400 });
      }
      await guardarEleccionEntrega(caso.id, {
        metodo: "agencia",
        agencia,
        datos: { nombre, cedula, telefono, direccion },
      });
      return NextResponse.json({ success: true, entrega_metodo: "agencia" });
    }

    return NextResponse.json({ error: "Metodo de entrega invalido." }, { status: 400 });
  } catch (error: any) {
    console.error("[entrega-token] POST error:", error.message);
    return NextResponse.json({ error: NOT_FOUND }, { status: 500 });
  }
}
