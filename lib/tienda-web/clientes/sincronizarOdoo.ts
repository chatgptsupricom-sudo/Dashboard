/**
 * Pasa a Odoo, solo y sin botón, lo que el cliente guarda en «Mi cuenta» › Perfil:
 * - Cada sucursal → dirección de entrega (`res.partner` type `delivery`) bajo la ficha de empresa del cliente con el
 *   RIF de esa razón social, en cada sede donde tiene ficha. Con dirección, teléfono, contacto (en notas) y ubicación.
 *   El plan (crear / adoptar / actualizar / archivar) es `planearSincronizacion` de ./sincronizarTipos.ts.
 * - Página web y logo → `website` / `image_1920` de esas mismas fichas (el logo pasado a PNG).
 * - Una nota en el chatter de cada ficha tocada con lo que cambió y quién lo hizo, porque en Odoo el cambio queda a
 *   nombre del usuario de ODOO_API_KEY.
 *
 * Seguridad: solo se tocan las fichas que el cliente puede ver al entrar (`partners_odoo`, guardado con cada perfil
 * desde la sesión), nunca la de otra empresa aunque escriba su RIF; la razón social, la dirección fiscal y los datos
 * fiscales de la ficha no se cambian; nada se borra (se archiva). Una razón social que no está en Odoo no se crea.
 *
 * Corre después de guardar, sin hacer esperar al cliente. Si Odoo falla queda `odoo_estado = 'error'` y el cron de
 * server.js lo reintenta cada hora (`GET /api/cron/tienda-perfiles-odoo`). Un perfil a la vez (candado en memoria).
 */
import crypto from "crypto";
import { db } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { direccion as direccionOdoo } from "./odoo";
import { asegurarTablas } from "./perfil";
import { pasoAOdooActivo, planearSincronizacion, type EnlaceOdoo, type Operacion, type PadreOdoo } from "./sincronizarTipos";
import { claveDocumento, COMPANIAS_TIENDA, type DatosPerfil } from "./tipos";

const CTX = (company?: number) => ({ allowed_company_ids: company ? [company, ...COMPANIAS_TIENDA.filter((c) => c !== company)] : COMPANIAS_TIENDA, lang: "es_VE" });
const ahora = () => new Date().toISOString().slice(0, 19).replace("T", " ");

let tablasListas: Promise<void> | null = null;
function asegurarTablasOdoo(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await asegurarTablas();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_perfiles_odoo (
          clave VARCHAR(40) NOT NULL,
          sucursal_id VARCHAR(40) NOT NULL,
          company_id INT NOT NULL,
          partner_id INT NOT NULL,
          firma TEXT NOT NULL,
          actualizado DATETIME NOT NULL,
          PRIMARY KEY (clave, sucursal_id, company_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      const [cols]: any = await db.query("SHOW COLUMNS FROM tienda_perfiles");
      const hay = new Set((cols || []).map((c: any) => c.Field));
      const nuevas: [string, string][] = [
        ["partners_odoo", "TEXT NULL"], ["odoo_estado", "VARCHAR(20) NULL"], ["odoo_error", "TEXT NULL"],
        ["odoo_sincronizado", "DATETIME NULL"], ["odoo_resumen", "TEXT NULL"],
      ];
      for (const [col, tipo] of nuevas) if (!hay.has(col)) await db.query(`ALTER TABLE tienda_perfiles ADD COLUMN ${col} ${tipo}`);
    })().catch((e) => { tablasListas = null; throw e; });
  }
  return tablasListas;
}
export { asegurarTablasOdoo };

/** Las fichas de Odoo que el cliente puede ver: se guardan con cada perfil para sincronizar también desde el cron. */
export async function guardarFichasPermitidas(clave: string, partners: number[]): Promise<void> {
  await asegurarTablasOdoo();
  await db.query("UPDATE tienda_perfiles SET partners_odoo = ?, odoo_estado = 'pendiente' WHERE clave = ?", [JSON.stringify([...new Set(partners)].filter((n) => n > 0)), clave]);
}

export interface ResumenOdoo { creadas: number; actualizadas: number; archivadas: number; sinOdoo: string[]; errores: string[] }

/** ¿Está prendido el paso a Odoo para este perfil? (`TIENDA_PERFIL_ODOO`, ver `pasoAOdooActivo`). */
export const pasoActivo = (clave: string) => pasoAOdooActivo(process.env.TIENDA_PERFIL_ODOO, clave);

/** Lo que hay en la base y en Odoo para un perfil, y el plan de direcciones. null = no hay perfil. */
async function leerParaSincronizar(clave: string) {
  await asegurarTablasOdoo();
  const [filas]: any = await db.query("SELECT datos, logo, logo_tipo, partners_odoo, actualizado_por FROM tienda_perfiles WHERE clave = ?", [clave]);
  const fila = filas?.[0];
  if (!fila) return null;
  const datos: DatosPerfil = JSON.parse(fila.datos);
  const permitidas: number[] = (() => { try { return JSON.parse(fila.partners_odoo || "[]"); } catch { return []; } })();
  if (!permitidas.length) return { fila, datos, permitidas, padresTodos: [] as (PadreOdoo & { website: string })[], firmasEmpresa: new Map<string, string>(), ops: [] as Operacion[], sinOdoo: datos.razones.map((r) => r.razon) };

  // Fichas de empresa del cliente (solo las permitidas) y sus direcciones de entrega, también las archivadas.
  const fichas = (await callOdooRPCEstricto<any[]>("res.partner", "read", [permitidas, ["id", "vat", "company_id", "country_id", "website", "is_company", "street", "street2", "city", "state_id", "partner_latitude", "partner_longitude"]], { context: { ...CTX(), active_test: false } })) || [];
  const padresTodos: (PadreOdoo & { website: string })[] = fichas
    .filter((f) => f.is_company && COMPANIAS_TIENDA.includes(Number(f.company_id?.[0])))
    .map((f) => ({ id: f.id, company: Number(f.company_id[0]), clave: claveDocumento(f.vat), pais: f.country_id ? Number(f.country_id[0]) : null, hijos: [], website: String(f.website || ""), street: direccionOdoo(f), calle: String(f.street || ""), lat: Number(f.partner_latitude) || 0, lng: Number(f.partner_longitude) || 0 }));
  if (padresTodos.length) {
    const hijos = (await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["parent_id", "in", padresTodos.map((p) => p.id)], ["type", "=", "delivery"]]], {
      fields: ["id", "name", "street", "active", "parent_id"], limit: 2000, context: { ...CTX(), active_test: false },
    })) || [];
    for (const h of hijos) padresTodos.find((p) => p.id === h.parent_id?.[0])?.hijos.push({ id: h.id, name: String(h.name || ""), street: String(h.street || ""), active: Boolean(h.active) });
  }
  const [filasEnlaces]: any = await db.query("SELECT sucursal_id, company_id, partner_id, firma FROM tienda_perfiles_odoo WHERE clave = ?", [clave]);
  const enlaces: EnlaceOdoo[] = (filasEnlaces || []).filter((e: any) => !String(e.sucursal_id).startsWith("_"))
    .map((e: any) => ({ sucursalId: String(e.sucursal_id), company: Number(e.company_id), partnerId: Number(e.partner_id), firma: String(e.firma) }));
  const firmasEmpresa = new Map<string, string>((filasEnlaces || []).filter((e: any) => String(e.sucursal_id).startsWith("_"))
    .map((e: any) => [`${e.sucursal_id}|${e.company_id}`, String(e.firma)]));

  const { ops, sinOdoo } = planearSincronizacion(datos, padresTodos, enlaces);
  return { fila, datos, permitidas, padresTodos, firmasEmpresa, ops, sinOdoo };
}

/** Página web y logo que se escribirían en cada ficha (sin el PNG: solo si cambian). */
function cambiosDeEmpresa(l: NonNullable<Awaited<ReturnType<typeof leerParaSincronizar>>>) {
  const clavesRazones = new Set(l.datos.razones.map((r) => claveDocumento(r.rif)));
  const web = l.datos.redes?.web || "";
  const firmaLogo = l.fila.logo && l.fila.logo_tipo ? crypto.createHash("sha1").update(Buffer.from(l.fila.logo)).digest("hex") : "";
  return l.padresTodos.filter((p) => clavesRazones.has(p.clave)).map((p) => ({
    padre: p,
    web: web && p.website.replace(/\/$/, "") !== web.replace(/\/$/, "") ? web : "",
    logo: Boolean(firmaLogo) && l.firmasEmpresa.get(`_logo|${p.company}`) !== firmaLogo,
    firmaLogo,
  })).filter((x) => x.web || x.logo);
}

/**
 * Lo que se haría en Odoo con este perfil, sin escribir nada (para revisar antes de prender el paso). Lee Odoo.
 */
export async function vistaPreviaOdoo(clave: string) {
  const l = await leerParaSincronizar(clave);
  if (!l) return null;
  const empresa = cambiosDeEmpresa(l);
  return {
    activo: pasoActivo(clave),
    fichas: l.padresTodos.map((p) => ({ id: p.id, company: p.company, direcciones: p.hijos.filter((h) => h.active).length })),
    operaciones: l.ops.map((o) => ({ tipo: o.tipo, company: o.company, partnerId: "partnerId" in o ? o.partnerId : null, texto: o.texto, vals: "vals" in o ? o.vals : null })),
    empresa: empresa.map((e) => ({ company: e.padre.company, partnerId: e.padre.id, web: e.web, logo: e.logo })),
    sinOdoo: l.sinOdoo,
  };
}

async function sincronizarAhora(clave: string): Promise<ResumenOdoo> {
  const resumen: ResumenOdoo = { creadas: 0, actualizadas: 0, archivadas: 0, sinOdoo: [], errores: [] };
  const marcar = async (estado: string, error: string | null) => {
    await db.query("UPDATE tienda_perfiles SET odoo_estado = ?, odoo_error = ?, odoo_sincronizado = ?, odoo_resumen = ? WHERE clave = ?", [estado, error, ahora(), JSON.stringify(resumen), clave]);
  };
  await asegurarTablasOdoo();
  // Apagado (o este cliente no está en la prueba): no se toca Odoo; pasa cuando se prenda, en el cron.
  if (!pasoActivo(clave)) { await marcar("apagado", null); return resumen; }
  const l = await leerParaSincronizar(clave);
  if (!l) return resumen;
  const { fila, datos, ops, sinOdoo } = l;
  const quien = String(fila.actualizado_por || "el cliente");
  resumen.sinOdoo = sinOdoo;
  if (!l.permitidas.length) { await marcar("sin_fichas", null); return resumen; }
  const notas = new Map<number, string[]>();
  const anotar = (padre: number | null, texto: string) => { if (padre) notas.set(padre, [...(notas.get(padre) || []), texto]); };
  const guardarEnlace = (sid: string, company: number, partner: number, firma: string) => db.query(
    "INSERT INTO tienda_perfiles_odoo (clave, sucursal_id, company_id, partner_id, firma, actualizado) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE partner_id = VALUES(partner_id), firma = VALUES(firma), actualizado = VALUES(actualizado)",
    [clave, sid, company, partner, firma, ahora()],
  );

  for (const op of ops) {
    try {
      if (op.tipo === "crear") {
        const id = await callOdooRPCEstricto<number>("res.partner", "create", [{
          ...op.vals, type: "delivery", parent_id: op.padre, company_id: op.company, ...(op.pais ? { country_id: op.pais } : {}),
        }], { context: CTX(op.company) });
        if (!id) throw new Error("Odoo no devolvió la dirección creada");
        await guardarEnlace(op.sucursalId, op.company, Number(id), op.firma);
        resumen.creadas++;
      } else if (op.tipo === "adoptar" || op.tipo === "actualizar") {
        await callOdooRPCEstricto("res.partner", "write", [[op.partnerId], op.vals], { context: CTX(op.company) });
        await guardarEnlace(op.sucursalId, op.company, op.partnerId, op.firma);
        resumen.actualizadas++;
      } else if (op.tipo === "ubicar_ficha") {
        await callOdooRPCEstricto("res.partner", "write", [[op.partnerId], { partner_latitude: op.lat, partner_longitude: op.lng }], { context: CTX(op.company) });
        resumen.actualizadas++;
      } else {
        // Si otra cuenta (otro perfil) también usa esa dirección, solo se deja de seguir: no se archiva.
        const [otros]: any = await db.query("SELECT 1 FROM tienda_perfiles_odoo WHERE partner_id = ? AND clave <> ? LIMIT 1", [op.partnerId, clave]);
        if (!otros?.length) await callOdooRPCEstricto("res.partner", "write", [[op.partnerId], { active: false }], { context: CTX(op.company) });
        await db.query("DELETE FROM tienda_perfiles_odoo WHERE clave = ? AND sucursal_id = ? AND company_id = ?", [clave, op.sucursalId, op.company]);
        resumen.archivadas++;
      }
      anotar(op.padre, op.texto);
    } catch (e: any) {
      resumen.errores.push(`${op.texto}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }

  // Página web y logo de las fichas de sus razones sociales que están en Odoo (solo si cambiaron).
  const empresa = cambiosDeEmpresa(l);
  let png: string | null = null;
  if (empresa.some((e) => e.logo)) {
    try {
      const sharp = (await import("sharp")).default;
      png = (await sharp(Buffer.from(fila.logo)).png().toBuffer()).toString("base64");
    } catch (e: any) {
      resumen.errores.push(`no se pudo convertir el logo: ${String(e?.message || e).slice(0, 120)}`);
    }
  }
  for (const e of empresa) {
    try {
      const vals: Record<string, any> = {};
      if (e.web) vals.website = e.web;
      const conLogo = e.logo && png;
      if (conLogo) vals.image_1920 = png;
      if (!Object.keys(vals).length) continue;
      await callOdooRPCEstricto("res.partner", "write", [[e.padre.id], vals], { context: CTX(e.padre.company) });
      if (conLogo) await guardarEnlace("_logo", e.padre.company, e.padre.id, e.firmaLogo);
      anotar(e.padre.id, [vals.website ? "se actualizó la página web" : "", conLogo ? "se actualizó el logo" : ""].filter(Boolean).join(" y "));
    } catch (err: any) {
      resumen.errores.push(`página web / logo: ${String(err?.message || err).slice(0, 200)}`);
    }
  }

  // Nota en el chatter de cada ficha tocada (si la nota falla, el cambio ya está hecho: no es error).
  for (const [padre, textos] of notas) {
    const cuerpo = `<p><b>Mi cuenta (tienda web)</b> — ${quien.replace(/[<>&]/g, "")}:</p><ul>${textos.map((t) => `<li>${t.replace(/[<>&]/g, "")}</li>`).join("")}</ul>`;
    await callOdooRPCEstricto("res.partner", "message_post", [[padre]], { body: cuerpo, message_type: "comment", subtype_xmlid: "mail.mt_note", context: CTX() }).catch(() => {});
  }
  await marcar(resumen.errores.length ? "error" : "ok", resumen.errores.length ? resumen.errores.join(" · ").slice(0, 2000) : null);
  return resumen;
}

// Un perfil a la vez: si llega otro guardado mientras sincroniza, se repite una vez al terminar.
const enCurso = new Map<string, { otraVez: boolean; promesa: Promise<ResumenOdoo> }>();
export function sincronizarPerfilEnOdoo(clave: string): Promise<ResumenOdoo> {
  const actual = enCurso.get(clave);
  if (actual) { actual.otraVez = true; return actual.promesa; }
  const estado = { otraVez: false, promesa: Promise.resolve(null as unknown as ResumenOdoo) };
  estado.promesa = (async () => {
    try {
      let r = await sincronizarAhora(clave);
      while (estado.otraVez) { estado.otraVez = false; r = await sincronizarAhora(clave); }
      return r;
    } catch (e: any) {
      console.error(`[tienda-web/perfil→odoo] ${clave}:`, e?.message || e);
      await db.query("UPDATE tienda_perfiles SET odoo_estado = 'error', odoo_error = ?, odoo_sincronizado = ? WHERE clave = ?", [String(e?.message || e).slice(0, 2000), ahora(), clave]).catch(() => {});
      return { creadas: 0, actualizadas: 0, archivadas: 0, sinOdoo: [], errores: [String(e?.message || e)] };
    } finally {
      enCurso.delete(clave);
    }
  })();
  enCurso.set(clave, estado);
  return estado.promesa;
}

/** Lo que el cron reintenta: perfiles con error o que nunca se sincronizaron (hasta 50 por corrida). */
export async function reintentarPendientes(): Promise<{ revisados: number; ok: number; error: number }> {
  await asegurarTablasOdoo();
  const [filas]: any = await db.query(
    "SELECT clave FROM tienda_perfiles WHERE partners_odoo IS NOT NULL AND (odoo_estado IS NULL OR odoo_estado IN ('error', 'pendiente', 'apagado')) ORDER BY actualizado_el DESC LIMIT 50",
  );
  let ok = 0;
  let error = 0;
  // Los apagados solo se intentan si el interruptor ya los deja pasar (si no, quedan igual sin leer Odoo).
  for (const f of (filas || []).filter((x: any) => pasoActivo(String(x.clave)))) {
    const r = await sincronizarPerfilEnOdoo(String(f.clave));
    if (r.errores.length) error++; else ok++;
  }
  return { revisados: (filas || []).length, ok, error };
}
