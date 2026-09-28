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

export function firmasRequeridasDespacho(): { rol: RolFirmaDespacho; etiqueta: string }[] {
  return [
    { rol: "cliente", etiqueta: "el cliente que retira" },
    { rol: "tecnico", etiqueta: "RMA" },
    { rol: "seguridad", etiqueta: "Seguridad" },
  ];
}
