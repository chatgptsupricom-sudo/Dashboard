/**
 * Alcance de sucursal para el modulo de Leads.
 *
 * Panama (cids 7) es una operacion aparte: su cartera, sus vendedores y sus
 * reportes no se cruzan con Venezuela. Valencia (9) y Caracas (10) trabajan
 * como un solo pool y se pasan leads entre si — es lo que ya devuelven el
 * listado de leads (`WHERE s.cids != 7 OR s.cids IS NULL`) y el de
 * vendedores (`WHERE cids != 7`), que meten las dos sedes en una sola lista.
 *
 * Los guards de reasignacion y de alta/baja de vendedores pedian en cambio
 * igualdad exacta de cids. Con eso la pantalla le ofrecia a AdminLeads de
 * Caracas los vendedores de Valencia y el backend los rechazaba con 403: no
 * podia transferir leads a los nombres que el propio panel le mostraba.
 *
 * Se compara con `Number()` y no con `!==` sobre los valores crudos porque
 * `cids` llega del JWT y de MySQL, y no siempre con el mismo tipo: un "10"
 * de texto contra un 10 numerico nunca es igual en estricto, y ahi el guard
 * rechazaba todo.
 */
const PANAMA = 7;

export function mismaOperacion(userCids: unknown, targetCids: unknown): boolean {
  const usuario = Number(userCids);
  const destino = Number(targetCids);

  // Sin sucursal asignada (superadmin y compania) no hay restriccion.
  if (!Number.isFinite(usuario) || usuario <= 0) return true;

  // Un vendedor sin sucursal no es destino valido para nadie que si tenga
  // una: no hay forma de saber de que operacion es.
  if (!Number.isFinite(destino) || destino <= 0) return false;

  // Panama solo con Panama. El resto comparte operacion.
  if (usuario === PANAMA || destino === PANAMA) return usuario === destino;
  return true;
}

/**
 * AdminLeads de Venezuela que ademas ven Panama (por correo de login,
 * nov-2026). Eligen el pais con el selector, que guarda la cookie
 * COOKIE_PAIS_LEADS ("VE" | "PA"; sin cookie = Venezuela); con "PA" el modulo
 * de Leads los trata como AdminLeads de Panama.
 *
 * Al reves, todo AdminLeads de Panama ve tambien Venezuela, y no solo en
 * Leads: elige Panama, Valencia, Caracas o las tres (cookie "PA" | "VAL" |
 * "CCS" | "TODAS"; sin cookie = Panama). payloadSesion() lo aplica en el guard
 * de las APIs y en el middleware: con Valencia o Caracas queda con ese `cids`
 * y con las tres con el de Valencia (para entrar a lo que es solo de
 * Valencia, como Material POP); ademas `sedeLeads` marca lo que eligio, porque
 * Leads junta Valencia y Caracas y "las tres" no es ningun `cids`
 * (sedeElegida / condSedeElegida).
 */
export const ADMINLEADS_CON_PANAMA = ["marketing@supricom.com"];
export const COOKIE_PAIS_LEADS = "leads_pais";

type PayloadPais = { role?: unknown; email?: unknown; cids?: unknown } | null | undefined;
export type SedeElegida = 9 | 10 | "todas";

/** Opciones del selector del AdminLeads de Panama: valor de la cookie → sede. */
export const SEDES_ADMINLEADS_PANAMA: { valor: string; etiqueta: string; sede: SedeElegida | 7 }[] = [
  { valor: "PA", etiqueta: "Panamá", sede: PANAMA },
  { valor: "VAL", etiqueta: "Valencia", sede: 9 },
  { valor: "CCS", etiqueta: "Caracas", sede: 10 },
  { valor: "TODAS", etiqueta: "Las tres sedes", sede: "todas" },
];

const esAdminLeads = (payload: PayloadPais) => String(payload?.role ?? "").toLowerCase().trim() === "adminleads";

export function esAdminLeadsPanama(payload: PayloadPais): boolean {
  return esAdminLeads(payload) && Number(payload?.cids) === PANAMA;
}

export function veAmbosPaises(payload: PayloadPais): boolean {
  return (
    esAdminLeadsPanama(payload) ||
    (esAdminLeads(payload) && ADMINLEADS_CON_PANAMA.includes(String(payload?.email ?? "").toLowerCase().trim()))
  );
}

type ConCookies = { cookies: { get(nombre: string): { value: string } | undefined } };

/**
 * Payload con el `cids` que usa el modulo de Leads. Solo cambia para quien
 * veAmbosPaises() y eligio otra sede; la cookie de cualquier otro se ignora.
 * Ya cambiado no vuelve a cambiar (las rutas de Leads lo llaman de nuevo).
 */
export function payloadLeads<T extends object>(request: ConCookies, payload: T): T {
  if (!veAmbosPaises(payload as PayloadPais)) return payload;
  const valor = request.cookies.get(COOKIE_PAIS_LEADS)?.value;
  if (esAdminLeadsPanama(payload as PayloadPais)) {
    const sede = SEDES_ADMINLEADS_PANAMA.find((o) => o.valor === valor)?.sede;
    if (!sede || sede === PANAMA) return payload;
    return { ...payload, cids: sede === "todas" ? 9 : sede, sedeLeads: sede } as T;
  }
  return valor === "PA" ? ({ ...payload, cids: PANAMA } as T) : payload;
}

/** Para todo el panel: solo el AdminLeads de Panama cambia de sede fuera de Leads. */
export function payloadSesion<T extends object>(request: ConCookies, payload: T): T {
  return esAdminLeadsPanama(payload as PayloadPais) ? payloadLeads(request, payload) : payload;
}

/** Sede que eligio el AdminLeads de Panama fuera de la suya; undefined = la regla de siempre. */
export function sedeElegida(payload: unknown): SedeElegida | undefined {
  const s = (payload as { sedeLeads?: unknown } | null)?.sedeLeads;
  return s === 9 || s === 10 || s === "todas" ? s : undefined;
}

/**
 * Condicion SQL sobre la sede de un vendedor (`col`, ej. "s.cids") segun
 * sedeElegida(): la sede sola o, con las tres, ninguna. undefined = la regla
 * de siempre (Panama solo, o Valencia + Caracas juntas).
 */
export function condSedeElegida(payload: unknown, col: string): string | undefined {
  const s = sedeElegida(payload);
  if (s === undefined) return undefined;
  return s === "todas" ? "1=1" : `${col} = ${s}`;
}

/**
 * `cids` para las funciones de Leads que reciben (userCids, sede): "todas"
 * con las tres sedes elegidas (sin filtro de operacion), si no el del token.
 */
export function cidsLeads(payload: unknown): number | "todas" | null {
  if (sedeElegida(payload) === "todas") return "todas";
  const c = Number((payload as PayloadPais)?.cids);
  return Number.isFinite(c) && c > 0 ? c : null;
}

/** `?sede=` que vale: con Valencia o Caracas elegida, esa; si no, la pedida. */
export function sedeLeadsParam(payload: unknown, sede: string | null): string | null {
  const s = sedeElegida(payload);
  return typeof s === "number" ? String(s) : sede;
}

/** Igual que sedeLeadsParam, con la sede ya como numero. */
export function sedeLeadsNum(payload: unknown, sede: number | null): number | null {
  const s = sedeElegida(payload);
  return typeof s === "number" ? s : sede;
}

/** Valor de la cookie del selector en el navegador ("" sin elegir). */
export function cookiePaisLeads(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_PAIS_LEADS}=`))?.slice(COOKIE_PAIS_LEADS.length + 1) ?? "";
}

/** `cids` con que el navegador arma el menu (misma regla que payloadSesion). */
export function cidsEnPantalla(user: PayloadPais): unknown {
  if (!esAdminLeadsPanama(user)) return user?.cids;
  const sede = SEDES_ADMINLEADS_PANAMA.find((o) => o.valor === cookiePaisLeads())?.sede;
  return sede === "todas" ? 9 : (sede ?? user?.cids);
}
