import { db, query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { ROLES_CON_MARCAS, type Asignacion, type Linea } from "@/lib/gerente-marca/tipos";

/**
 * Qué marcas lleva cada Gerente de Marca. Una fila por correo y marca
 * (`spiff.brand` de Odoo), con la línea: toda la marca o solo Cómputo
 * Corporativo. La tabla se crea sola; DDL de referencia en
 * sql/gerente_marca.sql. Las asigna el SuperAdmin en /gerente_marca/configuracion.
 */

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS gerente_marca_asignaciones (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(190) NOT NULL,
      marca_id INT NOT NULL,
      marca VARCHAR(120) NOT NULL,
      linea VARCHAR(20) NOT NULL DEFAULT 'todo',
      updated_by VARCHAR(190) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_email_marca (email, marca_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

const lineaDe = (v: unknown): Linea => (v === "computo" ? "computo" : "todo");
const normalizarEmail = (v: unknown) => String(v ?? "").trim().toLowerCase();

function aAsignacion(f: any): Asignacion {
  return { marcaId: Number(f.marca_id), marca: String(f.marca), linea: lineaDe(f.linea) };
}

/** Marcas de un gerente, por nombre de marca. */
export async function asignacionesDe(email: string): Promise<Asignacion[]> {
  await ensureTabla();
  const [filas] = await db.execute(
    "SELECT marca_id, marca, linea FROM gerente_marca_asignaciones WHERE email = ? ORDER BY marca",
    [normalizarEmail(email)],
  );
  return (filas as any[]).map(aAsignacion);
}

/**
 * Las marcas de todos los gerentes juntas (lo que ve el SuperAdmin sin elegir
 * gerente). Si una marca la lleva entera alguien y otro solo su cómputo,
 * queda entera.
 */
export async function todasLasAsignaciones(): Promise<Asignacion[]> {
  await ensureTabla();
  const [filas] = await db.execute("SELECT marca_id, marca, linea FROM gerente_marca_asignaciones ORDER BY marca");
  const porMarca = new Map<number, Asignacion>();
  for (const a of (filas as any[]).map(aAsignacion)) {
    const previa = porMarca.get(a.marcaId);
    if (!previa || a.linea === "todo") porMarca.set(a.marcaId, a);
  }
  return [...porMarca.values()];
}

export interface GerenteConMarcas {
  email: string;
  nombre: string;
  asignaciones: Asignacion[];
}

/** Usuarios con un rol de `ROLES_CON_MARCAS` (de `users_config`), cada uno con sus marcas. */
export async function gerentes(): Promise<GerenteConMarcas[]> {
  await ensureTabla();
  const [usuarios] = await db.execute(
    `SELECT LOWER(TRIM(uc.email)) AS email, uc.name
       FROM users_config uc
       JOIN roles r ON r.id = uc.role_id
      WHERE LOWER(TRIM(r.name)) IN (?, ?)
      ORDER BY uc.name`,
    ROLES_CON_MARCAS,
  );
  const [filas] = await db.execute("SELECT email, marca_id, marca, linea FROM gerente_marca_asignaciones ORDER BY marca");
  const porEmail = new Map<string, Asignacion[]>();
  for (const f of filas as any[]) {
    const e = normalizarEmail(f.email);
    porEmail.set(e, [...(porEmail.get(e) ?? []), aAsignacion(f)]);
  }
  const lista: GerenteConMarcas[] = (usuarios as any[]).map((u) => ({
    email: u.email,
    nombre: u.name || u.email,
    asignaciones: porEmail.get(u.email) ?? [],
  }));
  // Si a alguien le quitaron el rol, sus marcas siguen guardadas: se muestran
  // para poder limpiarlas.
  for (const [email, asignaciones] of porEmail) {
    if (!lista.some((g) => g.email === email)) lista.push({ email, nombre: `${email} (sin el rol)`, asignaciones });
  }
  return lista;
}

/** Marcas de Odoo para elegir (`spiff.brand`). */
export async function marcasOdoo(): Promise<{ id: number; nombre: string }[]> {
  const r = await callOdooRPCEstricto<any[]>("spiff.brand", "search_read", [[]], { fields: ["id", "name"], order: "name asc" });
  return (r || [])
    .map((m) => ({ id: Number(m.id), nombre: String(m.name || "").trim() }))
    .filter((m) => m.nombre);
}

/** Reemplaza las marcas de un gerente. Solo marcas que existen en Odoo. */
export async function guardarAsignaciones(email: string, lista: { marcaId: number; linea: Linea }[], quien: string) {
  await ensureTabla();
  const correo = normalizarEmail(email);
  if (!correo.includes("@")) throw new Error("Correo inválido");
  const marcas = new Map((await marcasOdoo()).map((m) => [m.id, m.nombre]));
  const vistas = new Set<number>();
  const filas: Asignacion[] = [];
  for (const a of lista) {
    const id = Number(a.marcaId);
    if (!marcas.has(id) || vistas.has(id)) continue;
    vistas.add(id);
    filas.push({ marcaId: id, marca: marcas.get(id)!, linea: lineaDe(a.linea) });
  }
  await query("DELETE FROM gerente_marca_asignaciones WHERE email = ?", [correo]);
  for (const a of filas) {
    await query(
      "INSERT INTO gerente_marca_asignaciones (email, marca_id, marca, linea, updated_by) VALUES (?, ?, ?, ?, ?)",
      [correo, a.marcaId, a.marca, a.linea, quien],
    );
  }
  return filas;
}
