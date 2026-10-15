/**
 * Clientes/proveedores que son otra empresa del grupo (Valencia le vende a
 * Caracas, Panamá a SUPRICOM LLC/USA, etc.). Mismo criterio que
 * `SQL_SIN_INTERCOMPANIA` de lib/smartbit.ts, sobre el nombre mostrado del
 * partner (`partner_id[1]`, que en un contacto es "Empresa, Contacto").
 *
 * Esas deudas se compensan dentro del grupo y no son caja que entre o salga:
 * en oct-2026 eran casi toda la CxP de Caracas ($3,68 M de $3,69 M) y de
 * Valencia ($3,69 M de $4,38 M), y la mitad de la cartera de Panamá.
 */
export const RE_INTERCOMPANIA = /supricom|office solutions? center|ofimaster/i;

export function esIntercompania(nombrePartner: unknown): boolean {
  return RE_INTERCOMPANIA.test(String(nombrePartner ?? ""));
}
