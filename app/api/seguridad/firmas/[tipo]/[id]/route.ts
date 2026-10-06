import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  decodificarFirmaPng,
  esRolValido,
  esTipoValido,
  firmasDeActa,
} from "@/lib/seguridad/firmas";
import { verificarClaveSeguridad } from "@/lib/seguridad/clavePersonal";
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
 * POST   guarda la firma de un rol. Una vez guardada NO se puede rehacer
 *        (#49): el acta es la prueba de la empresa y una firma que se puede
 *        reescribir no prueba nada. Solo `superadmin` puede sobrescribir, como
 *        via de correccion para un error real.
 * DELETE borra la de un rol. Solo `superadmin`.
 */

const MAX_FIRMA_BYTES = 1024 * 1024; // 1 MB: un trazo de canvas pesa unos pocos KB

/**
 * Quién firma qué: cada rol firma SOLO la suya, desde su propio panel.
 * Seguridad da fe en el mostrador y, si el cliente retira en persona, le pasa
 * su computadora para que firme él. RMA firma la del técnico y Almacén la
 * suya (opcional). superadmin puede todas, como vía de corrección.
 */
const FIRMA_DEL_ROL: Record<string, string[]> = {
  seguridad: ["seguridad", "cliente"],
  rma: ["tecnico"],
  almacen: ["almacen"],
};
const PANEL_DE_FIRMA: Record<string, string> = {
  tecnico: "RMA",
  almacen: "Almacén",
  seguridad: "Seguridad",
  cliente: "Seguridad",
};

function rolDeSesion(payload: any): string {
  return String(payload?.role || "").toLowerCase().trim();
}

/**
 * El nombre de quien firma sale del catálogo de personal de su rol (se elige
 * de una lista en el panel). Si el catálogo está vacío o no existe en esta
 * base, no se bloquea: se acepta el nombre escrito.
 */
async function nombreDelCatalogo(rol: string, nombre: string, cids: number | null): Promise<boolean> {
  try {
    let lista: any[] = [];
    if (rol === "tecnico" || rol === "seguridad") {
      const r = await query(
        `SELECT nombre FROM seguridad_catalogo_personal WHERE rol = ? AND activo = 1`,
        [rol === "tecnico" ? "rma" : "seguridad"],
      );
      lista = r.rows as any[];
    } else if (rol === "almacen") {
      const r = await query(
        `SELECT nombre FROM seguridad_catalogo_almacenistas ${cids !== null ? "WHERE cids = ?" : ""}`,
        cids !== null ? [cids] : [],
      );
      lista = r.rows as any[];
    } else {
      return true; // el cliente escribe su nombre
    }
    if (!lista.length) return true;
    const buscado = nombre.trim().toLowerCase();
    return lista.some((x) => String(x.nombre).trim().toLowerCase() === buscado);
  } catch {
    return true;
  }
}

function parsearParams(tipo: string, id: string) {
  if (!esTipoValido(tipo)) return { error: "tipo de acta invalido" };
  const actaId = parseInt(id, 10);
  if (isNaN(actaId) || actaId <= 0) return { error: "id invalido" };
  return { tipo, actaId };
}

function esSuperadmin(payload: any): boolean {
  return String(payload?.role || "").toLowerCase().trim() === "superadmin";
}

async function rolYaFirmo(
  tipo: string,
  actaId: number,
  rol: string,
): Promise<boolean> {
  const res = await query(
    "SELECT 1 FROM seguridad_firmas WHERE acta_tipo = ? AND acta_id = ? AND rol = ? LIMIT 1",
    [tipo, actaId, rol],
  );
  return res.rows.length > 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tipo: string; id: string }> },
) {
  try {
    const { tipo, id } = await params;

    // Solo el ingreso se abre a RMA (verifica que el acta tenga las 4
    // firmas antes de intervenir el equipo). Despacho y mercancia son cosa
    // de Almacen/Seguridad y siguen exclusivos.
    // Las actas de RMA las ven los tres roles que firman: Seguridad, RMA y
    // Almacén. La de mercancía sigue siendo de Seguridad.
    const auth = tipo === "mercancia"
      ? await requireSeguridad(request)
      : await requireRoles(request, ["seguridad", "rma", "almacen"]);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

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
    const { tipo, id } = await params;
    const auth = tipo === "mercancia"
      ? await requireSeguridad(request)
      : await requireRoles(request, ["seguridad", "rma", "almacen"]);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

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

    // Cada rol firma solo la suya (ver FIRMA_DEL_ROL).
    const sesion = rolDeSesion(auth.payload);
    if (sesion !== "superadmin" && !(FIRMA_DEL_ROL[sesion] || []).includes(body.rol)) {
      return NextResponse.json(
        { error: `Esa firma se hace desde el panel de ${PANEL_DE_FIRMA[body.rol] || "su rol"}.` },
        { status: 403 },
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

    // Acta del despacho de mercancía, firma de Seguridad: con la clave
    // personal, no con un trazo (firmar con el dedo desde la laptop no
    // funcionaba). Se guarda sin imagen (firma_mime 'clave'); esa acta no
    // tiene comprobante con imágenes. Las actas de RMA siguen con el trazo.
    const porClave = p.tipo === "mercancia" && body.rol === "seguridad";
    let decodificada: { buffer: Buffer; mime: string } | null = null;
    if (porClave) {
      decodificada = { buffer: Buffer.alloc(0), mime: "clave" };
    } else {
      decodificada = decodificarFirmaPng(
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
    }

    if (!(await nombreDelCatalogo(body.rol, nombre, cids))) {
      return NextResponse.json(
        { error: "Elige de la lista a la persona que firma." },
        { status: 400 },
      );
    }

    // Que el acta exista Y sea de la sucursal de la sesion antes de colgarle
    // una firma. Sin esto quedarian firmas huerfanas apuntando a actas que
    // nunca se crearon, o alguien firmando un acta de otra sucursal.
    if (!(await actaVisible(p.tipo!, p.actaId!, cids))) {
      return NextResponse.json({ error: "El acta no existe" }, { status: 404 });
    }

    // Una firma guardada es definitiva (#49). Reescribirla dejaria el acta sin
    // valor de prueba. Solo superadmin puede, como correccion de un error real.
    if (!esSuperadmin(auth.payload) && (await rolYaFirmo(p.tipo!, p.actaId!, body.rol))) {
      return NextResponse.json(
        { error: "Esa firma ya se guardo y no se puede rehacer." },
        { status: 409 },
      );
    }

    // La clave al final, cuando todo lo demas esta bien: asi solo cuentan
    // como intento fallido las claves equivocadas.
    if (porClave) {
      const v = await verificarClaveSeguridad(nombre, cids, body?.clave);
      if (!v.ok) return NextResponse.json({ error: v.motivo }, { status: v.status });
    }

    // Reemplaza si ese rol ya habia firmado (solo llega aca superadmin): dos
    // firmas del mismo rol y nadie sabria cual vale.
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

    // Borrar una firma guardada solo lo puede superadmin (#49). Para Seguridad
    // la firma es definitiva una vez hecha.
    if (!esSuperadmin(auth.payload)) {
      return NextResponse.json(
        { error: "Una firma guardada no se puede borrar." },
        { status: 403 },
      );
    }

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
