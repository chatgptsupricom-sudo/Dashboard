/**
 * Documento del cliente en el paso 1 del portal: tipo (select) + número.
 *
 * Sin dependencias de servidor: lo usan el formulario (para armar el select y
 * validar) y la búsqueda de la factura (para comparar contra Odoo).
 *
 * Cómo está guardado en Odoo (`res.partner.vat`, medido en sep. 2026 sobre los
 * clientes con facturas de cada sucursal):
 *  - Valencia y Caracas: 97-99 % letra + números pegados (`J123456789`,
 *    `V12345678`); unos pocos, solo números.
 *  - Panamá: cédula `8-123-456`, extranjero `E-8-12345`, `PE-8-1234`,
 *    naturalizado `N-19-123`; RUC como `155591597-2-2015`.
 * La comparación normaliza (sin guiones ni espacios, en mayúsculas), así que
 * alcanza con armar el prefijo correcto y pegarle el número.
 */

export type Pais = "VE" | "PA";

export type TipoDocumento = {
  /** Valor del select. */
  codigo: string;
  /** Lo que se pega delante del número al buscar ("" = nada). */
  prefijo: string;
  /** Qué acepta el número: solo dígitos o también letras (pasaportes). */
  alfanumerico: boolean;
  /** Largo del número sin prefijo ni separadores. */
  min: number;
  max: number;
};

// Venezuela: la letra del RIF/cédula. V y E son cédulas (personas); J, G y P
// son RIF de empresa, gobierno y pasaporte.
const VENEZUELA: TipoDocumento[] = [
  { codigo: "V", prefijo: "V", alfanumerico: false, min: 5, max: 10 },
  { codigo: "J", prefijo: "J", alfanumerico: false, min: 8, max: 10 },
  { codigo: "E", prefijo: "E", alfanumerico: false, min: 5, max: 10 },
  { codigo: "P", prefijo: "P", alfanumerico: true, min: 5, max: 15 },
  { codigo: "G", prefijo: "G", alfanumerico: false, min: 8, max: 10 },
];

// Panamá: la cédula normal va sin letra (provincia-tomo-asiento); E y PE
// llevan su prefijo. RUC y pasaporte, como vengan.
const PANAMA: TipoDocumento[] = [
  { codigo: "cedula", prefijo: "", alfanumerico: false, min: 5, max: 12 },
  { codigo: "ruc", prefijo: "", alfanumerico: false, min: 6, max: 20 },
  { codigo: "pasaporte", prefijo: "", alfanumerico: true, min: 5, max: 20 },
  { codigo: "E", prefijo: "E", alfanumerico: false, min: 4, max: 12 },
  { codigo: "PE", prefijo: "PE", alfanumerico: false, min: 4, max: 12 },
];

/** 7 = Panamá; Valencia (9) y Caracas (10) son Venezuela. */
export function paisDeSucursal(cid: number): Pais {
  return cid === 7 ? "PA" : "VE";
}

export function tiposDocumento(pais: Pais): TipoDocumento[] {
  return pais === "PA" ? PANAMA : VENEZUELA;
}

/** El más común en cada país, para que el select no arranque vacío. */
export function tipoPorDefecto(pais: Pais): string {
  return pais === "PA" ? "cedula" : "J";
}

/** Sin guiones, puntos ni espacios, en mayúsculas. */
export function limpiarNumero(numero: string): string {
  return String(numero || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export type ErrorDocumento = "vacio" | "tipo" | "caracteres" | "largo";

/** null si el número sirve para ese tipo; si no, por qué. */
export function validarDocumento(pais: Pais, tipo: string, numero: string): ErrorDocumento | null {
  const t = tiposDocumento(pais).find((x) => x.codigo === tipo);
  if (!t) return "tipo";
  const limpio = limpiarNumero(numero);
  if (!limpio) return "vacio";
  if (!t.alfanumerico && /[^0-9]/.test(limpio)) return "caracteres";
  if (limpio.length < t.min || limpio.length > t.max) return "largo";
  return null;
}

/**
 * Lo que se manda a buscar: prefijo + número, sin separadores. Si el cliente
 * ya escribió el prefijo en el número ("J31737690-0" con J elegida), no se
 * duplica.
 */
export function componerDocumento(pais: Pais, tipo: string, numero: string): string {
  const t = tiposDocumento(pais).find((x) => x.codigo === tipo);
  const limpio = limpiarNumero(numero);
  if (!t || !t.prefijo) return limpio;
  return limpio.startsWith(t.prefijo) && /^[0-9]/.test(limpio.slice(t.prefijo.length))
    ? limpio
    : `${t.prefijo}${limpio}`;
}

/**
 * Si el documento buscado coincide con el guardado en Odoo (los dos ya
 * normalizados). Además de la coincidencia exacta:
 *  - guardado sin la letra: unos pocos clientes venezolanos están en Odoo
 *    solo con números (`12345678`); "V12345678" tiene que encontrarlos.
 *  - sufijos que el cliente no escribe (los panameños tipo `...DV38`): se
 *    acepta el prefijo, pero solo si lo buscado es lo bastante largo para
 *    seguir siendo una verificación real y no un comodín.
 */
export function documentoCoincide(buscado: string, guardado: string): boolean {
  if (!buscado || !guardado) return false;
  if (guardado === buscado) return true;
  const sinLetra = buscado.replace(/^[VEJPG]/, "");
  if (sinLetra !== buscado && /^[0-9]{5,}$/.test(guardado) && guardado === sinLetra) return true;
  return buscado.length >= 8 && guardado.startsWith(buscado);
}
