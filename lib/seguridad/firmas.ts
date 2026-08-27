import { query } from "@/lib/db";

/**
 * Las 4 firmas del acta de RMA.
 *
 * La planilla de papel lleva cuatro firmantes y el sistema guardaba una sola
 * —la del cliente— y solo en el despacho. Esto es lo compartido entre los
 * endpoints y el comprobante para no repetir el criterio en tres sitios.
 */

export const ROLES_FIRMA = ["tecnico", "almacen", "seguridad", "cliente"] as const;
export type RolFirma = (typeof ROLES_FIRMA)[number];

export const TIPOS_ACTA = ["ingreso", "despacho"] as const;
export type TipoActa = (typeof TIPOS_ACTA)[number];

export function esRolValido(v: unknown): v is RolFirma {
  return typeof v === "string" && (ROLES_FIRMA as readonly string[]).includes(v);
}

export function esTipoValido(v: unknown): v is TipoActa {
  return typeof v === "string" && (TIPOS_ACTA as readonly string[]).includes(v);
}

export type FirmaGuardada = {
  rol: RolFirma;
  firmante_nombre: string;
  created_at: string;
};

/**
 * Firmas de un acta, SIN los blobs.
 *
 * El listado y las pantallas solo necesitan saber quien firmo y cuando; traer
 * cuatro LONGBLOB para pintar cuatro palomitas es cargar megas por gusto. Las
 * imagenes se piden una a una, o todas juntas solo al generar el comprobante.
 */
export async function firmasDeActa(
  tipo: TipoActa,
  actaId: number,
): Promise<FirmaGuardada[]> {
  try {
    const res = await query(
      `SELECT rol, firmante_nombre, created_at
         FROM seguridad_firmas
        WHERE acta_tipo = ? AND acta_id = ?
        ORDER BY FIELD(rol, 'tecnico', 'almacen', 'seguridad', 'cliente')`,
      [tipo, actaId],
    );
    return res.rows as FirmaGuardada[];
  } catch (e: any) {
    // La tabla puede no existir todavia en una base sin migrar. El acta se
    // sigue pudiendo ver: mejor sin firmas que con la pantalla caida.
    console.warn("seguridad_firmas no disponible:", e?.message);
    return [];
  }
}

/** Las 4 firmas con su imagen, para el comprobante imprimible. */
export async function firmasConImagen(
  tipo: TipoActa,
  actaId: number,
): Promise<Array<FirmaGuardada & { data_url: string }>> {
  try {
    const res = await query(
      `SELECT rol, firmante_nombre, created_at, firma_data, firma_mime
         FROM seguridad_firmas
        WHERE acta_tipo = ? AND acta_id = ?
        ORDER BY FIELD(rol, 'tecnico', 'almacen', 'seguridad', 'cliente')`,
      [tipo, actaId],
    );
    return res.rows.map((r: any) => {
      const buf = Buffer.isBuffer(r.firma_data)
        ? r.firma_data
        : Buffer.from(r.firma_data);
      return {
        rol: r.rol,
        firmante_nombre: r.firmante_nombre,
        created_at: r.created_at,
        data_url: `data:${r.firma_mime || "image/png"};base64,${buf.toString("base64")}`,
      };
    });
  } catch (e: any) {
    console.warn("seguridad_firmas no disponible:", e?.message);
    return [];
  }
}

/**
 * Datos del tecnico que firma como OSC.
 *
 * Vive en `seguridad_config` y no escrito en el codigo: hoy es siempre Manuel
 * Garcia, pero el dia que cambie el tecnico no deberia hacer falta tocar y
 * desplegar. Los valores por defecto son el respaldo si la tabla todavia no
 * existe.
 */
export async function tecnicoDeOsc(): Promise<{ nombre: string; cargo: string }> {
  const porDefecto = { nombre: "Ing. Manuel García", cargo: "Técnico de OSC" };
  try {
    const res = await query(
      "SELECT clave, valor FROM seguridad_config WHERE clave IN ('tecnico_nombre','tecnico_cargo')",
    );
    const mapa = new Map(res.rows.map((r: any) => [r.clave, r.valor]));
    return {
      nombre: (mapa.get("tecnico_nombre") as string) || porDefecto.nombre,
      cargo: (mapa.get("tecnico_cargo") as string) || porDefecto.cargo,
    };
  } catch {
    return porDefecto;
  }
}

/** Convierte el data URL del SignaturePad en bytes. Solo PNG, como el pad. */
export function decodificarFirmaPng(
  dataUrl: string,
): { buffer: Buffer; mime: string } | null {
  if (!dataUrl.startsWith("data:image/png;base64,")) return null;
  const base64 = dataUrl.slice("data:image/png;base64,".length);
  if (!base64) return null;
  try {
    const buffer = Buffer.from(base64, "base64");
    return buffer.length > 0 ? { buffer, mime: "image/png" } : null;
  } catch {
    return null;
  }
}
