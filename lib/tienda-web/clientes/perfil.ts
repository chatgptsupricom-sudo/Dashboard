/**
 * Perfil que el cliente edita en «Mi cuenta»: nombre del cliente, logo, redes sociales y sus razones sociales
 * con RIF, cada una con sus sucursales (dirección, contacto y teléfono). Es de la empresa, no del correo: todos
 * los accesos de la misma empresa (mismo RIF) ven y editan el mismo perfil.
 *
 * No escribe en Odoo. La primera vez se propone con lo que hay en Odoo (sus fichas y direcciones de entrega);
 * cada razón social dice si su RIF ya está registrado en Odoo. Lo ve su vendedor para actualizar Odoo.
 *
 * Tablas `tienda_perfiles` (una fila por empresa, `version` para que dos personas no se pisen) y
 * `tienda_perfiles_historial` (lo que había antes de cada cambio, quién y cuándo). Se crean solas.
 */
import { db } from "@/lib/db";
import { fichasDe, type ClienteOdoo } from "./odoo";
import { claveDocumento, LOGO_MAX_BYTES, rifValido, telefonoValido, tipoDeImagen, validarPerfil, type DatosPerfil } from "./tipos";

let tablasListas: Promise<void> | null = null;
function asegurarTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_perfiles (
          clave VARCHAR(40) PRIMARY KEY,
          nombre VARCHAR(160) NOT NULL,
          datos MEDIUMTEXT NOT NULL,
          logo MEDIUMBLOB NULL,
          logo_tipo VARCHAR(20) NULL,
          version INT NOT NULL DEFAULT 1,
          actualizado_por VARCHAR(160) NULL,
          actualizado_el DATETIME NULL,
          creado_el TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_perfiles_historial (
          id INT AUTO_INCREMENT PRIMARY KEY,
          clave VARCHAR(40) NOT NULL,
          version INT NOT NULL,
          datos_antes MEDIUMTEXT NULL,
          logo_cambio VARCHAR(20) NULL,
          por VARCHAR(160) NOT NULL,
          el DATETIME NOT NULL,
          KEY idx_clave (clave, el)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => { tablasListas = null; throw e; });
  }
  return tablasListas;
}

/** La empresa del cliente: su RIF/RUC normalizado, o su primera ficha de Odoo si no tiene. */
export const claveEmpresa = (c: ClienteOdoo) => {
  const d = claveDocumento(c.documento);
  return d.length >= 6 ? `d:${d}`.slice(0, 40) : `p:${Math.min(...c.partners)}`;
};

const ahora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

type Fichas = Awaited<ReturnType<typeof fichasDe>>;

/** Lo que se propone la primera vez, con lo que hay en Odoo (mínimo una razón social con una sucursal). */
function propuesta(c: ClienteOdoo, fichas: Fichas): DatosPerfil {
  const porRif = new Map<string, DatosPerfil["razones"][number]>();
  const contacto = (c.nombre || "").slice(0, 80);
  for (const f of fichas) {
    const rif = rifValido(f.documento) || f.documento;
    const clave = claveDocumento(rif);
    if (!clave) continue;
    if (!porRif.has(clave)) porRif.set(clave, { razon: f.nombre, rif, sucursales: [] });
    const r = porRif.get(clave)!;
    const tel = telefonoValido(f.telefono) || "";
    const vistas = new Set(r.sucursales.map((s) => s.direccion.toLowerCase()));
    if (f.direccion && !vistas.has(f.direccion.toLowerCase())) {
      r.sucursales.push({ nombre: r.sucursales.length ? `Sucursal ${r.sucursales.length + 1}` : "Principal", direccion: f.direccion, contacto, telefono: tel });
      vistas.add(f.direccion.toLowerCase());
    }
    for (const d of f.entregas) {
      if (vistas.has(d.direccion.toLowerCase())) continue;
      vistas.add(d.direccion.toLowerCase());
      r.sucursales.push({
        nombre: d.nombre && d.nombre !== f.nombre ? d.nombre.slice(0, 80) : `Sucursal ${r.sucursales.length + 1}`,
        direccion: d.direccion, contacto, telefono: telefonoValido(d.telefono) || tel,
      });
    }
  }
  const razones = [...porRif.values()];
  if (!razones.length) razones.push({ razon: c.empresa, rif: rifValido(c.documento) || c.documento, sucursales: [] });
  for (const r of razones) if (!r.sucursales.length) r.sucursales.push({ nombre: "Principal", direccion: "", contacto, telefono: "" });
  return { nombre: c.empresa, razones, redes: {} };
}

export interface PerfilEditable extends DatosPerfil {
  guardado: boolean;
  version: number;
  logo: string | null;
  actualizadoEl: string;
  actualizadoPor: string;
  /** Claves de RIF que ya están en Odoo, para marcar cada razón social como registrada. */
  registrados: string[];
}

export async function perfilEditable(c: ClienteOdoo): Promise<PerfilEditable> {
  await asegurarTablas();
  const clave = claveEmpresa(c);
  const [[filas], fichas] = await Promise.all([
    db.execute(
      "SELECT nombre, datos, logo, logo_tipo, version, actualizado_por, DATE_FORMAT(actualizado_el, '%Y-%m-%d %H:%i') AS el FROM tienda_perfiles WHERE clave = ?",
      [clave],
    ) as Promise<any>,
    fichasDe(c),
  ]);
  const registrados = [...new Set(fichas.map((f) => claveDocumento(f.documento)).filter((d) => d.length >= 6))];
  const f = (filas as any[])?.[0];
  if (!f) return { ...propuesta(c, fichas), guardado: false, version: 0, logo: null, actualizadoEl: "", actualizadoPor: "", registrados };
  let datos: DatosPerfil;
  try { datos = JSON.parse(f.datos); } catch { datos = propuesta(c, fichas); }
  const logo = f.logo && f.logo_tipo ? `data:${f.logo_tipo};base64,${Buffer.from(f.logo).toString("base64")}` : null;
  return {
    nombre: f.nombre || datos.nombre, razones: datos.razones || [], redes: datos.redes || {},
    guardado: true, version: Number(f.version) || 1, logo, actualizadoEl: f.el || "", actualizadoPor: f.actualizado_por || "", registrados,
  };
}

/** Lo que va en la cabecera de «Mi cuenta»: el nombre y el logo que puso el cliente (null si no lo ha guardado). */
export async function cabeceraDe(c: ClienteOdoo): Promise<{ nombre: string; logo: string | null } | null> {
  await asegurarTablas();
  const [filas]: any = await db.execute("SELECT nombre, logo, logo_tipo FROM tienda_perfiles WHERE clave = ?", [claveEmpresa(c)]);
  const f = filas?.[0];
  if (!f) return null;
  return { nombre: String(f.nombre || ""), logo: f.logo && f.logo_tipo ? `data:${f.logo_tipo};base64,${Buffer.from(f.logo).toString("base64")}` : null };
}

/** El logo que manda la pantalla: «data:image/…;base64,…». undefined = no lo tocó, null = lo quitó. */
function leerLogo(v: unknown): { ok: true; logo?: { bytes: Buffer; tipo: string } | null } | { ok: false; error: string } {
  if (v === undefined) return { ok: true };
  if (v === null || v === "") return { ok: true, logo: null };
  const m = String(v).match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!m) return { ok: false, error: "El logo tiene que ser una imagen PNG, JPG o WebP" };
  const bytes = Buffer.from(m[2], "base64");
  if (!bytes.length || bytes.length > LOGO_MAX_BYTES) return { ok: false, error: "El logo pesa demasiado: usa una imagen de menos de 400 KB" };
  const tipo = tipoDeImagen(bytes);
  if (!tipo) return { ok: false, error: "El logo tiene que ser una imagen PNG, JPG o WebP" };
  return { ok: true, logo: { bytes, tipo } };
}

export type ResultadoGuardar =
  | { ok: true; perfil: PerfilEditable }
  | { ok: false; status: number; error: string; campo?: string };

/** Guarda el perfil si nadie lo cambió desde que lo abrió (`version`); deja en el historial lo que había. */
export async function guardarPerfil(c: ClienteOdoo, correo: string, cuerpo: Record<string, unknown>): Promise<ResultadoGuardar> {
  const v = validarPerfil(cuerpo);
  if (!v.ok) return { ok: false, status: 400, error: v.error, campo: v.campo };
  const l = leerLogo(cuerpo.logo);
  if (!l.ok) return { ok: false, status: 400, error: l.error, campo: "logo" };
  const version = Number(cuerpo.version) || 0;
  await asegurarTablas();
  const clave = claveEmpresa(c);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [filas]: any = await conn.execute("SELECT datos, version, logo_tipo FROM tienda_perfiles WHERE clave = ? FOR UPDATE", [clave]);
    const actual = filas?.[0];
    if ((actual ? Number(actual.version) : 0) !== version) {
      await conn.rollback();
      return { ok: false, status: 409, error: "Alguien de tu empresa cambió el perfil mientras lo editabas. Vuelve a abrirlo para ver lo último y haz tus cambios otra vez." };
    }
    const datos = JSON.stringify(v.datos);
    const tocaLogo = l.logo !== undefined;
    const cambioLogo = !tocaLogo ? null : l.logo === null ? (actual?.logo_tipo ? "quitado" : null) : "nuevo";
    if (actual) {
      await conn.execute(
        `UPDATE tienda_perfiles SET nombre = ?, datos = ?, version = version + 1, actualizado_por = ?, actualizado_el = ?${tocaLogo ? ", logo = ?, logo_tipo = ?" : ""} WHERE clave = ?`,
        [v.datos.nombre, datos, correo, ahora(), ...(tocaLogo ? [l.logo?.bytes ?? null, l.logo?.tipo ?? null] : []), clave],
      );
    } else {
      await conn.execute(
        "INSERT INTO tienda_perfiles (clave, nombre, datos, logo, logo_tipo, version, actualizado_por, actualizado_el) VALUES (?, ?, ?, ?, ?, 1, ?, ?)",
        [clave, v.datos.nombre, datos, l.logo?.bytes ?? null, l.logo?.tipo ?? null, correo, ahora()],
      );
    }
    await conn.execute(
      "INSERT INTO tienda_perfiles_historial (clave, version, datos_antes, logo_cambio, por, el) VALUES (?, ?, ?, ?, ?, ?)",
      [clave, version + 1, actual?.datos ?? null, cambioLogo, correo, ahora()],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
  return { ok: true, perfil: await perfilEditable(c) };
}
