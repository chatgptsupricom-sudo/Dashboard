import { query } from "@/lib/db";
import { ARCHIVO_PERMITIDO, esTipoArchivo } from "@/lib/recepcion/flujo";
import { fueraDeAlcance, puedeComo, requireRecepcion } from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET    descarga/muestra un archivo (packing list o foto)
 * DELETE quita un archivo subido por error — solo mientras su etapa sigue
 *        abierta (una foto de llegada no se borra despues de registrar la llegada)
 */

async function buscar(request: NextRequest, params: Promise<{ id: string; archivoId: string }>, conData: boolean) {
  const { sesion, error } = await requireRecepcion(request);
  if (error) return { error };
  const p = await params;
  const id = parseInt(p.id, 10);
  const archivoId = parseInt(p.archivoId, 10);
  if (isNaN(id) || isNaN(archivoId)) {
    return { error: NextResponse.json({ error: "id invalido" }, { status: 400 }) };
  }
  const res = await query(
    `SELECT a.id, a.tipo, a.nombre, a.mime ${conData ? ", a.data" : ""},
            r.cids, r.etapa
       FROM recepcion_packing_archivos a
       JOIN recepcion_packing r ON r.id = a.recepcion_id
      WHERE a.id = ? AND a.recepcion_id = ?`,
    [archivoId, id],
  );
  const fila = res.rows[0] as any;
  if (!fila || fueraDeAlcance(sesion!, fila)) {
    return { error: NextResponse.json({ error: "No encontrado" }, { status: 404 }) };
  }
  return { sesion: sesion!, fila, archivoId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; archivoId: string }> },
) {
  try {
    const r = await buscar(request, params, true);
    if (r.error) return r.error;
    const { fila } = r;
    const nombre = String(fila.nombre || `archivo-${fila.id}`).replace(/[^\w.\- ]/g, "_");
    return new NextResponse(fila.data as Buffer, {
      headers: {
        "Content-Type": fila.mime,
        // Las fotos y el PDF se ven en el navegador; el Excel se descarga.
        "Content-Disposition": `${fila.mime.startsWith("image/") || fila.mime === "application/pdf" ? "inline" : "attachment"}; filename="${nombre}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e: any) {
    console.error("Error leyendo archivo de recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; archivoId: string }> },
) {
  try {
    const r = await buscar(request, params, false);
    if (r.error) return r.error;
    const { fila, sesion, archivoId } = r;
    const tipo: unknown = fila.tipo;
    if (!esTipoArchivo(tipo)) {
      return NextResponse.json({ error: "Tipo invalido" }, { status: 400 });
    }
    const regla = ARCHIVO_PERMITIDO[tipo];
    if (!puedeComo(sesion!, regla.rol)) {
      return NextResponse.json({ error: "Este archivo no le toca a tu rol" }, { status: 403 });
    }
    if (!regla.etapas.includes(fila.etapa)) {
      return NextResponse.json(
        { error: "Esta etapa ya se cerro: el archivo queda como registro" },
        { status: 409 },
      );
    }
    await query("DELETE FROM recepcion_packing_archivos WHERE id = ?", [archivoId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("Error borrando archivo de recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
