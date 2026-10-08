import { query } from "@/lib/db";

/**
 * Foto de la autorización del cliente para que su mercancía salga en un
 * transporte externo (método "transporte" de lib/ventas/metodoRetiro.ts).
 * Es obligatoria para ese método: con ella Almacén y Seguridad dejan salir el
 * camión que no es de la empresa.
 *
 * Se guarda en MySQL (LONGBLOB), como las fotos de RMA, en una tabla aparte
 * para que leer los métodos no arrastre las imágenes. Una misma foto sirve
 * para todos los pedidos que el vendedor guardó juntos.
 *
 * La ven: el vendedor del pedido, el Asistente de Ventas, Almacén y Seguridad
 * de la sucursal del pedido, y el SuperAdmin (ver puedeVerAutorizacion).
 */

export const MAX_BYTES_AUTORIZACION = 15 * 1024 * 1024;

let tabla: Promise<void> | null = null;

function asegurarTabla(): Promise<void> {
  if (!tabla) {
    tabla = query(
      `CREATE TABLE IF NOT EXISTS ventas_metodo_retiro_autorizaciones (
         id INT AUTO_INCREMENT PRIMARY KEY,
         filename VARCHAR(255) DEFAULT NULL,
         mime VARCHAR(50) NOT NULL,
         size INT NOT NULL,
         data LONGBLOB NOT NULL,
         subido_por VARCHAR(200) DEFAULT NULL,
         subido_email VARCHAR(200) DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_vmra_email (subido_email)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    )
      .then(() => undefined)
      .catch((e) => {
        tabla = null;
        throw e;
      });
  }
  return tabla;
}

/**
 * Tipo real de la imagen por sus primeros bytes, no por lo que diga el
 * navegador. Sin HEIC: Chrome no la muestra, y Almacén y Seguridad tienen que
 * poder verla (el iPhone la convierte a JPG al subirla desde el navegador).
 */
export function mimeDeImagen(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Guarda la foto y devuelve su id. Todavía no queda en ningún pedido. */
export async function guardarAutorizacion(a: {
  buf: Buffer;
  mime: string;
  filename: string;
  autor: string;
  email: string;
}): Promise<number> {
  await asegurarTabla();
  const r = await query(
    `INSERT INTO ventas_metodo_retiro_autorizaciones (filename, mime, size, data, subido_por, subido_email)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [a.filename.slice(0, 255), a.mime, a.buf.length, a.buf, a.autor.slice(0, 200), a.email.slice(0, 200)],
  );
  return Number((r.rows as any)?.insertId);
}

/**
 * Si quien guarda puede poner esta foto en estos pedidos: la subió él, o ya
 * es la de uno de ellos. Así nadie se cuelga de la foto de otro cliente para
 * después verla.
 */
export async function autorizacionUsable(id: number, email: string, saleIds: number[]): Promise<boolean> {
  await asegurarTabla();
  const r = await query(`SELECT subido_email FROM ventas_metodo_retiro_autorizaciones WHERE id = ?`, [id]);
  const fila = (r.rows as any[])[0];
  if (!fila) return false;
  if (email && String(fila.subido_email || "").toLowerCase() === email.toLowerCase()) return true;
  if (!saleIds.length) return false;
  const usada = await query(
    `SELECT 1 FROM ventas_metodo_retiro
      WHERE autorizacion_id = ? AND odoo_sale_id IN (${saleIds.map(() => "?").join(",")}) LIMIT 1`,
    [id, ...saleIds],
  );
  return (usada.rows as any[]).length > 0;
}

/** La sesión que pide ver la foto. */
export type QuienVe = { rol: string; uid: number | null; cids: number | null; email: string };

/**
 * Vendedor: si es de uno de sus pedidos (o la acaba de subir él). Asistente
 * de Ventas, Almacén y Seguridad: si es de un pedido de su sucursal.
 * SuperAdmin (o sin sucursal en un rol que ve todas): siempre.
 */
export async function puedeVerAutorizacion(id: number, q: QuienVe): Promise<boolean> {
  await asegurarTabla();
  if (q.rol === "superadmin") return true;
  const r = await query(`SELECT subido_email FROM ventas_metodo_retiro_autorizaciones WHERE id = ?`, [id]);
  const fila = (r.rows as any[])[0];
  if (!fila) return false;
  if (q.email && String(fila.subido_email || "").toLowerCase() === q.email.toLowerCase()) return true;
  const esVendedor = q.rol === "vendedor" || q.rol === "seller";
  const usos = await query(
    `SELECT vendedor_uid, company_id FROM ventas_metodo_retiro WHERE autorizacion_id = ?`,
    [id],
  );
  return (usos.rows as any[]).some((u) =>
    esVendedor
      ? q.uid !== null && Number(u.vendedor_uid) === q.uid
      : q.cids === null || Number(u.company_id) === q.cids,
  );
}

export async function leerAutorizacion(id: number): Promise<{ data: Buffer; mime: string; filename: string | null } | null> {
  await asegurarTabla();
  const r = await query(`SELECT data, mime, filename FROM ventas_metodo_retiro_autorizaciones WHERE id = ?`, [id]);
  const fila = (r.rows as any[])[0];
  return fila ? { data: fila.data as Buffer, mime: String(fila.mime), filename: fila.filename ?? null } : null;
}
