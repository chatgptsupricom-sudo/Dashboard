import { query } from "@/lib/db";
import { ARCHIVO_PERMITIDO, esTipoArchivo } from "@/lib/recepcion/flujo";
import {
  cargarRecepcion,
  detectarMime,
  esImagen,
  fueraDeAlcance,
  puedeComo,
  requireRecepcion,
} from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/recepcion/[id]/archivos   multipart: tipo, archivo, item_id (solo foto_golpe)
 *
 * Quien sube que y cuando lo decide ARCHIVO_PERMITIDO (lib/recepcion/flujo):
 * Compras el packing list antes de que llegue; Almacen cada foto en su etapa.
 * Las fotos llegan ya comprimidas desde el telefono (ver FotoCaptura).
 */

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    const datos = await cargarRecepcion(id);
    if (!datos || fueraDeAlcance(sesion!, datos.recepcion)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Formulario invalido" }, { status: 400 });
    }

    const tipo = String(form.get("tipo") || "");
    if (!esTipoArchivo(tipo)) {
      return NextResponse.json({ error: "Tipo de archivo invalido" }, { status: 400 });
    }
    const regla = ARCHIVO_PERMITIDO[tipo];
    if (!puedeComo(sesion!, regla.rol)) {
      return NextResponse.json({ error: "Este archivo no le toca a tu rol" }, { status: 403 });
    }
    // Las fotos de llegada/precinto/cierre son de un contenedor y se miran
    // contra la etapa de ESE contenedor; el resto, contra la del packing list.
    let contenedorId: number | null = null;
    let etapaQueManda = datos.recepcion.etapa;
    if (regla.nivel === "contenedor") {
      contenedorId = Number(form.get("contenedor_id"));
      const cont = datos.contenedores.find((c) => Number(c.id) === contenedorId);
      if (!cont) return NextResponse.json({ error: "Contenedor invalido" }, { status: 400 });
      etapaQueManda = cont.etapa;
    }
    if (!regla.etapas.includes(etapaQueManda)) {
      return NextResponse.json(
        { error: "Ya no se puede subir este archivo en esta etapa" },
        { status: 409 },
      );
    }

    let itemId: number | null = null;
    if (tipo === "foto_golpe") {
      itemId = Number(form.get("item_id"));
      if (!datos.items.some((i) => Number(i.id) === itemId)) {
        return NextResponse.json({ error: "Renglon invalido" }, { status: 400 });
      }
    }

    const archivo = form.get("archivo");
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }
    if (archivo.size === 0 || archivo.size > MAX_BYTES) {
      return NextResponse.json({ error: "El archivo pesa mas de 10 MB" }, { status: 413 });
    }
    const buf = Buffer.from(await archivo.arrayBuffer());
    const mime = detectarMime(buf);
    if (!mime) {
      return NextResponse.json(
        { error: "Formato no admitido (usa foto, PDF o Excel)" },
        { status: 415 },
      );
    }
    // Las fotos tienen que ser fotos; el packing list puede ser PDF, Excel o
    // una foto del papel.
    if (tipo !== "packing_list" && !esImagen(mime)) {
      return NextResponse.json({ error: "Tiene que ser una foto" }, { status: 415 });
    }

    try {
      const res = await query(
        `INSERT INTO recepcion_packing_archivos
           (recepcion_id, item_id, contenedor_id, tipo, nombre, mime, tamano, data, subido_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          itemId,
          contenedorId,
          tipo,
          String(archivo.name || "").slice(0, 200) || null,
          mime,
          buf.length,
          buf,
          sesion!.nombre,
        ],
      );
      return NextResponse.json(
        {
          success: true,
          archivo: {
            id: Number((res.rows as any)?.insertId),
            item_id: itemId,
            contenedor_id: contenedorId,
            tipo,
            nombre: archivo.name,
            mime,
            tamano: buf.length,
            subido_por: sesion!.nombre,
          },
        },
        { status: 201 },
      );
    } catch (e: any) {
      // La base rechaza paquetes mas grandes que max_allowed_packet: se
      // explica en vez de devolver un 500 mudo.
      if (e?.code === "ER_NET_PACKET_TOO_LARGE" || /max_allowed_packet/i.test(e?.message || "")) {
        return NextResponse.json(
          { error: "El archivo es demasiado grande para la base de datos. Prueba con uno mas liviano." },
          { status: 413 },
        );
      }
      throw e;
    }
  } catch (e: any) {
    console.error("Error subiendo archivo de recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
