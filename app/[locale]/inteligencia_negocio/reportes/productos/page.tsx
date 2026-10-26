import { ReporteProductos } from "@/components/inteligencia-negocio/reportes/ReporteProductos";

export const metadata = {
  title: "Productos | Reportes | Inteligencia de Negocio",
  description: "Venta, margen e inventario al cierre por producto",
};

export default function ReporteProductosPage() {
  return <ReporteProductos />;
}
