import {
  buscarFacturaConSeriales,
  OdooNoDisponibleError,
} from "@/lib/servicio-tecnico/factura";
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

    if (resultado.estado === "no_encontrada") {
      return NextResponse.json(resultado, { status: 404 });
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
