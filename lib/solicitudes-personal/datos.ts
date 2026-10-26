import { db } from "@/lib/db";
import { crearRequisicion, editarCandidato, listarMatriz } from "@/lib/seleccion/datos";
import { estadoRequisicion, FASES, hoyCaracas, SEDES_SELECCION, situacion, UNIDADES, type Candidato } from "@/lib/seleccion/tipos";
import { avisarPersonal } from "@/lib/solicitudes-personal/aviso";
import {
  CAMPOS_GERENTE,
  ESTADOS_CON_MOTIVO,
  MOTIVOS,
  normRol,
  ROL_RRHH,
  URGENCIAS,
  type Avance,
  type CandidatoGerente,
  type Evento,
  type OrigenSolicitud,
  type Solicitud,
} from "@/lib/solicitudes-personal/tipos";

/**
 * Datos de las solicitudes de personal (ver tipos.ts). Tablas
 * `personal_solicitudes` y `personal_solicitudes_eventos`, se crean solas.
 */

let tablasListas: Promise<void> | null = null;
function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS personal_solicitudes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          cargo VARCHAR(160) NOT NULL,
          area VARCHAR(120) NOT NULL DEFAULT '',
          sede INT NOT NULL,
          cantidad INT NOT NULL DEFAULT 1,
          motivo VARCHAR(20) NOT NULL DEFAULT 'nuevo',
          reemplaza VARCHAR(160) NOT NULL DEFAULT '',
          urgencia VARCHAR(10) NOT NULL DEFAULT 'media',
          fecha_deseada DATE NULL,
          perfil TEXT NULL,
          requisitos TEXT NULL,
          salario VARCHAR(120) NOT NULL DEFAULT '',
          estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          solicitante_email VARCHAR(190) NOT NULL,
          solicitante_nombre VARCHAR(190) NOT NULL DEFAULT '',
          solicitante_rol VARCHAR(80) NOT NULL DEFAULT '',
          decidido_por_email VARCHAR(190) NULL,
          decidido_por_nombre VARCHAR(190) NULL,
          decidido_at TIMESTAMP NULL,
          motivo_rechazo TEXT NULL,
          requisicion_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          KEY idx_estado (estado),
          KEY idx_solicitante (solicitante_email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS personal_solicitudes_eventos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          solicitud_id INT NOT NULL,
          accion VARCHAR(30) NOT NULL,
          detalle TEXT NULL,
          usuario VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_solicitud (solicitud_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

/** Quien llama, sacado del token. */
export type Usuario = { email: string; nombre: string; rol: string; cids: number | null };
export const usuarioDe = (p: any): Usuario => ({
  email: String(p?.email ?? "").toLowerCase().trim(),
  nombre: String(p?.name ?? p?.email ?? ""),
  rol: normRol(p?.role),
  cids: Number(p?.cids) || null,
});
const esSuper = (u: Usuario) => u.rol === "superadmin";
const esRRHH = (u: Usuario) => u.rol === ROL_RRHH;

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);

const COLS = `id, cargo, area, sede, cantidad, motivo, reemplaza, urgencia, DATE_FORMAT(fecha_deseada, '%Y-%m-%d') AS fecha_deseada,
  perfil, requisitos, salario, estado, solicitante_email, solicitante_nombre, solicitante_rol, decidido_por_email,
  decidido_por_nombre, decidido_at, motivo_rechazo, requisicion_id, created_at`;

const aSolicitud = (r: any): Solicitud => ({
  ...r,
  sede: Number(r.sede),
  cantidad: Number(r.cantidad) || 1,
  perfil: r.perfil || "",
  requisitos: r.requisitos || "",
  motivo_rechazo: r.motivo_rechazo || "",
  requisicion_id: r.requisicion_id ? Number(r.requisicion_id) : null,
  decidido_at: iso(r.decidido_at),
  created_at: iso(r.created_at),
  avance: null,
});

/** La sede sale del cids del gerente; sin cids válido la elige él. */
function limpiar(b: any, u: Usuario) {
  const cargo = texto(b?.cargo, 160);
  if (!cargo) throw new Error("Indica el cargo.");
  const area = texto(b?.area, 120);
  if (!UNIDADES.includes(area)) throw new Error("Elige el área.");
  const sede = !esSuper(u) && u.cids && SEDES_SELECCION[u.cids] ? u.cids : Number(b?.sede);
  if (!SEDES_SELECCION[sede]) throw new Error("Elige la sede.");
  const motivo = b?.motivo in MOTIVOS ? b.motivo : null;
  if (!motivo) throw new Error("Indica si es un puesto nuevo o un reemplazo.");
  const reemplaza = texto(b?.reemplaza, 160);
  if (motivo === "reemplazo" && !reemplaza) throw new Error("Indica a quién reemplaza.");
  const urgencia = b?.urgencia in URGENCIAS ? b.urgencia : null;
  if (!urgencia) throw new Error("Indica la urgencia.");
  const fd = texto(b?.fecha_deseada, 10);
  const perfil = texto(b?.perfil, 4000);
  if (!perfil) throw new Error("Describe el perfil y las funciones del cargo.");
  const cantidad = Math.round(Number(b?.cantidad));
  return {
    cargo,
    area,
    sede,
    cantidad: Number.isFinite(cantidad) ? Math.max(1, Math.min(50, cantidad)) : 1,
    motivo,
    reemplaza: motivo === "reemplazo" ? reemplaza : "",
    urgencia,
    fecha_deseada: RE_FECHA.test(fd) ? fd : null,
    perfil,
    requisitos: texto(b?.requisitos, 4000),
    salario: texto(b?.salario, 120),
  };
}

async function evento(id: number, accion: string, detalle: string, usuario: string) {
  await db.execute("INSERT INTO personal_solicitudes_eventos (solicitud_id, accion, detalle, usuario) VALUES (?,?,?,?)", [
    id,
    accion,
    detalle,
    usuario,
  ]);
}

/** El avance de cada aprobada, leído de la matriz de Selección. */
async function conAvance(lista: Solicitud[]): Promise<Solicitud[]> {
  if (!lista.some((s) => s.requisicion_id)) return lista;
  const { requisiciones, candidatos } = await listarMatriz();
  const hoy = hoyCaracas();
  return lista.map((s) => {
    const req = requisiciones.find((r) => r.id === s.requisicion_id);
    if (!req) return s;
    const suyos = candidatos.filter((c) => c.requisicion_id === req.id);
    const e = estadoRequisicion(req, suyos, hoy);
    const enProceso = suyos.filter((c) => c.estatus === "en_proceso");
    const max = Math.max(-1, ...enProceso.map((c) => situacion(c).avance));
    const avance: Avance = {
      codigo: req.codigo,
      etiqueta: e.etiqueta,
      tono: e.tono,
      vacantes: req.vacantes,
      contratados: e.contratados,
      candidatos: enProceso.length,
      fase: max >= 0 ? (FASES[max]?.etiqueta ?? "Listo para ingresar") : null,
      dias: e.dias,
      meta: req.meta_dias,
    };
    return { ...s, avance };
  });
}

/** Lo que ve cada uno: el gerente las suyas, RRHH las aprobadas, el SuperAdmin todo. */
export async function listar(u: Usuario): Promise<Solicitud[]> {
  await ensureTablas();
  const [where, params]: [string, string[]] = esSuper(u)
    ? ["1=1", []]
    : esRRHH(u)
      ? ["estado = 'aprobada'", []]
      : ["solicitante_email = ?", [u.email]];
  const [filas] = await db.execute(`SELECT ${COLS} FROM personal_solicitudes WHERE ${where} ORDER BY id DESC`, params);
  return conAvance((filas as any[]).map(aSolicitud));
}

/** Una sola, solo si quien la pide la puede ver (null si no). */
export async function obtener(id: number, u: Usuario): Promise<Solicitud | null> {
  await ensureTablas();
  const [filas] = await db.execute(`SELECT ${COLS} FROM personal_solicitudes WHERE id = ?`, [id]);
  const s = (filas as any[])[0] ? aSolicitud((filas as any[])[0]) : null;
  if (!s) return null;
  const ve = esSuper(u) || (esRRHH(u) && s.estado === "aprobada") || s.solicitante_email === u.email;
  return ve ? (await conAvance([s]))[0] : null;
}

export async function historial(id: number): Promise<Evento[]> {
  const [filas] = await db.execute(
    "SELECT id, accion, detalle, usuario, created_at FROM personal_solicitudes_eventos WHERE solicitud_id = ? ORDER BY id",
    [id],
  );
  return (filas as any[]).map((e) => ({ ...e, detalle: e.detalle || "", usuario: e.usuario || "", created_at: iso(e.created_at) }));
}

export async function crear(b: any, u: Usuario): Promise<number> {
  await ensureTablas();
  const s = limpiar(b, u);
  const [res] = await db.execute(
    `INSERT INTO personal_solicitudes (cargo, area, sede, cantidad, motivo, reemplaza, urgencia, fecha_deseada, perfil,
       requisitos, salario, solicitante_email, solicitante_nombre, solicitante_rol)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [s.cargo, s.area, s.sede, s.cantidad, s.motivo, s.reemplaza, s.urgencia, s.fecha_deseada, s.perfil, s.requisitos,
      s.salario, u.email, u.nombre, u.rol],
  );
  const id = (res as any).insertId;
  await evento(id, "creada", `Urgencia ${URGENCIAS[s.urgencia as keyof typeof URGENCIAS].etiqueta}`, u.nombre);
  return id;
}

/** Solo quien la pidió y mientras nadie la decidió. */
export async function editar(id: number, b: any, u: Usuario): Promise<void> {
  await ensureTablas();
  const s = limpiar(b, u);
  const [res] = await db.execute(
    `UPDATE personal_solicitudes SET cargo=?, area=?, sede=?, cantidad=?, motivo=?, reemplaza=?, urgencia=?, fecha_deseada=?,
       perfil=?, requisitos=?, salario=? WHERE id=? AND solicitante_email=? AND estado='pendiente'`,
    [s.cargo, s.area, s.sede, s.cantidad, s.motivo, s.reemplaza, s.urgencia, s.fecha_deseada, s.perfil, s.requisitos,
      s.salario, id, u.email],
  );
  if (!(res as any).affectedRows) throw new Error("Solo se edita una solicitud tuya que todavía no se decidió.");
  await evento(id, "editada", "", u.nombre);
}

export async function retirar(id: number, u: Usuario): Promise<void> {
  await ensureTablas();
  const [res] = await db.execute(
    "UPDATE personal_solicitudes SET estado='retirada' WHERE id=? AND solicitante_email=? AND estado='pendiente'",
    [id, u.email],
  );
  if (!(res as any).affectedRows) throw new Error("Solo se retira una solicitud tuya que todavía no se decidió.");
  await evento(id, "retirada", "", u.nombre);
}

export async function rechazar(id: number, motivo: string, u: Usuario): Promise<void> {
  await ensureTablas();
  const m = texto(motivo, 2000);
  if (!m) throw new Error("Escribe el motivo del rechazo: el gerente lo va a ver.");
  const [res] = await db.execute(
    `UPDATE personal_solicitudes SET estado='rechazada', motivo_rechazo=?, decidido_por_email=?, decidido_por_nombre=?,
       decidido_at=NOW() WHERE id=? AND estado='pendiente'`,
    [m, u.email, u.nombre, id],
  );
  if (!(res as any).affectedRows) throw new Error("La solicitud ya no está por aprobar.");
  await evento(id, "rechazada", m, u.nombre);
}

/**
 * Aprueba y crea la requisición en Selección. Primero se toma la solicitud
 * (estado pendiente → aprobada) para que dos clics no creen dos requisiciones;
 * si la requisición falla, vuelve a pendiente.
 */
export async function aprobar(id: number, u: Usuario): Promise<void> {
  await ensureTablas();
  const [res] = await db.execute(
    `UPDATE personal_solicitudes SET estado='aprobada', decidido_por_email=?, decidido_por_nombre=?, decidido_at=NOW()
     WHERE id=? AND estado='pendiente'`,
    [u.email, u.nombre, id],
  );
  if (!(res as any).affectedRows) throw new Error("La solicitud ya no está por aprobar.");
  const [filas] = await db.execute(`SELECT ${COLS} FROM personal_solicitudes WHERE id = ?`, [id]);
  const s = aSolicitud((filas as any[])[0]);
  try {
    const hoy = hoyCaracas();
    const notas = [
      `Solicitud de personal SP-${s.id}, pedida por ${s.solicitante_nombre} (${s.solicitante_email}).`,
      `Aprobada por ${u.nombre} el ${hoy}. Urgencia ${URGENCIAS[s.urgencia].etiqueta}.`,
      MOTIVOS[s.motivo] + (s.reemplaza ? `: reemplaza a ${s.reemplaza}` : ""),
      s.fecha_deseada ? `Ingreso deseado: ${s.fecha_deseada}.` : "",
      s.salario ? `Salario o rango: ${s.salario}.` : "",
      `Perfil: ${s.perfil}`,
      s.requisitos ? `Requisitos: ${s.requisitos}` : "",
    ].filter(Boolean);
    const reqId = await crearRequisicion(
      {
        fecha_recepcion: hoy,
        unidad_solicitante: s.area,
        cargo: s.cargo,
        sede: s.sede,
        vacantes: s.cantidad,
        meta_dias: URGENCIAS[s.urgencia].dias,
        notas: notas.join("\n"),
      },
      u.email,
    );
    await db.execute("UPDATE personal_solicitudes SET requisicion_id=? WHERE id=?", [reqId, id]);
  } catch (e) {
    await db.execute(
      "UPDATE personal_solicitudes SET estado='pendiente', decidido_por_email=NULL, decidido_por_nombre=NULL, decidido_at=NULL WHERE id=?",
      [id],
    );
    throw e;
  }
  await evento(id, "aprobada", "", u.nombre);
}

/* ------------------------------------------------- unión con la matriz de Selección */

/** La solicitud de donde nació cada requisición (las que RRHH creó a mano antes no tienen). */
export async function solicitudesPorRequisicion(): Promise<Record<number, OrigenSolicitud>> {
  await ensureTablas();
  const [filas] = await db.execute(
    `SELECT id, requisicion_id, urgencia, solicitante_nombre, decidido_por_nombre,
       DATE_FORMAT(fecha_deseada, '%Y-%m-%d') AS fecha_deseada, created_at, decidido_at
     FROM personal_solicitudes WHERE requisicion_id IS NOT NULL`,
  );
  const mapa: Record<number, OrigenSolicitud> = {};
  for (const r of filas as any[]) {
    mapa[Number(r.requisicion_id)] = {
      id: r.id,
      urgencia: r.urgencia,
      solicitante_nombre: r.solicitante_nombre,
      decidido_por_nombre: r.decidido_por_nombre,
      fecha_deseada: r.fecha_deseada,
      created_at: iso(r.created_at),
      decidido_at: iso(r.decidido_at),
    };
  }
  return mapa;
}

/** id de la solicitud enlazada a una requisición, o null. */
export async function solicitudDeRequisicion(requisicionId: number): Promise<number | null> {
  await ensureTablas();
  const [f] = await db.execute("SELECT id FROM personal_solicitudes WHERE requisicion_id = ?", [requisicionId]);
  return (f as any[])[0]?.id ?? null;
}

/** Estado guardado de la requisición (antes de editarla), para saber si cambió. */
export async function estadoGuardado(requisicionId: number): Promise<string | null> {
  const [f] = await db.execute("SELECT estado FROM seleccion_requisiciones WHERE id = ?", [requisicionId]);
  return (f as any[])[0]?.estado ?? null;
}

/**
 * RRHH pausó, canceló o reabrió la requisición: queda en el historial de la
 * solicitud y, si pausó o canceló, se le avisa al gerente con el motivo.
 */
export async function cambioDeRequisicion(requisicionId: number, antes: string | null, despues: string, motivo: string, usuario: string) {
  if (antes === despues) return;
  const id = await solicitudDeRequisicion(requisicionId);
  if (!id) return;
  if (ESTADOS_CON_MOTIVO.includes(despues)) {
    await evento(id, despues, texto(motivo, 2000), usuario);
    avisarPersonal(despues as "pausada" | "cancelada", id);
  } else if (despues === "abierta") {
    await evento(id, "reabierta", "", usuario);
  }
}

/**
 * Tras guardar un candidato: si con él la requisición llegó a sus vacantes, la
 * solicitud queda "cubierta" y se le avisa al gerente. Una sola vez por solicitud.
 */
export async function revisarCubierta(requisicionId: number, usuario: string) {
  const id = await solicitudDeRequisicion(requisicionId);
  if (!id) return;
  const [ya] = await db.execute("SELECT 1 FROM personal_solicitudes_eventos WHERE solicitud_id = ? AND accion = 'cubierta'", [id]);
  if ((ya as any[]).length) return;
  const [f] = await db.execute(
    `SELECT r.vacantes, (SELECT COUNT(*) FROM seleccion_candidatos c WHERE c.requisicion_id = r.id AND c.estatus = 'contratado') AS contratados
     FROM seleccion_requisiciones r WHERE r.id = ?`,
    [requisicionId],
  );
  const r = (f as any[])[0];
  if (!r || Number(r.contratados) < Math.max(1, Number(r.vacantes))) return;
  await evento(id, "cubierta", `${r.contratados} contratado${Number(r.contratados) === 1 ? "" : "s"}`, usuario);
  avisarPersonal("cubierta", id);
}

/* ---------------------------------------------- candidatos que ve el gerente */

/** Desde que pasó las evaluaciones (le toca la entrevista técnica) y mientras no lo descalificaron. */
const veGerente = (c: Candidato) =>
  c.estatus !== "descalificado" && (c.evaluacion === "favorable" || !!c.entrevista_tecnica || c.terna === "si" || c.estatus === "contratado");

export async function candidatosParaGerente(requisicionId: number): Promise<CandidatoGerente[]> {
  const { candidatos } = await listarMatriz();
  return candidatos
    .filter((c) => c.requisicion_id === requisicionId && veGerente(c))
    .map((c) => {
      const sit = situacion(c);
      return {
        id: c.id,
        nombre: c.nombre,
        fase: sit.texto,
        tono: sit.tono,
        terna: c.terna === "si",
        entrevista_tecnica_fecha: c.entrevista_tecnica_fecha,
        entrevista_tecnica: c.entrevista_tecnica,
        entrevista_tecnica_concepto: c.entrevista_tecnica_concepto,
      };
    });
}

/** El gerente que pidió el cargo (o el SuperAdmin) anota la entrevista técnica de un candidato. */
export async function entrevistaDelGerente(solicitudId: number, candidatoId: number, b: any, u: Usuario): Promise<void> {
  const s = await obtener(solicitudId, u);
  if (!s || !s.requisicion_id || (!esSuper(u) && s.solicitante_email !== u.email)) {
    throw new Error("Solo quien pidió el cargo anota la entrevista técnica.");
  }
  if (!(await candidatosParaGerente(s.requisicion_id)).some((c) => c.id === candidatoId)) {
    throw new Error("Ese candidato no está en tu proceso.");
  }
  const cambios: Record<string, unknown> = {};
  for (const k of CAMPOS_GERENTE) if (k in (b ?? {})) cambios[k] = b[k];
  await editarCandidato(candidatoId, cambios, u.email);
}
