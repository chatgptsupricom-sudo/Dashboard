/**
 * «Mi cuenta» de la tienda web (odoo/landing/mi-cuenta.html): reglas puras. Sin Odoo ni base de datos;
 * chequeo: `node scripts/check-tienda-web.cjs`.
 *
 * Quién puede tener cuenta: un correo que esté en la ficha de un cliente en Odoo (no del grupo). Crea su
 * acceso con un código que le llega a ese correo y elige su contraseña. Ve solo lo de su empresa: las
 * fichas con ese correo y las que tienen su mismo RIF/RUC, en las tres sedes.
 */

export const SEDE_DE_COMPANIA: Record<number, { id: string; nombre: string }> = {
  9: { id: "valencia", nombre: "Valencia" },
  10: { id: "caracas", nombre: "Caracas" },
  7: { id: "panama", nombre: "Panamá" },
};
export const COMPANIAS_TIENDA = [9, 10, 7];

const CORREO = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;
export function normalizarCorreo(v: unknown): string | null {
  const c = String(v ?? "").trim().toLowerCase();
  return c.length <= 160 && CORREO.test(c) ? c : null;
}

/** Correos de la empresa: no pueden ser cuenta de cliente (verían lo de los clientes que los tienen cargados). */
export const esCorreoInterno = (correo: string) => /@(supricom\.com\.ve|supricom\.com|supricom\.com\.pa|ofimaster\.com)$/i.test(correo);

/** Contraseña: 8 a 72 caracteres, con al menos una letra y un número. null = sirve; si no, qué le falta. */
export function problemaContrasena(v: unknown): string | null {
  const c = String(v ?? "");
  if (c.length < 8) return "La contraseña necesita al menos 8 caracteres";
  if (c.length > 72) return "La contraseña puede tener hasta 72 caracteres";
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(c) || !/\d/.test(c)) return "La contraseña necesita letras y números";
  return null;
}

/** Código de 6 dígitos (lo genera el servidor con crypto.randomInt). */
export const codigoValido = (v: unknown) => /^\d{6}$/.test(String(v ?? "").trim());

/** RIF/RUC para comparar fichas: sin guiones, puntos ni espacios, en mayúsculas. */
export const claveDocumento = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** El tramo de números más largo de un RIF/RUC tal como está en Odoo («J-31737690-0» → «31737690»), para buscarlo. */
export function nucleoDocumento(v: unknown): string | null {
  const tramos = String(v ?? "").match(/\d+/g) || [];
  const largo = tramos.reduce((a, b) => (b.length > a.length ? b : a), "");
  return largo.length >= 6 ? largo : null;
}

/* ------------------------------------------------------------------ Pedidos */
export type EtapaPedido = "cotizacion" | "confirmado" | "despachado" | "facturado" | "anulado";

/**
 * Etapa de un pedido de Odoo para el cliente: cotización (borrador o enviada) → confirmado → despachado
 * (delivery_status = full) → facturado (invoice_status = invoiced). Lo anulado aparte.
 */
export function etapaPedido(p: { state?: string; delivery_status?: string | false; invoice_status?: string }): EtapaPedido {
  if (p.state === "cancel") return "anulado";
  if (p.state === "draft" || p.state === "sent") return "cotizacion";
  if (p.invoice_status === "invoiced") return "facturado";
  if (p.delivery_status === "full") return "despachado";
  return "confirmado";
}
export const NOMBRE_ETAPA: Record<EtapaPedido, string> = {
  cotizacion: "Cotización",
  confirmado: "Confirmado",
  despachado: "Despachado",
  facturado: "Facturado",
  anulado: "Anulado",
};

/* ------------------------------------------------------------------ Facturas */
export type EstadoFactura = "pagada" | "parcial" | "pendiente" | "vencida" | "nota";

/** Estado de una factura para el cliente, con la fecha de hoy (AAAA-MM-DD, Caracas). */
export function estadoFactura(f: { move_type?: string; payment_state?: string; amount_residual?: number; invoice_date_due?: string | false }, hoy: string): EstadoFactura {
  if (f.move_type === "out_refund") return "nota";
  const saldo = Math.abs(Number(f.amount_residual) || 0);
  if (saldo < 0.005 || f.payment_state === "paid" || f.payment_state === "in_payment" || f.payment_state === "reversed") return "pagada";
  if (f.invoice_date_due && f.invoice_date_due < hoy) return "vencida";
  return f.payment_state === "partial" ? "parcial" : "pendiente";
}
export const NOMBRE_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  pagada: "Pagada",
  parcial: "Abono parcial",
  pendiente: "Por pagar",
  vencida: "Vencida",
  nota: "Nota de crédito",
};

/** Días de atraso (o que faltan, en negativo) de un vencimiento contra hoy. */
export function diasDeAtraso(vence: string | false | null | undefined, hoy: string): number | null {
  if (!vence) return null;
  const a = Date.UTC(+vence.slice(0, 4), +vence.slice(5, 7) - 1, +vence.slice(8, 10));
  const b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export const redondear = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Antigüedad de lo que se debe, como en un estado de cuenta: por vencer y tramos de días vencidos. */
export type TramoDeuda = "porVencer" | "d1_30" | "d31_60" | "d61_90" | "d90";
export const TRAMOS_DEUDA: { id: TramoDeuda; nombre: string }[] = [
  { id: "porVencer", nombre: "Por vencer" },
  { id: "d1_30", nombre: "1 a 30 días" },
  { id: "d31_60", nombre: "31 a 60 días" },
  { id: "d61_90", nombre: "61 a 90 días" },
  { id: "d90", nombre: "Más de 90 días" },
];
/** El tramo de una factura según sus días de atraso (null o ≤ 0 = todavía no vence). */
export function tramoDeuda(atraso: number | null | undefined): TramoDeuda {
  const d = Number(atraso) || 0;
  if (d <= 0) return "porVencer";
  if (d <= 30) return "d1_30";
  if (d <= 60) return "d31_60";
  if (d <= 90) return "d61_90";
  return "d90";
}

/** Cuánto se ha despachado de un pedido, de 0 a 100 (por unidades). */
export function avanceDespacho(lineas: { cantidad: number; despachado: number }[]): number {
  const total = lineas.reduce((a, l) => a + Math.max(0, Number(l.cantidad) || 0), 0);
  if (!total) return 0;
  const hecho = lineas.reduce((a, l) => a + Math.min(Math.max(0, Number(l.despachado) || 0), Math.max(0, Number(l.cantidad) || 0)), 0);
  return Math.round((hecho / total) * 100);
}

/* ------------------------------------------------------------------ Perfil editable */
// Lo que el cliente escribe de su empresa en «Mi cuenta» › Perfil (tabla tienda_perfiles). No cambia Odoo:
// lo ve su vendedor para actualizarlo allá.
/** `lat`/`lng`: dónde está en el mapa (opcional; lo marca el cliente con el buscador, su ubicación o el pin). */
/** `id`: propio de la sucursal (lo pone el servidor al guardarla) para enlazarla con su dirección de entrega en Odoo. */
export interface SucursalPerfil { id?: string; nombre: string; direccion: string; contacto: string; telefono: string; lat?: number; lng?: number }
export const idSucursalValido = (v: unknown) => typeof v === "string" && /^[a-z0-9]{8,32}$/.test(v);

/** Coordenadas válidas redondeadas a 6 decimales (~10 cm), o null. Venezuela y Panamá, con holgura. */
export function coordenadas(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const a = Number(lat);
  const o = Number(lng);
  if (lat === null || lat === undefined || lat === "" || lng === null || lng === undefined || lng === "") return null;
  if (!Number.isFinite(a) || !Number.isFinite(o) || a < -5 || a > 20 || o < -90 || o > -55) return null;
  return { lat: Math.round(a * 1e6) / 1e6, lng: Math.round(o * 1e6) / 1e6 };
}

/** La red social de un enlace por su dominio (para mover un enlace pegado en otro campo al suyo). null = no es de una red. */
export function redDeEnlace(v: unknown): Exclude<RedSocial, "web"> | null {
  const t = String(v ?? "").trim();
  if (!/[./]/.test(t)) return null;
  let host = "";
  try { host = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`).hostname.toLowerCase().replace(/^(www\.|m\.)/, ""); } catch { return null; }
  for (const r of REDES) if (r.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return r.id as Exclude<RedSocial, "web">;
  return null;
}

/**
 * Las redes sociales enlazadas en el HTML de una página (el pie de casi toda web las tiene). Solo perfiles: se
 * descartan los botones de compartir, publicaciones sueltas y la propia página de la red. Una por red, la primera.
 */
export function redesEnHtml(html: string): Partial<Record<RedSocial, string>> {
  const out: Partial<Record<RedSocial, string>> = {};
  const hrefs = String(html || "").match(/href\s*=\s*["']([^"'<>\s]{8,300})["']/gi) || [];
  const NO_PERFIL = /\/(sharer|share|intent|dialog|plugins|p|reel|reels|tv|stories|watch|hashtag|explore|status|posts|photo|video|events|groups|login|signup|home)(\/|\.php|$|\?)/i;
  for (const h of hrefs) {
    const url = h.replace(/^href\s*=\s*["']|["']$/gi, "").replace(/&amp;/g, "&");
    const red = redDeEnlace(url);
    if (!red || out[red]) continue;
    let u: URL;
    try { u = new URL(url); } catch { continue; }
    if (NO_PERFIL.test(u.pathname) || u.pathname.split("/").filter(Boolean).length === 0) continue;
    if (red !== "facebook" || !/profile\.php/.test(u.pathname)) u.search = "";
    u.hash = "";
    const limpio = enlaceRed(red, u.toString());
    if (limpio) out[red] = limpio;
  }
  return out;
}
export interface RazonPerfil { razon: string; rif: string; sucursales: SucursalPerfil[] }
export type RedSocial = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "web";
export interface DatosPerfil { nombre: string; razones: RazonPerfil[]; redes: Partial<Record<RedSocial, string>> }

export const MAX_RAZONES = 10;
export const MAX_SUCURSALES = 30;
export const REDES: { id: RedSocial; nombre: string; hosts: string[]; base: string }[] = [
  { id: "instagram", nombre: "Instagram", hosts: ["instagram.com"], base: "https://instagram.com/" },
  { id: "facebook", nombre: "Facebook", hosts: ["facebook.com", "fb.com"], base: "https://facebook.com/" },
  { id: "tiktok", nombre: "TikTok", hosts: ["tiktok.com"], base: "https://tiktok.com/@" },
  { id: "x", nombre: "X (Twitter)", hosts: ["x.com", "twitter.com"], base: "https://x.com/" },
  { id: "linkedin", nombre: "LinkedIn", hosts: ["linkedin.com"], base: "https://linkedin.com/company/" },
  { id: "web", nombre: "Página web", hosts: [], base: "" },
];

const textoLimpio = (v: unknown, max: number) => String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** RIF (Venezuela: J-12345678-9) o RUC (Panamá: 155612345-2-2021, 8-123-456): normalizado en mayúsculas. null = no parece uno. */
export function rifValido(v: unknown): string | null {
  const t = String(v ?? "").toUpperCase().replace(/\s+/g, "").replace(/\./g, "");
  if (!t || t.length > 25) return null;
  // 8 números y el dígito verificador: «J317376900» → «J-31737690-0».
  const ve = t.match(/^([VJEGP])-?(\d{5,8})-?(\d)?$/);
  if (ve) return `${ve[1]}-${ve[2]}${ve[3] ? `-${ve[3]}` : ""}`;
  if (/^[0-9A-Z]{1,12}(-[0-9A-Z]{1,10}){1,4}$/.test(t) && (t.match(/\d/g) || []).length >= 5) return t;
  return null;
}

/**
 * Una red social como enlace https. Acepta el usuario (@tienda o tienda) o el enlace completo; el enlace tiene
 * que ser de esa red (la web, cualquier sitio). "" = vacío; null = no sirve.
 */
export function enlaceRed(red: RedSocial, v: unknown): string | null {
  let t = String(v ?? "").trim();
  if (!t) return "";
  if (t.length > 200) return null;
  const def = REDES.find((r) => r.id === red);
  if (!def) return null;
  const pareceUrl = /^[a-z][a-z0-9+.-]*:/i.test(t) || /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(t);
  if (!pareceUrl) {
    if (red === "web") return null;
    const usuario = t.replace(/^@/, "");
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(usuario)) return null;
    return def.base + usuario;
  }
  if (!/^https?:\/\//i.test(t)) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // javascript:, mailto:, data:…
    t = `https://${t}`;
  }
  let u: URL;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  if (def.hosts.length && !def.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return null;
  if (!def.hosts.length && !/\.[a-z]{2,}$/i.test(host)) return null;
  u.protocol = "https:";
  if (def.hosts.length) u.hostname = host; // sin www. ni m.
  return u.toString().replace(/\/$/, "");
}

/** Teléfono: al menos 7 dígitos; se guarda como lo escribió (sin letras raras). */
export const telefonoValido = (v: unknown) => {
  const t = textoLimpio(v, 30);
  return /^[+\d\s().\-\/]+$/.test(t) && (t.match(/\d/g) || []).length >= 7 ? t : null;
};

export type ResultadoPerfil = { ok: true; datos: DatosPerfil } | { ok: false; error: string; campo: string };

/**
 * Valida y limpia lo que manda la pantalla. Mínimo una razón social, y cada razón social con al menos una
 * sucursal. El campo con error va como ruta («razones.0.sucursales.1.telefono») para que la pantalla lo marque.
 */
export function validarPerfil(c: any): ResultadoPerfil {
  const mal = (campo: string, error: string): ResultadoPerfil => ({ ok: false, campo, error });
  const nombre = textoLimpio(c?.nombre, 120);
  if (nombre.length < 2) return mal("nombre", "Escribe el nombre del cliente o de la empresa");
  const razonesIn = Array.isArray(c?.razones) ? c.razones : [];
  if (!razonesIn.length) return mal("razones", "Agrega al menos una razón social");
  if (razonesIn.length > MAX_RAZONES) return mal("razones", `Puedes tener hasta ${MAX_RAZONES} razones sociales`);
  const razones: RazonPerfil[] = [];
  const vistos = new Set<string>();
  const idsVistos = new Set<string>();
  for (let i = 0; i < razonesIn.length; i++) {
    const r = razonesIn[i] || {};
    const p = `razones.${i}`;
    const razon = textoLimpio(r.razon, 160);
    if (razon.length < 2) return mal(`${p}.razon`, `Escribe la razón social ${razonesIn.length > 1 ? `n.º ${i + 1}` : ""}`.trim());
    const rif = rifValido(r.rif);
    if (!rif) return mal(`${p}.rif`, `Revisa el RIF de ${razon}: por ejemplo J-12345678-9`);
    const clave = claveDocumento(rif);
    if (vistos.has(clave)) return mal(`${p}.rif`, `El RIF ${rif} está repetido`);
    vistos.add(clave);
    const sucIn = Array.isArray(r.sucursales) ? r.sucursales : [];
    if (!sucIn.length) return mal(`${p}.sucursales`, `${razon} necesita al menos una sucursal`);
    if (sucIn.length > MAX_SUCURSALES) return mal(`${p}.sucursales`, `Puedes tener hasta ${MAX_SUCURSALES} sucursales por razón social`);
    const sucursales: SucursalPerfil[] = [];
    for (let j = 0; j < sucIn.length; j++) {
      const s = sucIn[j] || {};
      const q = `${p}.sucursales.${j}`;
      const cual = `la sucursal ${j + 1} de ${razon}`;
      const nombreS = textoLimpio(s.nombre, 80);
      if (nombreS.length < 2) return mal(`${q}.nombre`, `Ponle un nombre a ${cual} (por ejemplo «Principal»)`);
      const direccion = textoLimpio(s.direccion, 300);
      if (direccion.length < 8) return mal(`${q}.direccion`, `Escribe la dirección de ${cual}`);
      const contacto = textoLimpio(s.contacto, 80);
      if (contacto.length < 2) return mal(`${q}.contacto`, `Escribe el nombre de contacto de ${cual}`);
      const telefono = telefonoValido(s.telefono);
      if (!telefono) return mal(`${q}.telefono`, `Revisa el teléfono de ${cual}: necesita al menos 7 números`);
      // La ubicación nunca traba el guardado: si viene mal, se ignora.
      const punto = coordenadas(s.lat, s.lng);
      const id = idSucursalValido(s.id) && !idsVistos.has(s.id) ? (s.id as string) : undefined;
      if (id) idsVistos.add(id);
      sucursales.push({ ...(id ? { id } : {}), nombre: nombreS, direccion, contacto, telefono, ...(punto || {}) });
    }
    razones.push({ razon, rif, sucursales });
  }
  const redes: Partial<Record<RedSocial, string>> = {};
  for (const red of REDES) {
    const v = enlaceRed(red.id, c?.redes?.[red.id]);
    if (v === null) return mal(`redes.${red.id}`, red.id === "web" ? "Revisa la dirección de tu página web" : `Revisa tu ${red.nombre}: escribe tu usuario o el enlace de tu perfil`);
    if (v) redes[red.id] = v;
  }
  return { ok: true, datos: { nombre, razones, redes } };
}

/** Logo: PNG, JPEG o WebP (por sus primeros bytes, no por lo que diga el nombre), hasta 400 KB. */
export const LOGO_MAX_BYTES = 400 * 1024;
export function tipoDeImagen(b: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/**
 * Qué cambió entre dos versiones del perfil, en frases cortas para el historial del panel
 * («Agregó la razón social X (J-…)», «Cambió el teléfono de la sucursal Principal de X»…).
 * antes = null: la primera vez que lo guardó.
 */
export function resumenCambios(antes: DatosPerfil | null, despues: DatosPerfil): string[] {
  if (!antes) {
    const suc = despues.razones.reduce((a, r) => a + r.sucursales.length, 0);
    return [`Guardó su perfil por primera vez: ${despues.razones.length} ${despues.razones.length === 1 ? "razón social" : "razones sociales"} y ${suc} ${suc === 1 ? "sucursal" : "sucursales"}`];
  }
  const out: string[] = [];
  if (antes.nombre !== despues.nombre) out.push(`Cambió el nombre del cliente: «${antes.nombre}» → «${despues.nombre}»`);
  const porRif = (d: DatosPerfil) => new Map(d.razones.map((r) => [claveDocumento(r.rif), r]));
  const a = porRif(antes);
  const b = porRif(despues);
  for (const [k, r] of b) if (!a.has(k)) out.push(`Agregó la razón social ${r.razon} (${r.rif}) con ${r.sucursales.length} ${r.sucursales.length === 1 ? "sucursal" : "sucursales"}`);
  for (const [k, r] of a) if (!b.has(k)) out.push(`Quitó la razón social ${r.razon} (${r.rif})`);
  const CAMPOS: [keyof SucursalPerfil, string][] = [["direccion", "la dirección"], ["contacto", "el contacto"], ["telefono", "el teléfono"]];
  for (const [k, rb] of b) {
    const ra = a.get(k);
    if (!ra) continue;
    if (ra.razon !== rb.razon) out.push(`Cambió la razón social «${ra.razon}» → «${rb.razon}» (${rb.rif})`);
    const sa = new Map(ra.sucursales.map((s) => [s.nombre.toLowerCase(), s]));
    const sb = new Map(rb.sucursales.map((s) => [s.nombre.toLowerCase(), s]));
    for (const [n, s] of sb) {
      const previa = sa.get(n);
      if (!previa) { out.push(`Agregó la sucursal ${s.nombre} de ${rb.razon}`); continue; }
      const cambios = CAMPOS.filter(([c]) => previa[c] !== s[c]).map(([, t]) => t);
      if (previa.lat !== s.lat || previa.lng !== s.lng) cambios.push(s.lat === undefined ? "quitó la ubicación en el mapa" : "la ubicación en el mapa");
      if (cambios.length) out.push(`Cambió ${cambios.join(", ").replace(/, ([^,]*)$/, " y $1")} de la sucursal ${s.nombre} de ${rb.razon}`);
    }
    for (const [n, s] of sa) if (!sb.has(n)) out.push(`Quitó la sucursal ${s.nombre} de ${rb.razon}`);
  }
  for (const red of REDES) {
    const va = antes.redes?.[red.id] || "";
    const vb = despues.redes?.[red.id] || "";
    if (va === vb) continue;
    out.push(!va ? `Agregó su ${red.nombre}` : !vb ? `Quitó su ${red.nombre}` : `Cambió su ${red.nombre}`);
  }
  return out;
}
