import { db } from "@/lib/db";
import {
  MAX_DIAS_REPORTE,
  SEDES_ASISTENCIA,
  calcularReporte,
  diasDelRango,
  type DiaEspecial,
  type Empleado,
  type Reporte,
} from "@/lib/asistencia/tipos";

/**
 * Asistencia por biométrico (lib/asistencia/tipos.ts). Tablas (se crean solas;
 * referencia sql/asistencia_biometrico.sql):
 * - `biometrico_marcas`: una fila por marca; la misma (sede, código, fecha,
 *   hora) no entra dos veces, así que subir el mismo Excel otra vez no duplica.
 * - `biometrico_empleados`: el código del biométrico con su nombre, por sede.
 * - `biometrico_cargas`: cada Excel subido (para ver qué se cargó y deshacerlo).
 * - `biometrico_dias`: sábados de inventario y feriados (sede 0 = todas).
 */

let tablasListas: Promise<void> | null = null;
function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS biometrico_empleados (
          sede INT NOT NULL,
          codigo VARCHAR(40) NOT NULL,
          nombre VARCHAR(160) NOT NULL DEFAULT '',
          activo TINYINT(1) NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sede, codigo)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS biometrico_cargas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sede INT NOT NULL,
          archivo VARCHAR(200) NOT NULL DEFAULT '',
          marcas INT NOT NULL DEFAULT 0,
          nuevas INT NOT NULL DEFAULT 0,
          desde DATE NULL,
          hasta DATE NULL,
          usuario VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS biometrico_marcas (
          id INT AUTO_INCREMENT PRIMARY KEY,
          sede INT NOT NULL,
          codigo VARCHAR(40) NOT NULL,
          fecha DATE NOT NULL,
          hora TIME NOT NULL,
          carga_id INT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_marca (sede, codigo, fecha, hora),
          KEY idx_sede_fecha (sede, fecha),
          KEY idx_carga (carga_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS biometrico_dias (
          id INT AUTO_INCREMENT PRIMARY KEY,
          fecha DATE NOT NULL,
          sede INT NOT NULL DEFAULT 0,
          tipo VARCHAR(20) NOT NULL,
          nota VARCHAR(200) NOT NULL DEFAULT '',
          created_by VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_dia (fecha, sede)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;
const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const sedeValida = (v: unknown) => {
  const s = Number(v);
  if (!SEDES_ASISTENCIA[s]) throw new Error("Elige la sede.");
  return s;
};

/* ------------------------------------------------------------------- carga */

export const MAX_MARCAS_CARGA = 60_000;

export async function cargarMarcas(b: any, por: string) {
  await ensureTablas();
  const sede = sedeValida(b?.sede);
  const lista: any[] = Array.isArray(b?.marcas) ? b.marcas : [];
  if (!lista.length) throw new Error("El archivo no trae marcas.");
  if (lista.length > MAX_MARCAS_CARGA) throw new Error(`Son demasiadas marcas para una carga (máximo ${MAX_MARCAS_CARGA}); divide el archivo.`);

  const marcas = lista.flatMap((m) => {
    const codigo = texto(m?.codigo, 40);
    const fecha = texto(m?.fecha, 10);
    const hora = texto(m?.hora, 5);
    return codigo && RE_FECHA.test(fecha) && RE_HORA.test(hora) ? [{ codigo, nombre: texto(m?.nombre, 160), fecha, hora }] : [];
  });
  if (!marcas.length) throw new Error("Ninguna marca tiene código, fecha y hora válidos.");
  const fechas = marcas.map((m) => m.fecha).sort();

  const [c] = await db.execute(
    "INSERT INTO biometrico_cargas (sede, archivo, marcas, desde, hasta, usuario) VALUES (?,?,?,?,?,?)",
    [sede, texto(b?.archivo, 200), marcas.length, fechas[0], fechas[fechas.length - 1], por],
  );
  const cargaId = (c as any).insertId as number;

  // Empleados: el nombre del archivo pisa al guardado solo si viene.
  const nombres = new Map<string, string>();
  for (const m of marcas) if (m.nombre || !nombres.has(m.codigo)) nombres.set(m.codigo, m.nombre || nombres.get(m.codigo) || "");
  const empleados = [...nombres.entries()];
  for (let i = 0; i < empleados.length; i += 500) {
    const lote = empleados.slice(i, i + 500);
    await db.query(
      `INSERT INTO biometrico_empleados (sede, codigo, nombre) VALUES ${lote.map(() => "(?,?,?)").join(",")}
       ON DUPLICATE KEY UPDATE nombre = IF(VALUES(nombre) = '', nombre, VALUES(nombre))`,
      lote.flatMap(([codigo, nombre]) => [sede, codigo, nombre]),
    );
  }

  let nuevas = 0;
  for (let i = 0; i < marcas.length; i += 1000) {
    const lote = marcas.slice(i, i + 1000);
    const [r] = await db.query(
      `INSERT IGNORE INTO biometrico_marcas (sede, codigo, fecha, hora, carga_id) VALUES ${lote.map(() => "(?,?,?,?,?)").join(",")}`,
      lote.flatMap((m) => [sede, m.codigo, m.fecha, `${m.hora}:00`, cargaId]),
    );
    nuevas += (r as any).affectedRows ?? 0;
  }
  await db.execute("UPDATE biometrico_cargas SET nuevas = ? WHERE id = ?", [nuevas, cargaId]);
  return { carga_id: cargaId, marcas: marcas.length, nuevas, repetidas: marcas.length - nuevas, empleados: empleados.length };
}

export async function listarCargas() {
  await ensureTablas();
  const [filas] = await db.execute(
    `SELECT id, sede, archivo, marcas, nuevas, DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta,
            usuario, created_at FROM biometrico_cargas ORDER BY id DESC LIMIT 30`,
  );
  return (filas as any[]).map((f) => ({ ...f, created_at: iso(f.created_at) }));
}

/** Deshace una carga: borra las marcas que entraron con ella (las que ya estaban se quedan). */
export async function borrarCarga(id: number) {
  await ensureTablas();
  const [r] = await db.execute("DELETE FROM biometrico_marcas WHERE carga_id = ?", [id]);
  await db.execute("DELETE FROM biometrico_cargas WHERE id = ?", [id]);
  return { borradas: (r as any).affectedRows ?? 0 };
}

/* --------------------------------------------------------------- empleados */

export async function listarEmpleados(sede: number): Promise<Empleado[]> {
  await ensureTablas();
  const [filas] = await db.execute(
    `SELECT e.sede, e.codigo, e.nombre, e.activo,
            DATE_FORMAT(MIN(m.fecha), '%Y-%m-%d') AS primera_fecha, DATE_FORMAT(MAX(m.fecha), '%Y-%m-%d') AS ultima_fecha
       FROM biometrico_empleados e
       LEFT JOIN biometrico_marcas m ON m.sede = e.sede AND m.codigo = e.codigo
      WHERE e.sede = ?
      GROUP BY e.sede, e.codigo, e.nombre, e.activo
      ORDER BY e.nombre`,
    [sedeValida(sede)],
  );
  return (filas as any[]).map((e) => ({ ...e, sede: Number(e.sede), activo: Boolean(e.activo) }));
}

export async function editarEmpleado(b: any) {
  await ensureTablas();
  const sede = sedeValida(b?.sede);
  const codigo = texto(b?.codigo, 40);
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (b?.activo !== undefined) {
    sets.push("activo = ?");
    vals.push(b.activo ? 1 : 0);
  }
  if (b?.nombre !== undefined) {
    sets.push("nombre = ?");
    vals.push(texto(b.nombre, 160));
  }
  if (!codigo || !sets.length) throw new Error("Nada que cambiar.");
  await db.execute(`UPDATE biometrico_empleados SET ${sets.join(", ")} WHERE sede = ? AND codigo = ?`, [...vals, sede, codigo]);
}

/* ---------------------------------------------------------------- calendario */

export async function listarDias(): Promise<DiaEspecial[]> {
  await ensureTablas();
  const [filas] = await db.execute(
    "SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, sede, tipo, nota FROM biometrico_dias ORDER BY fecha DESC",
  );
  return (filas as any[]).map((d) => ({ ...d, sede: Number(d.sede) }));
}

export async function guardarDia(b: any, por: string) {
  await ensureTablas();
  const fecha = texto(b?.fecha, 10);
  if (!RE_FECHA.test(fecha)) throw new Error("Fecha inválida.");
  const sede = Number(b?.sede) || 0;
  if (sede && !SEDES_ASISTENCIA[sede]) throw new Error("Sede inválida.");
  const tipo = b?.tipo === "feriado" ? "feriado" : "inventario";
  if (tipo === "inventario" && new Date(`${fecha}T12:00:00Z`).getUTCDay() !== 6) {
    throw new Error("El día de inventario tiene que ser sábado.");
  }
  await db.execute(
    `INSERT INTO biometrico_dias (fecha, sede, tipo, nota, created_by) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE tipo = VALUES(tipo), nota = VALUES(nota)`,
    [fecha, sede, tipo, texto(b?.nota, 200), por],
  );
}

export async function borrarDia(id: number) {
  await ensureTablas();
  await db.execute("DELETE FROM biometrico_dias WHERE id = ?", [id]);
}

/* ------------------------------------------------------------------ reporte */

export async function reporte(sedeParam: unknown, desde: string, hasta: string): Promise<Reporte> {
  await ensureTablas();
  const sede = sedeValida(sedeParam);
  if (!RE_FECHA.test(desde) || !RE_FECHA.test(hasta) || desde > hasta) throw new Error("Rango de fechas inválido.");
  if (diasDelRango(desde, hasta).length > MAX_DIAS_REPORTE) throw new Error(`El rango no puede pasar de ${MAX_DIAS_REPORTE} días.`);

  const [marcas] = await db.execute(
    `SELECT codigo, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, TIME_FORMAT(hora, '%H:%i') AS hora
       FROM biometrico_marcas WHERE sede = ? AND fecha BETWEEN ? AND ?`,
    [sede, desde, hasta],
  );
  const [cob] = await db.execute("SELECT DATE_FORMAT(MAX(fecha), '%Y-%m-%d') AS f FROM biometrico_marcas WHERE sede = ?", [sede]);
  return calcularReporte({
    sede,
    desde,
    hasta,
    empleados: await listarEmpleados(sede),
    marcas: marcas as any[],
    especiales: await listarDias(),
    cobertura: (cob as any[])[0]?.f ?? null,
  });
}
