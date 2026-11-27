import { NextRequest, NextResponse } from "next/server";
import { alcanceRotacion } from "@/lib/rotacion-inventario/alcance";
import { ErrorSolicitud, borrarContacto, guardarContacto, listarContactos } from "@/lib/rotacion-inventario/solicitudes";

export const dynamic = "force-dynamic";

/**
 * Contactos de las marcas (a quién se le manda la solicitud): GET los ven
 * todos los que entran al módulo;
 * PUT {marca, companyId (0 = todas), nombre, correos, cc, notas} y
 * DELETE ?id= solo SuperAdmin y Oscar de Compras.
 */
export async function GET(request: NextRequest) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  let contactos = await listarContactos();
  if (a.marcas) contactos = contactos.filter((c) => a.marcas!.includes(c.marca));
  return NextResponse.json({ contactos });
}

export async function PUT(request: NextRequest) {
  const a = await alcanceRotacion(request, { soloEdita: true });
  if (a.error) return a.error;
  const body = await request.json().catch(() => ({}));
  try {
    await guardarContacto(body, a.usuario);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof ErrorSolicitud) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[rotacion-inventario/contactos]", e?.message);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const a = await alcanceRotacion(request, { soloEdita: true });
  if (a.error) return a.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!(id > 0)) return NextResponse.json({ error: "Contacto inválido" }, { status: 400 });
  await borrarContacto(id);
  return NextResponse.json({ ok: true });
}
