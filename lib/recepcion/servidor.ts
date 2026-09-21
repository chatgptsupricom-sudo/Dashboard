import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * Piezas de servidor de la recepcion por packing list: quien entra, que
 * sucursal ve, como se carga un registro y como se avisa en vivo.
 */

export type Sesion = {
  payload: any;
  rol: "compras" | "almacen" | "superadmin";
  /** Sucursal a la que se limita la sesion; null = todas. */
  cids: number | null;
  nombre: string;
};

/**
 * Entran Compras (carga los packing list, de cualquier sucursal: compra para
 * las tres) y Almacen (solo su sucursal). superadmin ve todo. Seguridad ya no
 * participa del ingreso de mercancia.
 */
export async function requireRecepcion(
  request: NextRequest,
): Promise<{ sesion?: Sesion; error?: NextResponse }> {
  const auth = await requireRoles(request, ["compras", "almacen"]);
  if (auth.error) return { error: auth.error };

  const rolCrudo = String(auth.payload?.role || "").toLowerCase().trim();
  const rol = (rolCrudo === "superadmin" ? "superadmin" : rolCrudo) as Sesion["rol"];
  const nombre = String(auth.payload?.name || auth.payload?.email || rol).slice(0, 200);

  if (rol === "almacen") {
    const cids = Number(auth.payload?.cids);
    if (!Number.isFinite(cids) || cids <= 0) {
      // Sin sucursal asignada no se le muestra nada: lo contrario seria
      // mostrarle las tres por un dato mal cargado.
      return {
        error: NextResponse.json(
          { error: "Tu usuario no tiene sucursal asignada" },
          { status: 403 },
        ),
      };
    }
    return { sesion: { payload: auth.payload, rol, cids, nombre } };
  }
  return { sesion: { payload: auth.payload, rol, cids: null, nombre } };
}

export function puedeComo(sesion: Sesion, rol: "compras" | "almacen"): boolean {
  return sesion.rol === "superadmin" || sesion.rol === rol;
}

/** Recepcion con renglones, contenedores y la lista de archivos (sin el binario). */
export async function cargarRecepcion(id: number) {
  const r = await query("SELECT * FROM recepcion_packing WHERE id = ?", [id]);
  if (r.rows.length === 0) return null;
  const [items, contenedores, archivos] = await Promise.all([
    query("SELECT * FROM recepcion_packing_items WHERE recepcion_id = ? ORDER BY id", [id]),
    query("SELECT * FROM recepcion_packing_contenedores WHERE recepcion_id = ? ORDER BY id", [id]),
    query(
      `SELECT id, item_id, contenedor_id, tipo, nombre, mime, tamano, subido_por, created_at
         FROM recepcion_packing_archivos WHERE recepcion_id = ? ORDER BY id`,
      [id],
    ),
  ]);
  return {
    recepcion: r.rows[0] as any,
    items: items.rows as any[],
    contenedores: contenedores.rows as any[],
    archivos: archivos.rows as any[],
  };
}

/** 404 (y no 403) si es de otra sucursal: adivinar un id no debe confirmar que existe. */
export function fueraDeAlcance(sesion: Sesion, recepcion: any): boolean {
  return sesion.cids !== null && Number(recepcion.cids) !== sesion.cids;
}

export const EVENTO_RECEPCION = "recepcion_actualizada";

export type AvisoRecepcion = {
  /**
   * `llegada` y `contenedor_cerrado` son de UN contenedor (van con su numero
   * y cuantos llevan); `cerrado` es el packing list entero.
   */
  accion: "creado" | "llegada" | "contenedor_cerrado" | "cerrado" | "editado" | "eliminado";
  id: number;
  cids: number;
  referencia?: string | null;
  proveedor?: string | null;
  resultado?: string | null;
  contenedor?: string | null;
  /** Contenedores que ya llegaron / total, para "2 de 3". */
  llegados?: number;
  total?: number;
};

/**
 * Aviso en vivo. Va a Almacen de esa sucursal (`almacen_<cids>`, no la sala
 * de mercancia que comparte con Seguridad), a Compras (que carga para todas)
 * y a `mercancia_todas` (superadmin). La pantalla vuelve a pedir sus datos a
 * la API; el aviso solo dice "algo cambio".
 */
export function emitirRecepcion(aviso: AvisoRecepcion): void {
  const io = (global as any).io;
  if (!io) return;
  try {
    io.to(["mercancia_todas", "compras", `almacen_${aviso.cids}`]).emit(
      EVENTO_RECEPCION,
      aviso,
    );
  } catch (e: any) {
    console.error("[recepcion] no se pudo emitir el aviso:", e?.message);
  }
}

/**
 * Tipo real del archivo por sus primeros bytes, no por lo que diga el
 * navegador: un .exe renombrado a .jpg no pasa.
 */
export function detectarMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  if (buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) {
    const marca = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]).toLowerCase();
    if (["heic", "heix", "heim", "heis", "mif1", "msf1"].includes(marca)) return "image/heic";
  }
  // %PDF
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "application/pdf";
  // ZIP (xlsx) y el formato viejo de Office (xls)
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) {
    return "application/vnd.ms-excel";
  }
  return null;
}

export function esImagen(mime: string): boolean {
  return mime.startsWith("image/");
}
