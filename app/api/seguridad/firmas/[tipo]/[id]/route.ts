import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  decodificarFirmaPng,
  esRolValido,
  esTipoValido,
  firmasDeActa,
} from "@/lib/seguridad/firmas";
import { NextRequest, NextResponse } from "next/server";

const TABLA_POR_TIPO: Record<string, string> = {
  ingreso: "seguridad_ingresos",
  despacho: "seguridad_despachos",
  mercancia: "seguridad_mercancia",
};

/** El acta existe y es de la sucursal de la sesion (null = superadmin, sin filtro). */
async function actaVisible(
  tipo: string,
  actaId: number,
  cids: number | null,
): Promise<boolean> {
  const tabla = TABLA_POR_TIPO[tipo];
  const res = await query(`SELECT id, cids FROM ${tabla} WHERE id = ?`, [actaId]);
  const fila = res.rows[0] as any;
  if (!fila) return false;
  return cids === null || Number(fila.cids) === cids;
}

/**
 * Firmas del acta de RMA: /api/seguridad/firmas/{ingreso|despacho}/{id}
 *
 * Una sola ruta para los dos tipos de acta y los cuatro roles. La alternativa
 * —ocho endpoints— es ocho sitios donde olvidar el guard, que es exactamente
 * lo que paso con /api/seguridad/almacenistas.
 *
 * GET    devuelve quien firmo y cuando, sin las imagenes.
 * POST   guarda o reemplaza la firma de un rol.
 * DELETE borra la de un rol, para rehacerla si salio mal.
 */

const MAX_FIRMA_BYTES = 1024 * 1024; // 1 MB: un trazo de canvas pesa unos pocos KB

function parsearParams(tipo: string, id: string) {
  if (!esTipoValido(tipo)) return { error: "tipo de acta invalido" };
  const actaId = parseInt(id, 10);
  if (isNaN(actaId) || actaId <= 0) return { error: "id invalido" };
  return { tipo, actaId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string; id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { tipo, id } = await params;
    const p = parsearParams(tipo, id);
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });

    if (!(await actaVisible(p.tipo!, p.actaId!, cids))) {
      return NextResponse.json({ error: "El acta no existe" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      firmas: await firmasDeActa(p.tipo!, p.actaId!),
    });
  } catch (error: any) {
    console.error("Error listando firmas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string; id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { tipo, id } = await params;
    const p = parsearParams(tipo, id);
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    if (!esRolValido(body?.rol)) {
      return NextResponse.json(
        { error: "rol invalido: tecnico, almacen, seguridad o cliente" },
        { status: 400 },
      );
    }

    const nombre = String(body?.firmante_nombre || "").trim().slice(0, 200);
    if (!nombre) {
      // Sin nombre la firma no vale para nada: un trazo anonimo no identifica
      // a nadie en una discusion con un cliente.
      return NextResponse.json(
        { error: "firmante_nombre es obligatorio" },
        { status: 400 },
      );
    }

    const decodificada = decodificarFirmaPng(
      typeof body?.firma_data_url === "string" ? body.firma_data_url.trim() : "",
    );
    if (!decodificada) {
      return NextResponse.json(
        { error: "Solo se permite firma en formato PNG" },
        { status: 400 },
      );
    }
    if (decodificada.buffer.length > MAX_FIRMA_BYTES) {
      return NextResponse.json({ error: "Firma demasiado grande" }, { status: 400 });
    }

    // Que el acta exista Y sea de la sucursal de la sesion antes de colgarle
    // una firma. Sin esto quedarian firmas huerfanas apuntando a actas que
    // nunca se crearon, o alguien firmando un acta de otra sucursal.
    if (!(await actaVisible(p.tipo!, p.actaId!, cids))) {
      return NextResponse.json({ error: "El acta no existe" }, { status: 404 });
    }

    // Reemplaza si ese rol ya habia firmado: firmar de nuevo corrige, no
    // acumula. Dos firmas del mismo rol y nadie sabria cual vale.
    await query(
      `INSERT INTO seguridad_firmas
         (acta_tipo, acta_id, rol, firmante_nombre, firma_data, firma_mime, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         firmante_nombre = VALUES(firmante_nombre),
         firma_data = VALUES(firma_data),
         firma_mime = VALUES(firma_mime),
         created_at = CURRENT_TIMESTAMP`,
      [p.tipo, p.actaId, body.rol, nombre, decodificada.buffer, decodificada.mime, cids],
    );

    return NextResponse.json({
      success: true,
      rol: body.rol,
      size: decodificada.buffer.length,
      firmas: await firmasDeActa(p.tipo!, p.actaId!),
    });
  } catch (error: any) {
    console.error("Error guardando firma:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string; id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { tipo, id } = await params;
    const p = parsearParams(tipo, id);
    if (p.error) return NextResponse.json({ error: p.error }, { status: 400 });

    if (!(await actaVisible(p.tipo!, p.actaId!, cids))) {
      return NextResponse.json({ error: "El acta no existe" }, { status: 404 });
    }

    const rol = new URL(request.url).searchParams.get("rol");
    if (!esRolValido(rol)) {
      return NextResponse.json({ error: "rol invalido" }, { status: 400 });
    }

    await query(
      "DELETE FROM seguridad_firmas WHERE acta_tipo = ? AND acta_id = ? AND rol = ?",
      [p.tipo, p.actaId, rol],
    );

    return NextResponse.json({
      success: true,
      firmas: await firmasDeActa(p.tipo!, p.actaId!),
    });
  } catch (error: any) {
    console.error("Error borrando firma:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
