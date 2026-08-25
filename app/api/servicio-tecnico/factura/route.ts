import {
  buscarFacturaConSeriales,
  OdooNoDisponibleError,
} from "@/lib/servicio-tecnico/factura";
import { aplicarLimites, obtenerIp } from "@/lib/servicio-tecnico/limites";
import { NextResponse } from "next/server";

/**
 * GET /api/servicio-tecnico/factura?numero=5037537[&rif=J317376900]
 *
 * Endpoint PÚBLICO (sin sesión) del portal de servicio técnico: con el número
 * de factura devuelve el cliente y los productos/seriales que puede reportar.
 *
 * Ojo al tocarlo: como no pide autenticación, todo lo que devuelva queda
 * expuesto. No agregar montos, precios ni direcciones. El teléfono y el email
 * salen enmascarados a propósito. El límite de peticiones y el captcha van en
 * el issue #25; hasta que eso exista, este endpoint no debería publicarse.
 */
export async function GET(request: Request) {
  // El endpoint más apetecible de todos: con él se enumeran facturas y se
  // sacan nombres de clientes. Dos ventanas — la corta corta la ráfaga, la
  // larga el goteo sostenido, que es como se raspa un catálogo sin que se note.
  const bloqueo = aplicarLimites(request, "factura", [
    { max: 10, ventanaSegundos: 60 },
    { max: 50, ventanaSegundos: 3600 },
  ]);
  if (bloqueo) return bloqueo;

  const { searchParams } = new URL(request.url);
  const numero = searchParams.get("numero") || "";
  const rif = searchParams.get("rif") || undefined;

  if (!numero.trim()) {
    return NextResponse.json(
      { estado: "invalida", error: "Falta el número de factura" },
      { status: 400 },
    );
  }

  try {
    const resultado = await buscarFacturaConSeriales(numero, rif);

    // Registro para poder detectar que alguien está raspando. Sin esto no hay
    // forma de enterarse: un raspado sostenido y por debajo del límite se ve
    // igual que tráfico normal. Se guarda el número consultado y si acertó,
    // que es lo que dibuja el patrón; no se guardan datos del cliente.
    console.info(
      `[factura] ip=${obtenerIp(request)} numero=${numero.slice(0, 32)} resultado=${resultado.estado}`,
    );

    if (resultado.estado === "no_encontrada") {
      return NextResponse.json(resultado, { status: 404 });
    }

    if (resultado.estado === "ok") {
      // `partner_id` es para uso interno (la creación del ticket lo guarda).
      // Fuera de la respuesta pública: mientras menos devuelva este endpoint,
      // menos vale raspar facturas ajenas.
      const { partner_id: _omitido, ...publico } = resultado;
      return NextResponse.json(publico);
    }

    return NextResponse.json(resultado);
  } catch (error) {
    // Al cliente nunca le llega el detalle: los mensajes de Odoo describen la
    // estructura interna. El detalle queda en el log del servidor.
    console.error(
      "GET /api/servicio-tecnico/factura:",
      error instanceof Error ? error.message : error,
    );

    const noDisponible = error instanceof OdooNoDisponibleError;
    return NextResponse.json(
      {
        estado: "error",
        error: noDisponible
          ? "No pudimos consultar la factura en este momento. Intenta de nuevo en unos minutos."
          : "Ocurrió un error procesando la consulta.",
      },
      { status: noDisponible ? 503 : 500 },
    );
  }
}
