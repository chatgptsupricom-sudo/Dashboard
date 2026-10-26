import { db } from "@/lib/db";
import {
  CAMPOS_CANDIDATO,
  ESTADOS_REQUISICION,
  META_DIAS_DEFECTO,
  SEDES_SELECCION,
  type Candidato,
  type Requisicion,
} from "@/lib/seleccion/tipos";

/**
 * Matriz de rastreo de selección de personal (lib/seleccion/tipos.ts).
 * Tablas `seleccion_requisiciones`, `seleccion_candidatos` y
 * `seleccion_eventos` (cada cambio de un candidato, para la trazabilidad);
 * se crean solas. Referencia: sql/seleccion_personal.sql.
 */

let tablasListas: Promise<void> | null = null;
function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS seleccion_requisiciones (
          id INT AUTO_INCREMENT PRIMARY KEY,
          codigo VARCHAR(40) NOT NULL,
          fecha_recepcion DATE NOT NULL,
          unidad_solicitante VARCHAR(120) NOT NULL DEFAULT '',
          cargo VARCHAR(160) NOT NULL DEFAULT '',
          sede INT NOT NULL DEFAULT 9,
          vacantes INT NOT NULL DEFAULT 1,
          meta_dias INT NOT NULL DEFAULT ${META_DIAS_DEFECTO},
          estado VARCHAR(20) NOT NULL DEFAULT 'abierta',
          notas TEXT NULL,
          created_by VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_codigo (codigo),
          KEY idx_fecha (fecha_recepcion)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS seleccion_candidatos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          requisicion_id INT NOT NULL,
          nombre VARCHAR(160) NOT NULL,
          telefono VARCHAR(40) NOT NULL DEFAULT '',
          correo VARCHAR(160) NOT NULL DEFAULT '',
          fuente VARCHAR(60) NOT NULL DEFAULT '',
          sondeo VARCHAR(20) NULL,
          entrevista_rrhh_fecha DATE NULL,
          entrevista_rrhh VARCHAR(20) NULL,
          evaluacion VARCHAR(20) NULL,
          evaluacion_puntaje VARCHAR(120) NOT NULL DEFAULT '',
          entrevista_tecnica_fecha DATE NULL,
          entrevista_tecnica VARCHAR(20) NULL,
          entrevista_tecnica_concepto TEXT NULL,
          referencias VARCHAR(20) NULL,
          referencias_nota TEXT NULL,
          terna VARCHAR(5) NULL,
          oferta VARCHAR(20) NULL,
          examenes VARCHAR(20) NULL,
          estatus VARCHAR(20) NOT NULL DEFAULT 'en_proceso',
          fecha_ingreso DATE NULL,
          notas TEXT NULL,
          updated_by VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_requisicion (requisicion_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS seleccion_eventos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          candidato_id INT NOT NULL,
          campo VARCHAR(40) NOT NULL,
          antes TEXT NULL,
          despues TEXT NULL,
          usuario VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_candidato (candidato_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const fecha = (v: unknown): string | null => {
  const s = texto(v, 10);
  return RE_FECHA.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? s : null;
};
const entero = (v: unknown, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
};

/** DATE como texto: mysql2 lo devolvería como Date en la hora del servidor. */
const f = (col: string) => `DATE_FORMAT(${col}, '%Y-%m-%d') AS ${col}`;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const COLS_REQ = `id, codigo, ${f("fecha_recepcion")}, unidad_solicitante, cargo, sede, vacantes, meta_dias, estado, notas, created_by, created_at`;
const COLS_CAND = `id, requisicion_id, nombre, telefono, correo, fuente, sondeo, ${f("entrevista_rrhh_fecha")}, entrevista_rrhh,
  evaluacion, evaluacion_puntaje, ${f("entrevista_tecnica_fecha")}, entrevista_tecnica, entrevista_tecnica_concepto,
  referencias, referencias_nota, terna, oferta, examenes, estatus, ${f("fecha_ingreso")}, notas, updated_by, updated_at`;

const aRequisicion = (r: any): Requisicion => ({
  id: r.id,
  codigo: r.codigo,
  fecha_recepcion: r.fecha_recepcion,
  unidad_solicitante: r.unidad_solicitante || "",
  cargo: r.cargo || "",
  sede: Number(r.sede),
  vacantes: Number(r.vacantes) || 1,
  meta_dias: Number(r.meta_dias) || META_DIAS_DEFECTO,
  estado: r.estado,
  notas: r.notas || "",
  created_by: r.created_by ?? null,
  created_at: iso(r.created_at),
});

const aCandidato = (c: any): Candidato => ({
  ...c,
  evaluacion_puntaje: c.evaluacion_puntaje || "",
  entrevista_tecnica_concepto: c.entrevista_tecnica_concepto || "",
  referencias_nota: c.referencias_nota || "",
  notas: c.notas || "",
  updated_at: iso(c.updated_at),
});

export async function listarMatriz(): Promise<{ requisiciones: Requisicion[]; candidatos: Candidato[] }> {
  await ensureTablas();
  const [reqs] = await db.execute(`SELECT ${COLS_REQ} FROM seleccion_requisiciones ORDER BY fecha_recepcion DESC, id DESC`);
  const [cands] = await db.execute(`SELECT ${COLS_CAND} FROM seleccion_candidatos ORDER BY requisicion_id, id`);
  return { requisiciones: (reqs as any[]).map(aRequisicion), candidatos: (cands as any[]).map(aCandidato) };
}

/* ------------------------------------------------------------ requisiciones */

function limpiarRequisicion(b: any) {
  const fecha_recepcion = fecha(b?.fecha_recepcion);
  if (!fecha_recepcion) throw new Error("La fecha de recepción es obligatoria.");
  const cargo = texto(b?.cargo, 160);
  if (!cargo) throw new Error("Indica el cargo vacante.");
  const sede = Number(b?.sede);
  if (!SEDES_SELECCION[sede]) throw new Error("Elige la sede.");
  const estado = ESTADOS_REQUISICION.some((e) => e.valor === b?.estado) ? b.estado : "abierta";
  return {
    codigo: texto(b?.codigo, 40).toUpperCase(),
    fecha_recepcion,
    unidad_solicitante: texto(b?.unidad_solicitante, 120),
    cargo,
    sede,
    vacantes: entero(b?.vacantes, 1, 100, 1),
    meta_dias: entero(b?.meta_dias, 1, 365, META_DIAS_DEFECTO),
    estado,
    notas: texto(b?.notas, 4000),
  };
}

/** REQ-AAAA-NNN siguiente del año de la fecha de recepción. */
async function siguienteCodigo(fechaRecepcion: string): Promise<string> {
  const anio = fechaRecepcion.slice(0, 4);
  const prefijo = `REQ-${anio}-`;
  const [filas] = await db.execute("SELECT codigo FROM seleccion_requisiciones WHERE codigo LIKE ?", [`${prefijo}%`]);
  const max = (filas as any[]).reduce((m, r) => Math.max(m, Number(String(r.codigo).slice(prefijo.length)) || 0), 0);
  return `${prefijo}${String(max + 1).padStart(3, "0")}`;
}

const esDuplicado = (e: any) => e?.code === "ER_DUP_ENTRY";

export async function crearRequisicion(b: any, por: string): Promise<number> {
  await ensureTablas();
  const r = limpiarRequisicion(b);
  const codigo = r.codigo || (await siguienteCodigo(r.fecha_recepcion));
  try {
    const [res] = await db.execute(
      `INSERT INTO seleccion_requisiciones
         (codigo, fecha_recepcion, unidad_solicitante, cargo, sede, vacantes, meta_dias, estado, notas, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [codigo, r.fecha_recepcion, r.unidad_solicitante, r.cargo, r.sede, r.vacantes, r.meta_dias, r.estado, r.notas, por],
    );
    return (res as any).insertId;
  } catch (e) {
    if (esDuplicado(e)) throw new Error(`Ya existe la requisición ${codigo}.`);
    throw e;
  }
}

export async function editarRequisicion(id: number, b: any): Promise<void> {
  await ensureTablas();
  const r = limpiarRequisicion(b);
  if (!r.codigo) throw new Error("El ID de requisición no puede quedar vacío.");
  try {
    const [res] = await db.execute(
      `UPDATE seleccion_requisiciones SET codigo=?, fecha_recepcion=?, unidad_solicitante=?, cargo=?, sede=?,
         vacantes=?, meta_dias=?, estado=?, notas=? WHERE id=?`,
      [r.codigo, r.fecha_recepcion, r.unidad_solicitante, r.cargo, r.sede, r.vacantes, r.meta_dias, r.estado, r.notas, id],
    );
    if (!(res as any).affectedRows) throw new Error("La requisición no existe.");
  } catch (e) {
    if (esDuplicado(e)) throw new Error(`Ya existe la requisición ${r.codigo}.`);
    throw e;
  }
}

/** Solo sin candidatos: con candidatos se cancela, para no perder el rastro. */
export async function borrarRequisicion(id: number): Promise<void> {
  await ensureTablas();
  const [c] = await db.execute("SELECT COUNT(*) AS n FROM seleccion_candidatos WHERE requisicion_id = ?", [id]);
  if (Number((c as any[])[0]?.n) > 0) {
    throw new Error("La requisición tiene candidatos: márcala como cancelada en vez de borrarla.");
  }
  await db.execute("DELETE FROM seleccion_requisiciones WHERE id = ?", [id]);
}

/* --------------------------------------------------------------- candidatos */

/** Valor limpio de un campo del candidato, o undefined si la clave no es editable. */
function valorCampo(clave: string, v: unknown): string | null | undefined {
  const campo = CAMPOS_CANDIDATO.find((c) => c.clave === clave);
  if (!campo) return undefined;
  if (v === null || v === undefined || v === "") {
    if (clave === "nombre") throw new Error("El nombre del candidato es obligatorio.");
    if (clave === "estatus") return "en_proceso";
    return campo.tipo === "fecha" || campo.tipo === "opcion" ? null : "";
  }
  switch (campo.tipo) {
    case "fecha": {
      const d = fecha(v);
      if (!d) throw new Error(`${campo.etiqueta}: fecha inválida.`);
      return d;
    }
    case "opcion":
      if (!campo.opciones!.some((o) => o.valor === v)) throw new Error(`${campo.etiqueta}: valor inválido.`);
      return String(v);
    default:
      return texto(v, campo.max ?? 200);
  }
}

async function requisicionExiste(id: number): Promise<boolean> {
  const [f] = await db.execute("SELECT id FROM seleccion_requisiciones WHERE id = ?", [id]);
  return (f as any[]).length > 0;
}

/** Regla del cierre: contratado lleva fecha de ingreso. */
function revisarCierre(c: Record<string, any>) {
  if (c.estatus === "contratado" && !c.fecha_ingreso) {
    throw new Error("Para marcarlo como contratado pon la fecha de ingreso.");
  }
}

export async function crearCandidato(b: any, por: string): Promise<number> {
  await ensureTablas();
  const requisicion_id = Number(b?.requisicion_id);
  if (!requisicion_id || !(await requisicionExiste(requisicion_id))) throw new Error("Elige la requisición.");
  const valores: Record<string, string | null> = {};
  for (const campo of CAMPOS_CANDIDATO) {
    const v = valorCampo(campo.clave, b?.[campo.clave]);
    if (v !== undefined) valores[campo.clave] = v;
  }
  revisarCierre(valores);
  const claves = Object.keys(valores);
  const [res] = await db.execute(
    `INSERT INTO seleccion_candidatos (requisicion_id, ${claves.join(", ")}, updated_by)
     VALUES (?, ${claves.map(() => "?").join(", ")}, ?)`,
    [requisicion_id, ...claves.map((k) => valores[k]), por],
  );
  const id = (res as any).insertId as number;
  await db.execute("INSERT INTO seleccion_eventos (candidato_id, campo, antes, despues, usuario) VALUES (?, 'alta', NULL, ?, ?)", [
    id,
    valores.nombre,
    por,
  ]);
  return id;
}

/** Cambia solo los campos que vienen y anota cada cambio en seleccion_eventos. */
export async function editarCandidato(id: number, b: any, por: string): Promise<Candidato> {
  await ensureTablas();
  const [filas] = await db.execute(`SELECT ${COLS_CAND} FROM seleccion_candidatos WHERE id = ?`, [id]);
  const actual = (filas as any[])[0];
  if (!actual) throw new Error("El candidato no existe.");

  const cambios: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(b ?? {})) {
    const limpio = valorCampo(k, v);
    if (limpio === undefined) continue;
    if ((actual[k] ?? null) !== limpio && !(actual[k] == null && limpio === "")) cambios[k] = limpio;
  }
  if (b?.requisicion_id !== undefined && Number(b.requisicion_id) !== actual.requisicion_id) {
    if (!(await requisicionExiste(Number(b.requisicion_id)))) throw new Error("La requisición no existe.");
    cambios.requisicion_id = String(Number(b.requisicion_id));
  }
  revisarCierre({ ...actual, ...cambios });

  const claves = Object.keys(cambios);
  if (claves.length) {
    await db.execute(`UPDATE seleccion_candidatos SET ${claves.map((k) => `${k} = ?`).join(", ")}, updated_by = ? WHERE id = ?`, [
      ...claves.map((k) => cambios[k]),
      por,
      id,
    ]);
    for (const k of claves) {
      await db.execute("INSERT INTO seleccion_eventos (candidato_id, campo, antes, despues, usuario) VALUES (?,?,?,?,?)", [
        id,
        k,
        actual[k] == null ? null : String(actual[k]),
        cambios[k],
        por,
      ]);
    }
  }
  const [nuevas] = await db.execute(`SELECT ${COLS_CAND} FROM seleccion_candidatos WHERE id = ?`, [id]);
  return aCandidato((nuevas as any[])[0]);
}

export async function borrarCandidato(id: number): Promise<void> {
  await ensureTablas();
  await db.execute("DELETE FROM seleccion_candidatos WHERE id = ?", [id]);
  await db.execute("DELETE FROM seleccion_eventos WHERE candidato_id = ?", [id]);
}

export type Evento = { id: number; campo: string; antes: string | null; despues: string | null; usuario: string | null; fecha: string | null };

export async function historialCandidato(id: number): Promise<Evento[]> {
  await ensureTablas();
  const [filas] = await db.execute(
    "SELECT id, campo, antes, despues, usuario, created_at FROM seleccion_eventos WHERE candidato_id = ? ORDER BY id DESC LIMIT 300",
    [id],
  );
  return (filas as any[]).map(({ created_at, ...e }) => ({ ...e, fecha: iso(created_at) }));
}
