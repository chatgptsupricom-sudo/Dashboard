import { db, query } from "@/lib/db";

/**
 * Qué vendedores reciben los leads de cada estado de Venezuela.
 *
 * El reparto lo hace n8n ("Leads - Form Pagina Web" y "Registro de Leads DB")
 * con dos procedimientos de la MySQL: `asignar_vendedor_rotacion(estado)` lee
 * la tabla `rotacion` y `asignar_vendedor_rotacion_carcar(estado)` lee
 * `rotacion_caracas_y_carabobo` (Caracas y Carabobo, que además pesan por
 * `efectividad_cierre`). Una fila = un vendedor en la rotación de un estado;
 * `asignacion` cuenta cuántos leads le tocaron. Estas tablas no las crea el
 * panel: aquí solo se agregan, cambian y quitan filas, y cada cambio queda en
 * `rotacion_auditoria` (se crea sola) además de en system_audit_log.
 *
 * Panamá no usa esta rotación.
 */

export const TABLA_GENERAL = "rotacion";
export const TABLA_CARCAR = "rotacion_caracas_y_carabobo";
export type Tabla = typeof TABLA_GENERAL | typeof TABLA_CARCAR;

/** Estados como los guardan las tablas: minúsculas y sin acentos. */
export const ESTADOS = [
  "amazonas",
  "anzoategui",
  "apure",
  "aragua",
  "barinas",
  "bolivar",
  "carabobo",
  "caracas",
  "cojedes",
  "delta amacuro",
  "falcon",
  "guarico",
  "la guaira",
  "lara",
  "merida",
  "miranda",
  "monagas",
  "nueva esparta",
  "portuguesa",
  "sucre",
  "tachira",
  "trujillo",
  "yaracuy",
  "zulia",
];

export const tablaDe = (estado: string): Tabla => (estado === "caracas" || estado === "carabobo" ? TABLA_CARCAR : TABLA_GENERAL);

let auditoriaLista = false;
async function ensureAuditoria() {
  if (auditoriaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS rotacion_auditoria (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      user_email VARCHAR(190) NULL,
      user_name VARCHAR(190) NULL,
      accion ENUM('agregar','cambiar','quitar') NOT NULL,
      estado VARCHAR(50) NOT NULL,
      seller_antes INT NULL,
      seller_despues INT NULL,
      nombre_antes VARCHAR(190) NULL,
      nombre_despues VARCHAR(190) NULL,
      KEY idx_fecha (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  auditoriaLista = true;
}

type Fila = { id: number; estado: string; seller_id: number; asignacion: number | null; efectividad_cierre?: number };
export type Autor = { email: string; nombre: string };

async function nombreVendedor(id: number | null): Promise<string | null> {
  if (!id) return null;
  const r = await query("SELECT name FROM sellers WHERE id = ?", [id]);
  return r.rows[0]?.name ?? `Vendedor #${id} (ya no existe)`;
}

async function auditar(
  autor: Autor,
  accion: "agregar" | "cambiar" | "quitar",
  estado: string,
  antes: number | null,
  despues: number | null,
) {
  await ensureAuditoria();
  await query(
    `INSERT INTO rotacion_auditoria (user_email, user_name, accion, estado, seller_antes, seller_despues, nombre_antes, nombre_despues)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [autor.email, autor.nombre, accion, estado, antes, despues, await nombreVendedor(antes), await nombreVendedor(despues)],
  );
}

export async function leerRotacion() {
  const [general, carcar, vendedores] = await Promise.all([
    query(`SELECT id, estado, seller_id, asignacion FROM ${TABLA_GENERAL} ORDER BY estado, id`),
    query(`SELECT id, estado, seller_id, asignacion, efectividad_cierre FROM ${TABLA_CARCAR} ORDER BY estado, id`),
    query("SELECT id, name, cids, activo FROM sellers WHERE cids IN (9, 10) ORDER BY name"),
  ]);
  const porId = new Map((vendedores.rows as any[]).map((v) => [Number(v.id), v]));
  const filas = [...(general.rows as Fila[]), ...(carcar.rows as Fila[])];
  const estados = [...new Set([...ESTADOS, ...filas.map((f) => String(f.estado))])].sort().map((estado) => ({
    estado,
    tabla: tablaDe(estado),
    vendedores: filas
      .filter((f) => f.estado === estado)
      .map((f) => {
        const v = porId.get(Number(f.seller_id));
        return {
          fila: Number(f.id),
          seller_id: Number(f.seller_id),
          nombre: v?.name ?? `Vendedor #${f.seller_id}`,
          existe: !!v,
          activo: !!v?.activo,
          asignacion: f.asignacion == null ? null : Number(f.asignacion),
          efectividad: f.efectividad_cierre == null ? null : Number(f.efectividad_cierre),
        };
      }),
  }));
  return {
    estados,
    vendedores: (vendedores.rows as any[]).filter((v) => v.activo).map((v) => ({ id: Number(v.id), nombre: v.name, cids: Number(v.cids) })),
  };
}

export async function leerAuditoria(limite = 100) {
  await ensureAuditoria();
  const r = await query(
    `SELECT id, created_at, user_email, user_name, accion, estado, nombre_antes, nombre_despues
     FROM rotacion_auditoria ORDER BY id DESC LIMIT ${Math.min(Math.max(1, Math.floor(limite)), 500)}`,
  );
  return r.rows;
}

async function vendedorValido(id: number) {
  const r = await query("SELECT id, activo FROM sellers WHERE id = ? AND cids IN (9, 10)", [id]);
  return r.rows[0]?.activo ? true : false;
}

async function filaDe(fila: number): Promise<(Fila & { tabla: Tabla }) | null> {
  for (const tabla of [TABLA_GENERAL, TABLA_CARCAR] as Tabla[]) {
    const r = await query(`SELECT id, estado, seller_id, asignacion FROM ${tabla} WHERE id = ?`, [fila]);
    if (r.rows[0]) return { ...(r.rows[0] as Fila), tabla };
  }
  return null;
}

/**
 * Suma un vendedor a la rotación de un estado. Arranca con el menor contador
 * del estado: si arrancara en 0 y la rotación da el lead al de menor
 * `asignacion`, se llevaría todos los leads hasta alcanzar a los demás.
 */
export async function agregar(estado: string, sellerId: number, autor: Autor): Promise<string | null> {
  if (!ESTADOS.includes(estado)) return "Estado no válido.";
  if (!(await vendedorValido(sellerId))) return "Ese vendedor no está activo en Valencia o Caracas.";
  const tabla = tablaDe(estado);
  const r = await query(
    `SELECT COUNT(*) AS n, SUM(seller_id = ?) AS ya, MIN(COALESCE(asignacion, 0)) AS minimo FROM ${tabla} WHERE estado = ?`,
    [sellerId, estado],
  );
  const { ya, minimo } = r.rows[0] as any;
  if (Number(ya) > 0) return "Ese vendedor ya recibe los leads de ese estado.";
  await query(`INSERT INTO ${tabla} (estado, seller_id, asignacion) VALUES (?, ?, ?)`, [estado, sellerId, Number(minimo) || 0]);
  await auditar(autor, "agregar", estado, null, sellerId);
  return null;
}

/** Pone otro vendedor en el lugar de uno (conserva su contador). */
export async function cambiar(fila: number, sellerId: number, autor: Autor): Promise<string | null> {
  const f = await filaDe(fila);
  if (!f) return "Esa asignación ya no existe. Recarga la página.";
  if (Number(f.seller_id) === sellerId) return null;
  if (!(await vendedorValido(sellerId))) return "Ese vendedor no está activo en Valencia o Caracas.";
  const dup = await query(`SELECT COUNT(*) AS n FROM ${f.tabla} WHERE estado = ? AND seller_id = ?`, [f.estado, sellerId]);
  if (Number((dup.rows[0] as any).n) > 0) return "Ese vendedor ya recibe los leads de ese estado.";
  await query(`UPDATE ${f.tabla} SET seller_id = ? WHERE id = ?`, [sellerId, fila]);
  await auditar(autor, "cambiar", f.estado, Number(f.seller_id), sellerId);
  return null;
}

/** Saca a un vendedor de la rotación de un estado. Un estado no puede quedar sin nadie. */
export async function quitar(fila: number, autor: Autor): Promise<string | null> {
  const f = await filaDe(fila);
  if (!f) return "Esa asignación ya no existe. Recarga la página.";
  const r = await query(`SELECT COUNT(*) AS n FROM ${f.tabla} WHERE estado = ?`, [f.estado]);
  if (Number((r.rows[0] as any).n) <= 1)
    return "Es el único vendedor de ese estado: los leads quedarían sin asignar. Agrega a otro antes de quitarlo, o usa Cambiar.";
  await query(`DELETE FROM ${f.tabla} WHERE id = ?`, [fila]);
  await auditar(autor, "quitar", f.estado, Number(f.seller_id), null);
  return null;
}
