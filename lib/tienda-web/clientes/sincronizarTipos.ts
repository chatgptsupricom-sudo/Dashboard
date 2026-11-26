/**
 * Plan puro de lo que hay que hacer en Odoo para que las sucursales del perfil («Mi cuenta» › Perfil) queden como
 * direcciones de entrega de la ficha del cliente. Sin Odoo ni base de datos: lo prueba scripts/check-tienda-web.cjs.
 *
 * Reglas:
 * - Solo bajo las fichas de empresa del cliente cuyo RIF es el de esa razón social (una por sede: Valencia, Caracas,
 *   Panamá). Una razón social que no está en Odoo no se crea sola: queda «por confirmar» para el vendedor.
 * - Cada sucursal tiene un id propio y queda enlazada a la dirección que se creó (o se adoptó) en cada sede. Si cambia,
 *   se actualiza esa dirección; si la quitan del perfil, se archiva (nunca se borra).
 * - Antes de crear, se adopta una dirección de entrega que ya exista con la misma dirección (la cargó el vendedor o vino
 *   de Odoo en la propuesta): así no se duplica.
 * - Nunca se toca una dirección que no enlazamos, ni una que el vendedor archivó.
 */
import { claveDocumento, type DatosPerfil, type SucursalPerfil } from "./tipos";

export interface HijoOdoo { id: number; name: string; street: string; active: boolean }
/** `street`/`lat`/`lng`: la dirección y la ubicación de la propia ficha (la sucursal con esa dirección no se duplica). */
export interface PadreOdoo { id: number; company: number; clave: string; pais: number | null; hijos: HijoOdoo[]; street?: string; lat?: number; lng?: number }
export interface EnlaceOdoo { sucursalId: string; company: number; partnerId: number; firma: string }

export type ValsDireccion = {
  name: string; street: string; phone: string; comment: string; partner_latitude: number; partner_longitude: number;
};
export type Operacion =
  | { tipo: "crear"; sucursalId: string; padre: number; company: number; pais: number | null; vals: ValsDireccion; firma: string; texto: string }
  | { tipo: "adoptar"; sucursalId: string; partnerId: number; padre: number; company: number; vals: ValsDireccion; firma: string; texto: string }
  | { tipo: "actualizar"; sucursalId: string; partnerId: number; padre: number; company: number; vals: ValsDireccion; firma: string; texto: string }
  | { tipo: "archivar"; sucursalId: string; partnerId: number; padre: number | null; company: number; texto: string }
  /** La sucursal es la dirección de la propia ficha: no se crea otra, solo se le pone la ubicación a la ficha. */
  | { tipo: "ubicar_ficha"; sucursalId: string; partnerId: number; padre: number; company: number; lat: number; lng: number; texto: string };

/** Dirección para comparar: sin mayúsculas, acentos, signos ni espacios de más. */
export const direccionComparable = (t: unknown) =>
  String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const escapar = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function valsDireccion(razon: string, s: SucursalPerfil): ValsDireccion {
  return {
    name: `${razon} - ${s.nombre}`.slice(0, 160),
    street: s.direccion,
    phone: s.telefono,
    comment: `<p>Contacto: ${escapar(s.contacto)}</p><p>Cargada por el cliente en Mi cuenta de la tienda web.</p>`,
    partner_latitude: typeof s.lat === "number" ? s.lat : 0,
    partner_longitude: typeof s.lng === "number" ? s.lng : 0,
  };
}
/** Huella de lo que se escribió: si no cambió, no se vuelve a escribir. */
export const firmaVals = (v: ValsDireccion) => JSON.stringify([v.name, v.street, v.phone, v.comment, v.partner_latitude, v.partner_longitude]);

export function planearSincronizacion(datos: DatosPerfil, padres: PadreOdoo[], enlaces: EnlaceOdoo[]): { ops: Operacion[]; sinOdoo: string[] } {
  const ops: Operacion[] = [];
  const sinOdoo: string[] = [];
  const porClave = new Map<string, PadreOdoo[]>();
  for (const p of padres) porClave.set(p.clave, [...(porClave.get(p.clave) || []), p]);
  const enlaceDe = (sid: string, company: number) => enlaces.find((e) => e.sucursalId === sid && e.company === company);
  const usados = new Set(enlaces.map((e) => e.partnerId));
  const vivas = new Set<string>();

  for (const r of datos.razones) {
    const suyos = porClave.get(claveDocumento(r.rif)) || [];
    for (const s of r.sucursales) if (s.id) vivas.add(s.id);
    if (!suyos.length) { sinOdoo.push(r.razon); continue; }
    for (const s of r.sucursales) {
      if (!s.id || s.direccion.trim().length < 8) continue;
      const vals = valsDireccion(r.razon, s);
      const firma = firmaVals(vals);
      for (const p of suyos) {
        const e = enlaceDe(s.id, p.company);
        if (e) {
          const hijo = p.hijos.find((h) => h.id === e.partnerId);
          // El vendedor la archivó o la borró en Odoo: se respeta, no se revive.
          if (!hijo || !hijo.active) continue;
          if (e.firma !== firma) ops.push({ tipo: "actualizar", sucursalId: s.id, partnerId: e.partnerId, padre: p.id, company: p.company, vals, firma, texto: `se actualizó la dirección de entrega «${vals.name}»` });
          continue;
        }
        // Es la dirección de la propia ficha (la «Principal» que vino de Odoo): no se duplica como dirección de entrega.
        if (direccionComparable(p.street) && direccionComparable(p.street) === direccionComparable(s.direccion)) {
          if (typeof s.lat === "number" && typeof s.lng === "number" && (p.lat !== s.lat || p.lng !== s.lng)) {
            ops.push({ tipo: "ubicar_ficha", sucursalId: s.id, partnerId: p.id, padre: p.id, company: p.company, lat: s.lat, lng: s.lng, texto: `se puso en el mapa la dirección de la ficha («${s.nombre}»)` });
          }
          continue;
        }
        const igual = p.hijos.find((h) => h.active && !usados.has(h.id) && direccionComparable(h.street) && direccionComparable(h.street) === direccionComparable(s.direccion));
        if (igual) {
          usados.add(igual.id);
          ops.push({ tipo: "adoptar", sucursalId: s.id, partnerId: igual.id, padre: p.id, company: p.company, vals, firma, texto: `se actualizó la dirección de entrega «${vals.name}»` });
        } else {
          ops.push({ tipo: "crear", sucursalId: s.id, padre: p.id, company: p.company, pais: p.pais, vals, firma, texto: `se agregó la dirección de entrega «${vals.name}»` });
        }
      }
    }
  }
  // Quitadas del perfil: se archiva lo que enlazamos (si sigue activo).
  for (const e of enlaces) {
    if (vivas.has(e.sucursalId)) continue;
    const padre = padres.find((p) => p.company === e.company && p.hijos.some((h) => h.id === e.partnerId));
    const hijo = padre?.hijos.find((h) => h.id === e.partnerId);
    if (padre && hijo && !hijo.active) continue;
    ops.push({ tipo: "archivar", sucursalId: e.sucursalId, partnerId: e.partnerId, padre: padre?.id ?? null, company: e.company, texto: `se archivó la dirección de entrega «${hijo?.name || e.partnerId}» (la quitaron del perfil)` });
  }
  return { ops, sinOdoo };
}

/**
 * Interruptor del paso a Odoo, variable de entorno `TIENDA_PERFIL_ODOO`:
 * - vacía o «no»: apagado (lo que se guarda queda «apagado» y pasa cuando se prenda, en el cron de la hora).
 * - «todos» (o «si»): todos los clientes.
 * - uno o más RIF separados por coma: solo esos clientes (para probar con uno de confianza).
 * `clave` es la del perfil: `d:<RIF sin guiones>` o `p:<id>` (los sin RIF solo pasan con «todos»).
 */
export function pasoAOdooActivo(valor: string | undefined, clave: string): boolean {
  const v = String(valor ?? "").trim();
  if (!v || /^(no|off|0|false)$/i.test(v)) return false;
  if (/^(todos|si|sí|on|1|true)$/i.test(v)) return true;
  if (!clave.startsWith("d:")) return false;
  const rif = clave.slice(2);
  return v.split(/[,;\s]+/).map((x) => claveDocumento(x)).filter((x) => x.length >= 6).includes(rif);
}
