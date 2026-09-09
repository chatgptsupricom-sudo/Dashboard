export const SEDES = [
  { id: "9", label: "Valencia" },
  { id: "10", label: "Caracas" },
  { id: "7", label: "Panamá" },
];

export const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9,   // Valencia
  10: 10, // Caracas
  7: 7,   // Panamá
};

// Compras de Valencia/Caracas maneja proveedores de "Venezuela" como una
// sola region -- una orden de cualquiera de esas 2 sedes puede usar
// proveedores de la otra. Panama es su propia region, separada. Pedido
// explicito del usuario al ver que el selector de proveedor solo traia
// los de la sede exacta de la orden.
export const COMPANIAS_DE_LA_REGION: Record<number, number[]> = {
  9: [9, 10],  // Valencia -> Venezuela (Valencia + Caracas)
  10: [9, 10], // Caracas -> Venezuela (Valencia + Caracas)
  7: [7],      // Panama -> solo Panama
};
