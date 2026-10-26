import { ReporteFacturacion } from "@/components/inteligencia-negocio/reportes/ReporteFacturacion";

export const metadata = {
  title: "Facturación | Reportes | Inteligencia de Negocio",
  description: "Productos facturados en el mes",
};

export default function ReporteFacturacionPage() {
  return <ReporteFacturacion />;
}
