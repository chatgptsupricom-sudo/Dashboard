import { ClasificacionClientes } from "@/components/inteligencia-negocio/clasificacion/ClasificacionClientes";

export const metadata = {
  title: "Clasificación de clientes | Compras",
  description: "Actividad comercial de cada cliente",
};

// La misma pantalla y la misma clasificación que Inteligencia de Negocio.
export default function ClasificacionClientesComprasPage() {
  return <ClasificacionClientes />;
}
