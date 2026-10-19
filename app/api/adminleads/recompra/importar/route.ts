// POST /api/adminleads/recompra/importar   (multipart: archivo, sede)
//
// Sube un Excel de leads de redes o el de Smartbit "Ventas / Devoluciones" de
// una sede. Ver importarExcel() en lib/adminleads/recompra.ts.

import { importarExcel, SEDES } from "@/lib/adminleads/recompra";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    const form = await request.formData();
    const archivo = form.get("archivo");
    const sede = Number(form.get("sede"));
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (!/\.xlsx$/i.test(archivo.name)) {
      return NextResponse.json({ error: "Tiene que ser un Excel .xlsx" }, { status: 400 });
    }
    if (archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo pasa de 15 MB" }, { status: 400 });
    }
    if (!SEDES[sede]) {
      return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
    }
    if (Number(auth.payload!.cids) === 7 && sede !== 7) {
      return NextResponse.json({ error: "Solo puedes importar datos de Panamá" }, { status: 403 });
    }

    const usuario = String(auth.payload!.email || auth.payload!.name || auth.payload!.role || "");
    const resultado = await importarExcel(await archivo.arrayBuffer(), archivo.name, sede, usuario.slice(0, 160));
    return NextResponse.json({ success: true, ...resultado });
  } catch (error: any) {
    console.error("POST /api/adminleads/recompra/importar error:", error?.message);
    return NextResponse.json({ error: error?.message || "No se pudo importar" }, { status: 500 });
  }
}
