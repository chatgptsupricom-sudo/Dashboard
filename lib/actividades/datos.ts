/**
 * Actividades en la MySQL (tabla `activities`) para el panel nuevo
 * (`/gestion/actividades`, APIs `app/api/activities/panel/*`).
 *
 * Quién ve a quién (`alcanceDe`), en el servidor:
 * - SuperAdmin: todos; asigna, edita y borra.
 * - Inteligencia de Negocio y Auditoría: todos, solo lectura.
 * - Gerente de Operaciones y Gerencia de Ventas: los de su sede (`cids`; sin
 *   sede, todos) y les asignan.
 * - El resto: solo lo suyo.
 * Editar: SuperAdmin, el dueño o quien la asignó. Borrar: SuperAdmin, quien
 * la asignó o el dueño si se la creó él mismo.
 *
 * Columnas que se agregan solas (`asegurarColumnas`): `priority`,
 * `completed_at`, `checklist` (JSON en TEXT) y `assigned_by_id` (antes solo
 * se guardaba el nombre en `assigned_by`; las viejas se siguen reconociendo
 * por nombre).
 */
import { db, query } from "@/lib/db";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import {
  type Actividad,
  type Estado,
  type PersonaVisible,
  type ResumenPersona,
  DIAS_CULMINADAS,
  fechaCaracas,
  grupoDe,
  normalizarChecklist,
  normalizarEstado,
  normalizarPrioridad,
  sumarDias,
} from "./tipos";

declare global {
  // eslint-disable-next-line no-var
  var io: any;
}

export interface Alcance {
  yo: number;
  nombre: string;
  email: string;
  rol: string;
  cids: number | null;
  veTodos: boolean;
  veSede: boolean;
  puedeAsignar: boolean;
  soloLee: boolean;
  superAdmin: boolean;
}

const GERENTES = ["gerente de operaciones", "gerencia de ventas"];
const SOLO_LECTURA_TODOS = [ROL_BI, "audit", "auditoria", "auditoría"];

/** Estados que cuentan como culminada en SQL (filas viejas en español). */
const SQL_CULMINADA = `LOWER(TRIM(a.status)) IN ('culminated','culminada','terminada','completada','done')`;

export function alcanceDe(payload: any): Alcance {
  const rol = String(payload?.role ?? "").toLowerCase().trim();
  const cidsNum = Number(payload?.cids);
  const cids = Number.isFinite(cidsNum) && cidsNum > 0 ? cidsNum : null;
  const superAdmin = rol === "superadmin";
  const gerente = GERENTES.includes(rol);
  const soloLee = SOLO_LECTURA_TODOS.includes(rol);
  return {
    yo: Number(payload?.sub ?? 0),
    nombre: String(payload?.name ?? "").trim(),
    email: String(payload?.email ?? "").trim(),
    rol,
    cids,
    superAdmin,
    veTodos: superAdmin || soloLee || (gerente && cids === null),
    veSede: gerente && cids !== null,
    puedeAsignar: superAdmin || gerente,
    soloLee,
  };
}

/** Puede ver más gente que a sí mismo (pestaña Equipo y selector de persona). */
export function veEquipo(a: Alcance): boolean {
  return a.veTodos || a.veSede;
}

let columnasListas: Promise<void> | null = null;

export function asegurarColumnas(): Promise<void> {
  if (!columnasListas) {
    columnasListas = (async () => {
      const [columnas] = await db.execute("SHOW COLUMNS FROM activities");
      const hay = new Set((columnas as any[]).map((c) => String(c.Field)));
      const nuevas: Array<[string, string]> = [
        ["priority", "VARCHAR(10) NULL"],
        ["completed_at", "DATETIME NULL"],
        ["checklist", "TEXT NULL"],
        ["assigned_by_id", "INT NULL"],
      ];
      for (const [nombre, tipo] of nuevas) {
        if (!hay.has(nombre)) {
          try {
            await query(`ALTER TABLE activities ADD COLUMN ${nombre} ${tipo}`);
          } catch (e: any) {
            if (e?.code !== "ER_DUP_FIELDNAME") throw e;
          }
        }
      }
    })().catch((e) => {
      columnasListas = null;
      throw e;
    });
  }
  return columnasListas;
}

export async function personasVisibles(a: Alcance): Promise<PersonaVisible[]> {
  let sql = `
    SELECT u.id, u.name, u.email, u.cids, COALESCE(r.display_name, r.name, '') AS role
    FROM users_config u
    LEFT JOIN roles r ON u.role_id = r.id`;
  const params: any[] = [];
  if (a.veTodos) {
    // todos
  } else if (a.veSede) {
    sql += " WHERE (u.cids = ? OR u.id = ?)";
    params.push(a.cids, a.yo);
  } else {
    sql += " WHERE u.id = ?";
    params.push(a.yo);
  }
  sql += " ORDER BY u.name";
  const { rows } = await query(sql, params);
  return rows.map((r: any) => ({
    id: Number(r.id),
    name: String(r.name ?? r.email ?? `Usuario ${r.id}`),
    email: String(r.email ?? ""),
    role: String(r.role ?? ""),
    cids: r.cids == null ? null : Number(r.cids),
  }));
}

export async function puedeVerPersona(a: Alcance, userId: number): Promise<boolean> {
  if (userId === a.yo || a.veTodos) return true;
  if (!a.veSede) return false;
  const { rows } = await query("SELECT cids FROM users_config WHERE id = ?", [userId]);
  return rows.length > 0 && Number(rows[0].cids) === a.cids;
}

function esQuienAsigno(a: Alcance, fila: any): boolean {
  if (fila.assigned_by_id != null) return Number(fila.assigned_by_id) === a.yo;
  const nombre = String(fila.assigned_by ?? "").trim().toLowerCase();
  return !!nombre && nombre === a.nombre.toLowerCase();
}

function permisos(a: Alcance, fila: any): { editar: boolean; borrar: boolean } {
  if (a.soloLee) return { editar: false, borrar: false };
  const duenio = Number(fila.user_id) === a.yo;
  const asigno = esQuienAsigno(a, fila);
  const propia = duenio && !fila.assigned_by && fila.assigned_by_id == null;
  return {
    editar: a.superAdmin || duenio || asigno,
    borrar: a.superAdmin || asigno || propia,
  };
}

function iso(v: unknown): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function aActividad(a: Alcance, r: any): Actividad {
  const p = permisos(a, r);
  return {
    id: Number(r.id),
    title: String(r.title ?? "").trim() || "Sin título",
    description: r.description ?? null,
    observacion: r.observacion ?? null,
    status: normalizarEstado(r.status),
    priority: normalizarPrioridad(r.priority),
    due_date: r.due_date ?? null,
    user_id: r.user_id == null ? null : Number(r.user_id),
    user_name: r.user_name ?? null,
    assigned_by: r.assigned_by ?? null,
    assigned_by_id: r.assigned_by_id == null ? null : Number(r.assigned_by_id),
    created_at: iso(r.created_at),
    completed_at: iso(r.completed_at),
    checklist: normalizarChecklist(r.checklist),
    puede_editar: p.editar,
    puede_borrar: p.borrar,
  };
}

const SELECT_ACTIVIDAD = `
  SELECT a.id, a.title, a.description, a.observacion, a.status, a.priority,
         DATE_FORMAT(a.due_date, '%Y-%m-%d') AS due_date,
         a.user_id, u.name AS user_name, a.assigned_by, a.assigned_by_id,
         a.created_at, a.completed_at, a.checklist
  FROM activities a
  LEFT JOIN users_config u ON a.user_id = u.id`;

export type Vista = "mias" | "asignadas" | "persona";

/**
 * Lista para "Mi día" y el Tablero: todo lo abierto + lo culminado en los
 * últimos `DIAS_CULMINADAS` días. `null` = no puede ver a esa persona.
 */
export async function listar(a: Alcance, vista: Vista, userId?: number): Promise<Actividad[] | null> {
  await asegurarColumnas();
  const params: any[] = [];
  let donde: string;
  if (vista === "asignadas") {
    donde = `(a.assigned_by_id = ? OR (a.assigned_by_id IS NULL AND LOWER(TRIM(a.assigned_by)) = ?))
             AND (a.user_id IS NULL OR a.user_id <> ?)`;
    params.push(a.yo, a.nombre.toLowerCase(), a.yo);
  } else {
    const objetivo = vista === "persona" && userId ? userId : a.yo;
    if (!(await puedeVerPersona(a, objetivo))) return null;
    donde = "a.user_id = ?";
    params.push(objetivo);
  }
  const sql = `${SELECT_ACTIVIDAD}
    WHERE ${donde}
      AND (NOT (${SQL_CULMINADA})
           OR COALESCE(a.completed_at, a.created_at) >= DATE_SUB(NOW(), INTERVAL ${DIAS_CULMINADAS} DAY))
    ORDER BY a.created_at DESC
    LIMIT 1000`;
  const { rows } = await query(sql, params);
  return rows.map((r) => aActividad(a, r));
}

async function leerFila(id: number): Promise<any | null> {
  const { rows } = await query(
    "SELECT id, user_id, assigned_by, assigned_by_id, status, title FROM activities WHERE id = ?",
    [id],
  );
  return rows[0] ?? null;
}

export async function leerActividad(a: Alcance, id: number): Promise<Actividad | null> {
  const { rows } = await query(`${SELECT_ACTIVIDAD} WHERE a.id = ?`, [id]);
  return rows[0] ? aActividad(a, rows[0]) : null;
}

function avisar(accion: string, extra: Record<string, unknown> = {}) {
  try {
    if (global.io) global.io.emit("activity-updated", { action: accion, ...extra });
  } catch {
    // el aviso en vivo no debe tumbar la escritura
  }
}

export class ErrorActividad extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function texto(v: unknown, max: number): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function fechaValida(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new ErrorActividad("Fecha inválida", 400);
  return s;
}

export interface DatosActividad {
  title?: unknown;
  description?: unknown;
  observacion?: unknown;
  due_date?: unknown;
  priority?: unknown;
  checklist?: unknown;
  status?: unknown;
  user_id?: unknown;
}

async function destinatario(a: Alcance, userId: number) {
  if (userId !== a.yo) {
    if (!a.puedeAsignar) throw new ErrorActividad("No puedes asignar actividades a otras personas", 403);
    if (!(await puedeVerPersona(a, userId))) throw new ErrorActividad("Esa persona no es de tu sede", 403);
  }
  const { rows } = await query("SELECT id, email, role_id, cids FROM users_config WHERE id = ?", [userId]);
  if (!rows[0]) throw new ErrorActividad("Usuario no encontrado", 404);
  return rows[0];
}

export async function crear(a: Alcance, d: DatosActividad): Promise<Actividad> {
  await asegurarColumnas();
  if (a.soloLee) throw new ErrorActividad("Solo lectura", 403);
  const title = texto(d.title, 255);
  if (!title) throw new ErrorActividad("Escribe qué hay que hacer", 400);
  const userId = Number(d.user_id) || a.yo;
  const u = await destinatario(a, userId);
  const asignada = userId !== a.yo;
  const { rows } = await query(
    `INSERT INTO activities
      (user_id, role_id, cids, title, description, observacion, user_email, action_type, status,
       due_date, assigned_by, assigned_by_id, priority, checklist)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'TASK', 'pending', ?, ?, ?, ?, ?)`,
    [
      userId,
      u.role_id ?? null,
      u.cids ?? null,
      title,
      texto(d.description, 5000),
      texto(d.observacion, 5000),
      u.email || a.email || "no-email@supricom.com",
      fechaValida(d.due_date),
      asignada ? a.nombre || null : null,
      asignada ? a.yo : null,
      normalizarPrioridad(d.priority),
      JSON.stringify(normalizarChecklist(d.checklist)),
    ],
  );
  const id = Number((rows as any).insertId);
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, role, action, changes, created_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [
        a.yo,
        a.nombre || a.email,
        a.rol,
        asignada ? "ASSIGN_TASK" : "CREATE_ACTIVITY",
        JSON.stringify(asignada ? { action: "Asignación", target_user: userId, title } : { action: "Creación de actividad", title }),
      ],
    );
  } catch (e) {
    console.error("[actividades] no se pudo anotar en audit_logs:", e);
  }
  avisar("CREATED", { id, targetUserId: userId });
  const act = await leerActividad(a, id);
  if (!act) throw new ErrorActividad("No se pudo leer la actividad creada", 500);
  return act;
}

export async function actualizar(a: Alcance, id: number, d: DatosActividad): Promise<Actividad> {
  await asegurarColumnas();
  const fila = await leerFila(id);
  if (!fila) throw new ErrorActividad("Actividad no encontrada", 404);
  if (!permisos(a, fila).editar) throw new ErrorActividad("No puedes cambiar esta actividad", 403);

  const sets: string[] = [];
  const params: any[] = [];
  const poner = (col: string, valor: unknown) => {
    sets.push(`${col} = ?`);
    params.push(valor);
  };

  if (d.title !== undefined) {
    const t = texto(d.title, 255);
    if (!t) throw new ErrorActividad("El título no puede quedar vacío", 400);
    poner("title", t);
  }
  if (d.description !== undefined) poner("description", texto(d.description, 5000));
  if (d.observacion !== undefined) poner("observacion", texto(d.observacion, 5000));
  if (d.due_date !== undefined) poner("due_date", fechaValida(d.due_date));
  if (d.priority !== undefined) poner("priority", normalizarPrioridad(d.priority));
  if (d.checklist !== undefined) poner("checklist", JSON.stringify(normalizarChecklist(d.checklist)));
  if (d.status !== undefined) {
    const nuevo: Estado = normalizarEstado(d.status);
    const antes = normalizarEstado(fila.status);
    poner("status", nuevo);
    if (nuevo === "culminated" && antes !== "culminated") poner("completed_at", new Date());
    if (nuevo !== "culminated" && antes === "culminated") poner("completed_at", null);
  }
  if (d.user_id !== undefined) {
    const nuevoUsuario = Number(d.user_id);
    if (!nuevoUsuario) throw new ErrorActividad("Elige a quién va la actividad", 400);
    if (nuevoUsuario !== Number(fila.user_id)) {
      if (!a.puedeAsignar) throw new ErrorActividad("No puedes reasignar actividades", 403);
      const u = await destinatario(a, nuevoUsuario);
      poner("user_id", nuevoUsuario);
      poner("user_email", u.email ?? null);
      poner("role_id", u.role_id ?? null);
      poner("cids", u.cids ?? null);
      if (!fila.assigned_by && fila.assigned_by_id == null && nuevoUsuario !== a.yo) {
        poner("assigned_by", a.nombre || null);
        poner("assigned_by_id", a.yo);
      }
    }
  }

  if (sets.length) {
    params.push(id);
    await query(`UPDATE activities SET ${sets.join(", ")} WHERE id = ?`, params);
    avisar("UPDATED", { id });
  }
  const act = await leerActividad(a, id);
  if (!act) throw new ErrorActividad("Actividad no encontrada", 404);
  return act;
}

export async function borrar(a: Alcance, id: number): Promise<void> {
  await asegurarColumnas();
  const fila = await leerFila(id);
  if (!fila) throw new ErrorActividad("Actividad no encontrada", 404);
  if (!permisos(a, fila).borrar) throw new ErrorActividad("No puedes borrar esta actividad", 403);
  await query("DELETE FROM activities WHERE id = ?", [id]);
  avisar("DELETED", { id });
}

/** Pestaña Equipo: por persona visible, cuántas vencidas, de hoy, en curso... */
export async function resumenEquipo(a: Alcance): Promise<ResumenPersona[]> {
  await asegurarColumnas();
  const personas = await personasVisibles(a);
  if (!personas.length) return [];
  const hoy = fechaCaracas();
  const desdeSemana = sumarDias(hoy, -6);
  const ids = personas.map((p) => p.id);
  const marcas = ids.map(() => "?").join(",");
  const { rows } = await query(
    `SELECT a.user_id, a.status, DATE_FORMAT(a.due_date, '%Y-%m-%d') AS due_date, a.completed_at
     FROM activities a
     WHERE a.user_id IN (${marcas})
       AND (NOT (${SQL_CULMINADA}) OR a.completed_at >= DATE_SUB(NOW(), INTERVAL 8 DAY))`,
    ids,
  );
  const porPersona = new Map<number, ResumenPersona>(
    personas.map((p) => [
      p.id,
      {
        user_id: p.id,
        name: p.name,
        role: p.role,
        cids: p.cids,
        vencidas: 0,
        hoy: 0,
        en_curso: 0,
        pendientes: 0,
        hechas_semana: 0,
        vencida_mas_vieja: null,
      },
    ]),
  );
  for (const r of rows as any[]) {
    const res = porPersona.get(Number(r.user_id));
    if (!res) continue;
    const status = normalizarEstado(r.status);
    const completed_at = iso(r.completed_at);
    if (status === "culminated") {
      if (completed_at && fechaCaracas(new Date(completed_at)) >= desdeSemana) res.hechas_semana++;
      continue;
    }
    res.pendientes++;
    if (status === "in-progress") res.en_curso++;
    const g = grupoDe({ status, due_date: r.due_date, completed_at }, hoy);
    if (g === "vencidas") {
      res.vencidas++;
      if (!res.vencida_mas_vieja || r.due_date < res.vencida_mas_vieja) res.vencida_mas_vieja = r.due_date;
    }
    if (g === "hoy") res.hoy++;
  }
  return [...porPersona.values()];
}

