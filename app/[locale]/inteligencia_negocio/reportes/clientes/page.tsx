import { ReporteClientes } from "@/components/inteligencia-negocio/reportes/ReporteClientes";

export const metadata = {
  title: "Clientes | Reportes | Inteligencia de Negocio",
  description: "Venta por cliente, crédito, zona y vendedor",
};

export default function ReporteClientesPage() {
  return <ReporteClientes />;
}
