/**
 * Quién firma el acta de despacho de RMA: el cliente que retira, RMA y
 * Seguridad, sea retiro físico en la sucursal o envío por ruta o encomienda
 * (rma_cases.entrega_metodo). El método se muestra en el acta para que
 * Seguridad sepa cómo sale el equipo.
 *
 * Sin dependencias de servidor: lo usan la API y el formulario.
 */
export type MetodoEntrega = "sucursal" | "ruta" | "agencia";
export type RolFirmaDespacho = "cliente" | "seguridad" | "tecnico";

/** `sinSeguridad`: sede sin Seguridad (lib/rma/sedesSeguridad.ts), firman el cliente y RMA. */
export function firmasRequeridasDespacho(sinSeguridad = false): { rol: RolFirmaDespacho; etiqueta: string }[] {
  const firmas: { rol: RolFirmaDespacho; etiqueta: string }[] = [
    { rol: "cliente", etiqueta: "el cliente que retira" },
    { rol: "tecnico", etiqueta: "RMA" },
  ];
  return sinSeguridad ? firmas : [...firmas, { rol: "seguridad", etiqueta: "Seguridad" }];
}
