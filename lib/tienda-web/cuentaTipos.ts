/**
 * Solicitud de cuenta de distribuidor de la tienda web (odoo/landing/cuenta.html): reglas puras.
 * Reemplaza al Formulario de Google que tenía la página /registro-de-cuenta de Odoo (mismas preguntas
 * más la sede, que decide a quién le llega). Chequeo: `node scripts/check-tienda-web.cjs`.
 */

export type SedeTienda = "valencia" | "caracas" | "panama";

/**
 * A quién le llega cada solicitud (nov-2026, a pedido de ventas): la gerencia de ventas de cada sede.
 * Se puede cambiar sin tocar el código con `TIENDA_CUENTA_CORREOS`
 * (`valencia=a@x.com,b@x.com;caracas=c@x.com;panama=d@x.com`).
 */
export const DESTINATARIOS_CUENTA: Record<SedeTienda, { nombre: string; correo: string }[]> = {
  valencia: [{ nombre: "Arquimides Retali", correo: "gerencia.ventas@supricom.com.ve" }],
  caracas: [{ nombre: "Antonella Zampetti", correo: "azampetti@supricom.com.ve" }],
  panama: [{ nombre: "María Fernanda Mugica", correo: "contabilidad@supricom.com" }],
};

const CORREO = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[a-z]{2,}$/i;

/** Correos de una sede: los de `TIENDA_CUENTA_CORREOS` si los trae, si no los de arriba. */
export function correosDeSede(sede: SedeTienda, variable?: string | null): string[] {
  for (const parte of String(variable || "").split(";")) {
    const [clave, lista] = parte.split("=");
    if (clave?.trim().toLowerCase() !== sede || !lista) continue;
    const correos = lista.split(",").map((c) => c.trim()).filter((c) => CORREO.test(c));
    if (correos.length) return correos;
  }
  return DESTINATARIOS_CUENTA[sede].map((d) => d.correo);
}

export const ESTADOS_VENEZUELA = [
  "Amazonas", "Anzoátegui", "Apure", "Aragua", "Barinas", "Bolívar", "Carabobo", "Caracas (Distrito Capital)",
  "Cojedes", "Delta Amacuro", "Falcón", "Guárico", "La Guaira", "Lara", "Mérida", "Miranda", "Monagas",
  "Nueva Esparta", "Portuguesa", "Sucre", "Táchira", "Trujillo", "Yaracuy", "Zulia",
];
export const PROVINCIAS_PANAMA = [
  "Bocas del Toro", "Chiriquí", "Coclé", "Colón", "Darién", "Herrera", "Los Santos", "Panamá", "Panamá Oeste",
  "Veraguas", "Comarca Emberá-Wounaan", "Comarca Guna Yala", "Comarca Naso Tjër Di", "Comarca Ngäbe-Buglé",
];
export const TIPOS_NEGOCIO = [
  "Tienda de computación y tecnología", "Papelería y librería", "Distribuidor / mayorista", "Celulares y electrónica",
  "Empresa (compra para uso propio)", "Instalador / integrador", "Gobierno o institución", "Otro",
];

export interface SolicitudCuenta {
  sede: SedeTienda;
  compraMayor: boolean;
  nombre: string;
  apellido: string;
  telefono: string;
  correo: string;
  empresa: string;
  /** RIF (Venezuela) o RUC (Panamá), en mayúsculas y sin espacios. */
  documento: string;
  estado: string;
  direccion: string;
  tipoNegocio: string;
  comentario: string;
}

export type Validacion = { ok: true; datos: SolicitudCuenta } | { ok: false; campo: string; error: string };

const texto = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** RIF venezolano: letra (V, E, J, G, P o C) + 8 o 9 dígitos, con o sin guiones. Se guarda como J-12345678-9. */
export function normalizarRif(v: string): string | null {
  const limpio = v.toUpperCase().replace(/[\s.-]/g, "");
  const m = limpio.match(/^([VEJGPC])(\d{6,9})$/);
  if (!m) return null;
  const n = m[2];
  return n.length === 9 ? `${m[1]}-${n.slice(0, 8)}-${n.slice(8)}` : `${m[1]}-${n}`;
}

/** Teléfono: 7 a 15 dígitos, se aceptan +, espacios, guiones y paréntesis. */
export function telefonoValido(v: string): boolean {
  if (!/^[+\d\s().-]+$/.test(v)) return false;
  const digitos = v.replace(/\D/g, "");
  return digitos.length >= 7 && digitos.length <= 15;
}

/** Revisa lo que manda la página. Todo es obligatorio menos tipo de negocio y comentario. */
export function validarSolicitud(c: Record<string, unknown>): Validacion {
  const sede = texto(c.sede, 20).toLowerCase() as SedeTienda;
  if (!DESTINATARIOS_CUENTA[sede]) return { ok: false, campo: "sede", error: "Elige tu sede" };
  const compra = texto(c.compraMayor, 3).toLowerCase();
  if (compra !== "si" && compra !== "no") return { ok: false, campo: "compraMayor", error: "Dinos si compras al mayor para una tienda o empresa" };
  const nombre = texto(c.nombre, 80);
  if (nombre.length < 2) return { ok: false, campo: "nombre", error: "Escribe tu nombre" };
  const apellido = texto(c.apellido, 80);
  if (apellido.length < 2) return { ok: false, campo: "apellido", error: "Escribe tu apellido" };
  const empresa = texto(c.empresa, 160);
  if (empresa.length < 2) return { ok: false, campo: "empresa", error: "Escribe el nombre de la empresa" };
  const docTexto = texto(c.documento, 30);
  let documento: string | null;
  if (sede === "panama") {
    const ruc = docTexto.toUpperCase().replace(/\s+/g, "");
    documento = /^[0-9A-Z][0-9A-Z-]{4,24}$/.test(ruc) && /\d{3}/.test(ruc) ? ruc : null;
    if (!documento) return { ok: false, campo: "documento", error: "Escribe el RUC de la empresa (por ejemplo, 155612345-2-2021)" };
  } else {
    documento = normalizarRif(docTexto);
    if (!documento) return { ok: false, campo: "documento", error: "Escribe el RIF con su letra (por ejemplo, J-12345678-9)" };
  }
  const telefono = texto(c.telefono, 30);
  if (!telefonoValido(telefono)) return { ok: false, campo: "telefono", error: "Escribe un teléfono válido (por ejemplo, 0412 555 5555)" };
  const correo = texto(c.correo, 160).toLowerCase();
  if (!CORREO.test(correo)) return { ok: false, campo: "correo", error: "Escribe un correo válido" };
  const lista = sede === "panama" ? PROVINCIAS_PANAMA : ESTADOS_VENEZUELA;
  const estado = texto(c.estado, 60);
  if (!lista.includes(estado)) return { ok: false, campo: "estado", error: sede === "panama" ? "Elige la provincia" : "Elige el estado" };
  const direccion = texto(c.direccion, 300);
  if (direccion.length < 5) return { ok: false, campo: "direccion", error: "Escribe la dirección de la empresa" };
  const tipo = texto(c.tipoNegocio, 60);
  const tipoNegocio = TIPOS_NEGOCIO.includes(tipo) ? tipo : "";
  const comentario = String(c.comentario ?? "").trim().slice(0, 1000);
  return {
    ok: true,
    datos: { sede, compraMayor: compra === "si", nombre, apellido, telefono, correo, empresa, documento, estado, direccion, tipoNegocio, comentario },
  };
}
