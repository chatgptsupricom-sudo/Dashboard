/**
 * Validación de la ficha de un cliente nuevo de Venezuela antes de crearlo en
 * Odoo (Odoo no valida nada: hay RIF con dígitos de más, correos con acentos,
 * teléfonos de relleno). Puro: lo usan la pantalla, la API y
 * `scripts/check-clientes-odoo.cjs`.
 *
 * Formatos que guarda Odoo (los de las fichas que ya existen):
 *  - RIF: letra + dígitos, sin guiones ("J306368418"; persona "V32186236").
 *  - Teléfono: "+58 412-7566587".
 */

export const SEDES_CLIENTES = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
] as const;

export type TipoCliente = "empresa" | "persona";

export interface ClienteNuevo {
  sede: number;
  tipo: TipoCliente;
  rif: string;
  /** Razón social o nombre y apellido (campo `name`). */
  nombre: string;
  /** Nombre comercial (campo `ref`, "Referencia" en la ficha). */
  comercial: string;
  telefono: string;
  telefono2?: string;
  email: string;
  direccion: string;
  ciudad: string;
  estadoId: number;
  vendedorId: number;
}

export type Errores = Partial<Record<keyof ClienteNuevo, string>>;

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Mayúsculas y un solo espacio, como están las fichas en Odoo. */
export const mayusculas = (s: string) => (s || "").toUpperCase().replace(/\s+/g, " ").trim();

// ───────────────────────── RIF ─────────────────────────

const PESO_LETRA: Record<string, number> = { V: 1, E: 2, J: 3, P: 4, G: 5 };
const PESOS = [3, 2, 7, 6, 5, 4, 3, 2];

/** Dígito verificador del SENIAT para letra + 8 dígitos. null si la letra no tiene peso conocido. */
export function digitoRif(letra: string, ocho: string): number | null {
  const p = PESO_LETRA[letra];
  if (!p || !/^\d{8}$/.test(ocho)) return null;
  const suma = p * 4 + [...ocho].reduce((s, d, i) => s + Number(d) * PESOS[i], 0);
  const dv = 11 - (suma % 11);
  return dv >= 10 ? 0 : dv;
}

export interface RifRevisado {
  ok: boolean;
  /** Como se guarda en Odoo: letra + dígitos. */
  valor: string;
  error?: string;
  /** Misma persona/empresa aunque esté escrita con o sin dígito verificador: letra + número sin ceros. */
  clave: string;
}

/** Letra + dígitos, sin guiones, puntos ni espacios. */
export const rifCompacto = (s: string) => sinAcentos(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Clave para comparar RIF: letra + núcleo sin ceros a la izquierda. El núcleo
 * son los 8 dígitos antes del verificador (RIF de 9) o la cédula entera.
 */
export function claveRif(s: string): string {
  const v = rifCompacto(s);
  const m = /^([A-Z])(\d+)$/.exec(v);
  if (!m) return v;
  const nucleo = m[2].length === 9 ? m[2].slice(0, 8) : m[2];
  return m[1] + String(Number(nucleo));
}

export function revisarRif(entrada: string, tipo: TipoCliente): RifRevisado {
  const v = rifCompacto(entrada);
  const r = (error?: string): RifRevisado => ({ ok: !error, valor: v, error, clave: claveRif(v) });
  if (!v) return r("Escribe el RIF");
  const m = /^([VEJGPC])(\d+)$/.exec(v);
  if (!m) {
    if (/^\d+$/.test(v)) return r("Falta la letra adelante (J, G, V, E, P o C)");
    return r("Debe ser una letra (J, G, V, E, P o C) seguida solo de números");
  }
  const [, letra, num] = m;
  if (/^(\d)\1+$/.test(num) || num.startsWith("1234567")) return r("Parece un número de relleno");

  const persona = letra === "V" || letra === "E";
  if (tipo === "empresa" && persona) return r("Una empresa tiene RIF J, G, P o C. Si es una persona, cambia el tipo a «Persona»");
  if (tipo === "persona" && !persona) return r("Una persona tiene RIF V o E. Si es una empresa, cambia el tipo a «Empresa»");

  if (persona) {
    // Cédula sola (6 a 8 dígitos) o RIF de persona (8 + verificador).
    if (num.length < 6) return r(`Le faltan dígitos: la cédula tiene de 6 a 8 (tiene ${num.length})`);
    if (num.length > 9) return r(`Le sobran dígitos (tiene ${num.length}; cédula 6 a 8, RIF 9)`);
    if (num.length < 9) return r();
  } else if (num.length !== 9) {
    return r(`Le ${num.length < 9 ? "faltan" : "sobran"} dígitos: un RIF ${letra} tiene 9 (tiene ${num.length})`);
  }
  // shortcut: C (consejos comunales) sin verificar el dígito, no tenemos su peso confirmado.
  const dv = digitoRif(letra, num.slice(0, 8));
  if (dv !== null && dv !== Number(num[8])) {
    return r(`El último dígito no corresponde: con ${letra}${num.slice(0, 8)} el verificador es ${dv}. Revisa el número`);
  }
  return r();
}

// ───────────────────────── Teléfono ─────────────────────────

/** Operadoras móviles de Venezuela. */
const MOVILES = ["412", "414", "416", "422", "424", "426"];
/** Prefijos para elegir en la pantalla (el fijo se escribe entero, con su código de área). */
export const OPERADORAS = MOVILES.map((m) => `0${m}`);

/** Letras del RIF que se ofrecen según el tipo de cliente. */
export const LETRAS_RIF: Record<TipoCliente, string[]> = { empresa: ["J", "G", "P", "C"], persona: ["V", "E"] };

export interface TelefonoRevisado {
  ok: boolean;
  /** "+58 412-7566587". */
  valor: string;
  error?: string;
}

export function revisarTelefono(entrada: string): TelefonoRevisado {
  let d = (entrada || "").replace(/\D/g, "");
  if (!d) return { ok: false, valor: "", error: "Escribe el teléfono" };
  if (d.length === 12 && d.startsWith("58")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length !== 10) {
    return { ok: false, valor: entrada, error: "Debe tener 11 dígitos con el 0 adelante (ej. 0412-1234567)" };
  }
  const codigo = d.slice(0, 3);
  if (/^(\d)\1+$/.test(d.slice(3)) || d.slice(3).startsWith("123456")) {
    return { ok: false, valor: entrada, error: "Parece un número de relleno" };
  }
  if (d[0] === "4" && !MOVILES.includes(codigo)) {
    return { ok: false, valor: entrada, error: `0${codigo} no es una operadora (0412, 0414, 0416, 0422, 0424, 0426)` };
  }
  if (d[0] !== "4" && d[0] !== "2") {
    return { ok: false, valor: entrada, error: `0${codigo} no es un código de Venezuela (celular 04xx, fijo 02xx)` };
  }
  return { ok: true, valor: `+58 ${codigo}-${d.slice(3)}` };
}

// ───────────────────────── Correo ─────────────────────────

const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

export function revisarEmail(entrada: string): { ok: boolean; valor: string; error?: string } {
  const v = (entrada || "").trim().toLowerCase();
  if (!v) return { ok: false, valor: v, error: "Escribe el correo" };
  if (/\s/.test(v)) return { ok: false, valor: v, error: "El correo no lleva espacios" };
  if (sinAcentos(v) !== v || v.includes("ñ")) return { ok: false, valor: v, error: "El correo no lleva acentos ni ñ" };
  if (!EMAIL.test(v)) return { ok: false, valor: v, error: "No tiene forma de correo (ej. nombre@empresa.com)" };
  if (/\.(con|cm|co)$/.test(v) && /@(gmail|hotmail|yahoo|outlook)\./.test(v)) {
    return { ok: false, valor: v, error: "Revisa el final del correo (¿.com?)" };
  }
  return { ok: true, valor: v };
}

// ───────────────────────── Nombre comercial ─────────────────────────

/** "EL MUNDO DE LA OFICINA, C.A." → "EL MUNDO DE LA OFICINA" (sugerencia para el nombre comercial). */
export function sugerirComercial(nombre: string): string {
  return mayusculas(nombre)
    .replace(/[,\s]+(C\.?\s?A\.?|S\.?\s?A\.?|S\.?\s?R\.?\s?L\.?|F\.?\s?P\.?|COMPA[NÑ]IA AN[OÓ]NIMA)\s*$/i, "")
    .trim();
}

// ───────────────────────── Ficha completa ─────────────────────────

/** Valida todo y devuelve los valores como se guardan en Odoo. */
export function validarCliente(c: Partial<ClienteNuevo>): { errores: Errores; valores: ClienteNuevo } {
  const errores: Errores = {};
  const tipo: TipoCliente = c.tipo === "persona" ? "persona" : "empresa";

  if (!SEDES_CLIENTES.some((s) => s.id === Number(c.sede))) errores.sede = "Elige la sede";

  const rif = revisarRif(c.rif || "", tipo);
  if (!rif.ok) errores.rif = rif.error;

  const nombre = mayusculas(c.nombre || "");
  if (nombre.length < 3) errores.nombre = tipo === "empresa" ? "Escribe la razón social" : "Escribe nombre y apellido";
  else if (tipo === "persona" && !nombre.includes(" ")) errores.nombre = "Escribe nombre y apellido";
  else if (/\d{6,}/.test(nombre)) errores.nombre = "El nombre no lleva el RIF ni teléfonos";

  const comercial = mayusculas(c.comercial || "");
  if (comercial.length < 2) errores.comercial = "Escribe el nombre comercial (como lo conocen)";

  const tel = revisarTelefono(c.telefono || "");
  if (!tel.ok) errores.telefono = tel.error;
  let tel2 = "";
  if ((c.telefono2 || "").trim()) {
    const t2 = revisarTelefono(c.telefono2 || "");
    if (!t2.ok) errores.telefono2 = t2.error;
    else if (t2.valor === tel.valor) errores.telefono2 = "Es el mismo teléfono de arriba";
    tel2 = t2.valor;
  }

  const email = revisarEmail(c.email || "");
  if (!email.ok) errores.email = email.error;

  const direccion = mayusculas(c.direccion || "");
  if (direccion.length < 10) errores.direccion = "Escribe la dirección completa (calle, edificio o local, sector)";
  const ciudad = mayusculas(c.ciudad || "");
  if (ciudad.length < 3) errores.ciudad = "Escribe la ciudad";
  if (!(Number(c.estadoId) > 0)) errores.estadoId = "Elige el estado";
  if (!(Number(c.vendedorId) > 0)) errores.vendedorId = "Elige el vendedor";

  return {
    errores,
    valores: {
      sede: Number(c.sede),
      tipo,
      rif: rif.valor,
      nombre,
      comercial,
      telefono: tel.valor,
      telefono2: tel2,
      email: email.valor,
      direccion,
      ciudad,
      estadoId: Number(c.estadoId),
      vendedorId: Number(c.vendedorId),
    },
  };
}
