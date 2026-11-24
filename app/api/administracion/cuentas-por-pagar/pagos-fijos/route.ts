import { NextRequest, NextResponse } from "next/server";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { limitarSedesPorRol, respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { COMPANY_MAP } from "@/lib/administracion/empresas";
import { guardAdministracion, hoyCaracas, respuestaDeError } from "@/lib/administracion/lectura";
import {
  actualizarPagoFijo,
  crearPagoFijo,
  leerPagoFijo,
  quitarPagoFijo,
  validarPagoFijo,
} from "@/lib/administracion/pagosFijos";

// Pagos fijos del calendario de Cuentas por Pagar (Administracion de su sede y SuperAdmin).
//   GET    ?empresa=valencia&q=texto  -> { proveedores }  proveedores de Odoo por nombre o RIF
//   POST   { id?, empresa, mes, nombre, proveedorId, proveedor, monto, dia, notas }  crea o edita
//   DELETE ?id=                        lo quita desde el mes en curso (los meses de antes lo conservan)

/** company_id de la sede pedida, si el usuario puede usarla. */
function sedePermitida(payload: any, empresa: unknown): number | null {
  const id = COMPANY_MAP[String(empresa || "").toLowerCase().trim()];
  return id && limitarSedesPorRol(payload, [id]).length ? id : null;
}

export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  const params = new URL(request.url).searchParams;
  const sede = sedePermitida(auth.payload, params.get("empresa"));
  if (!sede) return respuestaSedeNoPermitida();
  const q = (params.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ success: true, proveedores: [] });
  try {
    const filas =
      (await callOdooRPCEstricto<any[]>(
        "res.partner",
        "search_read",
        [[["parent_id", "=", false], ["company_id", "in", [sede, false]], "|", ["name", "ilike", q], ["vat", "ilike", q]]],
        {
          fields: ["name", "vat", "supplier_rank"],
          // Primero los que ya son proveedores.
          order: "supplier_rank desc, name",
          limit: 15,
          context: { allowed_company_ids: [sede] },
        },
      )) ?? [];
    return NextResponse.json({
      success: true,
      proveedores: filas.map((p) => ({ id: p.id, nombre: p.name || "", rif: p.vat || "" })),
    });
  } catch (error) {
    return respuestaDeError(error, "buscando proveedores (pagos fijos)");
  }
}

export async function POST(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const body = await request.json().catch(() => null);
    const datos = validarPagoFijo(body);
    if (typeof datos === "string") return NextResponse.json({ success: false, error: datos }, { status: 400 });

    const id = Number(body?.id);
    if (id) {
      const actual = await leerPagoFijo(id);
      if (!actual) return NextResponse.json({ success: false, error: "Ese pago fijo no existe" }, { status: 404 });
      if (!limitarSedesPorRol(auth.payload, [actual.companyId]).length) return respuestaSedeNoPermitida();
      await actualizarPagoFijo(id, datos);
      return NextResponse.json({ success: true });
    }

    const companyId = sedePermitida(auth.payload, body?.empresa);
    if (!companyId) return respuestaSedeNoPermitida();
    const hoy = hoyCaracas().slice(0, 7);
    const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(body?.mes)) ? String(body.mes) : hoy;
    // Sale desde el mes que se esta viendo, pero nunca antes de que exista: un
    // pago fijo nuevo no deja "vencidos" en meses que ya pasaron.
    await crearPagoFijo({ companyId, ...datos }, mes > hoy ? mes : hoy, String(auth.payload?.email || ""));
    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaDeError(error, "guardando pago fijo");
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    const actual = id ? await leerPagoFijo(id) : null;
    if (!actual) return NextResponse.json({ success: false, error: "Ese pago fijo no existe" }, { status: 404 });
    if (!limitarSedesPorRol(auth.payload, [actual.companyId]).length) return respuestaSedeNoPermitida();
    await quitarPagoFijo(id, actual.desdeMes, hoyCaracas().slice(0, 7));
    return NextResponse.json({ success: true });
  } catch (error) {
    return respuestaDeError(error, "quitando pago fijo");
  }
}
