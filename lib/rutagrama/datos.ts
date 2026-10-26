import { db } from "@/lib/db";
import {
  SEDES_RUTAGRAMA,
  faltanteEnvio,
  firmaValida,
  limpiarDatos,
  mapaVacio,
  type DatosRutagrama,
  type Punto,
  type ResumenRutagrama,
  type Rutagrama,
} from "@/lib/rutagrama/tipos";
import { randomBytes } from "crypto";

/**
 * Rutagrama de los nuevos ingresos (lib/rutagrama/tipos.ts). Tablas (se crean
 * solas; referencia sql/rutagrama.sql):
 * - `rutagrama_registros`: una fila por trabajador. RRHH la crea con el nombre
 *   y la sede (la "invitación", con su `token` de 64 hex para el enlace) y el
 *   trabajador la llena desde /mi-ruta/<token>.
 * - `rutagrama_versiones`: cada envío tal como llegó, con su firma. Si RRHH
 *   reabre el enlace (cambio de domicilio) la versión anterior queda aquí.
 * - `rutagrama_sedes`: el punto del sitio de trabajo de cada sede, para que
 *   el trabajador no tenga que buscarlo en el mapa.
 */

let tablasListas: Promise<void> | null = null;
function ensureTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rutagrama_registros (
          id INT AUTO_INCREMENT PRIMARY KEY,
          token CHAR(64) NOT NULL,
          sede INT NOT NULL,
          estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
          nombre VARCHAR(160) NOT NULL,
          cedula VARCHAR(20) NOT NULL DEFAULT '',
          direccion VARCHAR(400) NOT NULL DEFAULT '',
          cargo VARCHAR(120) NOT NULL DEFAULT '',
          turno VARCHAR(60) NOT NULL DEFAULT '',
          dias VARCHAR(20) NOT NULL DEFAULT '',
          tiempo_min INT NULL,
          ida_json TEXT NULL,
          referencias_ida VARCHAR(400) NOT NULL DEFAULT '',
          vuelta_igual TINYINT(1) NOT NULL DEFAULT 1,
          vuelta_json TEXT NULL,
          referencias_vuelta VARCHAR(400) NOT NULL DEFAULT '',
          mapa_json MEDIUMTEXT NULL,
          firma MEDIUMTEXT NULL,
          enviado_at DATETIME NULL,
          envios INT NOT NULL DEFAULT 0,
          created_by VARCHAR(190) NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_rutagrama_token (token),
          KEY idx_rutagrama_sede (sede, estado)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rutagrama_versiones (
          id INT AUTO_INCREMENT PRIMARY KEY,
          registro_id INT NOT NULL,
          datos_json MEDIUMTEXT NOT NULL,
          firma MEDIUMTEXT NULL,
          ip VARCHAR(64) NULL,
          enviado_at DATETIME NOT NULL,
          KEY idx_rutagrama_version (registro_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rutagrama_sedes (
          sede INT PRIMARY KEY,
          lat DOUBLE NOT NULL,
          lng DOUBLE NOT NULL,
          direccion VARCHAR(300) NOT NULL DEFAULT '',
          updated_by VARCHAR(190) NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => {
      tablasListas = null;
      throw e;
    });
  }
  return tablasListas;
}

const texto = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const json = <T>(v: unknown, vacio: T): T => {
  try {
    return v ? (JSON.parse(String(v)) as T) : vacio;
  } catch {
    return vacio;
  }
};
const sedeValida = (v: unknown) => {
  const s = Number(v);
  if (!SEDES_RUTAGRAMA[s]) throw new Error("Elige la sede.");
  return s;
};
export const RE_TOKEN = /^[0-9a-f]{64}$/;

const COLUMNAS_RESUMEN = `id, token, sede, estado, nombre, cedula, cargo, enviado_at, envios, created_by, created_at`;

function resumen(f: any): ResumenRutagrama {
  return {
    id: Number(f.id),
    token: f.token,
    sede: Number(f.sede),
    estado: f.estado === "completado" ? "completado" : "pendiente",
    nombre: f.nombre,
    cedula: f.cedula,
    cargo: f.cargo,
    enviado_at: iso(f.enviado_at),
    envios: Number(f.envios) || 0,
    created_by: f.created_by ?? null,
    created_at: iso(f.created_at),
  };
}

function datos(f: any): DatosRutagrama {
  return {
    nombre: f.nombre,
    cedula: f.cedula,
    direccion: f.direccion,
    cargo: f.cargo,
    turno: f.turno,
    dias: String(f.dias || "").split(",").filter(Boolean) as DatosRutagrama["dias"],
    ida: json(f.ida_json, []),
    referencias_ida: f.referencias_ida,
    vuelta_igual: Boolean(f.vuelta_igual),
    vuelta: json(f.vuelta_json, []),
    referencias_vuelta: f.referencias_vuelta,
    tiempo_min: f.tiempo_min == null ? null : Number(f.tiempo_min),
    mapa: { ...mapaVacio(), ...json(f.mapa_json, {}) },
  };
}

/* ------------------------------------------------------------------- RRHH */

export async function listar(sede: number | null): Promise<ResumenRutagrama[]> {
  await ensureTablas();
  const [filas] = sede
    ? await db.execute(`SELECT ${COLUMNAS_RESUMEN} FROM rutagrama_registros WHERE sede = ? ORDER BY id DESC`, [sede])
    : await db.execute(`SELECT ${COLUMNAS_RESUMEN} FROM rutagrama_registros ORDER BY id DESC`);
  return (filas as any[]).map(resumen);
}

/** La invitación: RRHH pone lo que ya sabe y el trabajador completa el resto. */
export async function crear(b: any, por: string) {
  await ensureTablas();
  const sede = sedeValida(b?.sede);
  const nombre = texto(b?.nombre, 160);
  if (nombre.length < 3) throw new Error("Escribe el nombre del trabajador.");
  const token = randomBytes(32).toString("hex");
  const [r] = await db.execute(
    "INSERT INTO rutagrama_registros (token, sede, nombre, cedula, cargo, created_by) VALUES (?,?,?,?,?,?)",
    [token, sede, nombre, texto(b?.cedula, 20), texto(b?.cargo, 120), por],
  );
  return { id: (r as any).insertId as number, token };
}

export async function detalle(id: number): Promise<Rutagrama | null> {
  await ensureTablas();
  const [filas] = await db.execute("SELECT * FROM rutagrama_registros WHERE id = ?", [id]);
  const f = (filas as any[])[0];
  if (!f) return null;
  const [versiones] = await db.execute(
    "SELECT id, enviado_at FROM rutagrama_versiones WHERE registro_id = ? ORDER BY id DESC",
    [id],
  );
  return {
    ...resumen(f),
    ...datos(f),
    firma: f.firma ?? null,
    versiones: (versiones as any[]).map((v) => ({ id: Number(v.id), enviado_at: iso(v.enviado_at) })),
  };
}

/** Corrige lo que puso RRHH en la invitación (nombre, cédula, cargo, sede). */
export async function editar(id: number, b: any) {
  await ensureTablas();
  const sets: string[] = [];
  const vals: (string | number)[] = [];
  if (b?.nombre !== undefined) {
    const nombre = texto(b.nombre, 160);
    if (nombre.length < 3) throw new Error("Escribe el nombre del trabajador.");
    sets.push("nombre = ?");
    vals.push(nombre);
  }
  if (b?.cedula !== undefined) {
    sets.push("cedula = ?");
    vals.push(texto(b.cedula, 20));
  }
  if (b?.cargo !== undefined) {
    sets.push("cargo = ?");
    vals.push(texto(b.cargo, 120));
  }
  if (b?.sede !== undefined) {
    sets.push("sede = ?");
    vals.push(sedeValida(b.sede));
  }
  if (!sets.length) throw new Error("Nada que cambiar.");
  await db.execute(`UPDATE rutagrama_registros SET ${sets.join(", ")} WHERE id = ?`, [...vals, id]);
}

/** Vuelve a abrir el enlace con lo último que mandó (cambio de domicilio o un error). */
export async function reabrir(id: number) {
  await ensureTablas();
  await db.execute("UPDATE rutagrama_registros SET estado = 'pendiente' WHERE id = ?", [id]);
}

export async function borrar(id: number) {
  await ensureTablas();
  await db.execute("DELETE FROM rutagrama_versiones WHERE registro_id = ?", [id]);
  await db.execute("DELETE FROM rutagrama_registros WHERE id = ?", [id]);
}

/* ------------------------------------------------------------------ sedes */

export type SitioSede = { sede: number; lat: number; lng: number; direccion: string };

export async function sitiosSedes(): Promise<SitioSede[]> {
  await ensureTablas();
  const [filas] = await db.execute("SELECT sede, lat, lng, direccion FROM rutagrama_sedes");
  return (filas as any[]).map((f) => ({ sede: Number(f.sede), lat: Number(f.lat), lng: Number(f.lng), direccion: f.direccion }));
}

export async function guardarSitio(b: any, por: string) {
  await ensureTablas();
  const sede = sedeValida(b?.sede);
  const lat = Number(b?.lat);
  const lng = Number(b?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error("Marca el sitio en el mapa.");
  await db.execute(
    `INSERT INTO rutagrama_sedes (sede, lat, lng, direccion, updated_by) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), direccion = VALUES(direccion), updated_by = VALUES(updated_by)`,
    [sede, lat, lng, texto(b?.direccion, 300), por],
  );
}

/* --------------------------------------------------------------- público */

export type VistaPublica =
  | { estado: "completado"; nombre: string; enviado_at: string | null }
  | {
      estado: "pendiente";
      sede: number;
      ciudad: string;
      datos: DatosRutagrama;
      /** El sitio de trabajo de la sede, si RRHH lo marcó. */
      trabajo: Punto | null;
      direccionTrabajo: string;
    };

/**
 * Lo que ve quien abre el enlace. Ya enviado, solo el nombre y la fecha:
 * el enlace puede reenviarse y nadie más tiene por qué ver la dirección.
 */
export async function vistaPublica(token: string): Promise<VistaPublica | null> {
  if (!RE_TOKEN.test(token)) return null;
  await ensureTablas();
  const [filas] = await db.execute("SELECT * FROM rutagrama_registros WHERE token = ?", [token]);
  const f = (filas as any[])[0];
  if (!f) return null;
  if (f.estado === "completado") return { estado: "completado", nombre: f.nombre, enviado_at: iso(f.enviado_at) };
  const [sitio] = await db.execute("SELECT lat, lng, direccion FROM rutagrama_sedes WHERE sede = ?", [f.sede]);
  const s = (sitio as any[])[0];
  return {
    estado: "pendiente",
    sede: Number(f.sede),
    ciudad: SEDES_RUTAGRAMA[f.sede]?.ciudad ?? "",
    datos: datos(f),
    trabajo: s ? [Number(s.lat), Number(s.lng)] : null,
    direccionTrabajo: s?.direccion ?? "",
  };
}

export class ErrorEnvio extends Error {}

export async function enviar(token: string, b: any, ip: string | null) {
  if (!RE_TOKEN.test(token)) throw new ErrorEnvio("Enlace no válido.");
  const d = limpiarDatos(b);
  const falta = faltanteEnvio(d);
  if (falta) throw new ErrorEnvio(falta);
  if (b?.declaro !== true) throw new ErrorEnvio("Marca que declaras bajo fe de juramento que los datos son ciertos.");
  if (!firmaValida(b?.firma)) throw new ErrorEnvio("Firma en el recuadro antes de enviar.");
  await ensureTablas();

  const [filas] = await db.execute("SELECT id, estado FROM rutagrama_registros WHERE token = ?", [token]);
  const f = (filas as any[])[0];
  if (!f) throw new ErrorEnvio("Este enlace ya no existe. Pide uno nuevo a Recursos Humanos.");
  if (f.estado === "completado") throw new ErrorEnvio("Este rutagrama ya se envió. Si necesitas cambiar algo, avisa a Recursos Humanos.");

  const ahora = new Date();
  const [r] = await db.execute(
    `UPDATE rutagrama_registros SET estado = 'completado', nombre = ?, cedula = ?, direccion = ?, cargo = ?, turno = ?, dias = ?,
       tiempo_min = ?, ida_json = ?, referencias_ida = ?, vuelta_igual = ?, vuelta_json = ?, referencias_vuelta = ?, mapa_json = ?,
       firma = ?, enviado_at = ?, envios = envios + 1
     WHERE id = ? AND estado = 'pendiente'`,
    [
      d.nombre,
      d.cedula,
      d.direccion,
      d.cargo,
      d.turno,
      d.dias.join(","),
      d.tiempo_min,
      JSON.stringify(d.ida),
      d.referencias_ida,
      d.vuelta_igual ? 1 : 0,
      JSON.stringify(d.vuelta),
      d.referencias_vuelta,
      JSON.stringify(d.mapa),
      b.firma,
      ahora,
      f.id,
    ],
  );
  if (!(r as any).affectedRows) throw new ErrorEnvio("Este rutagrama ya se envió.");
  await db.execute("INSERT INTO rutagrama_versiones (registro_id, datos_json, firma, ip, enviado_at) VALUES (?,?,?,?,?)", [
    f.id,
    JSON.stringify(d),
    b.firma,
    ip ? ip.slice(0, 64) : null,
    ahora,
  ]);
  return { enviado_at: ahora.toISOString() };
}
