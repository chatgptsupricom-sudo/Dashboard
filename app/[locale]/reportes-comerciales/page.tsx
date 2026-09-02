import { ReporteTrimestral } from "@/components/reportes-comerciales/ReporteTrimestral";

// Seccion "Reportes Comerciales". Por ahora solo el reporte trimestral de
// Panama por marca (default EZVIZ). Mas adelante alojara tambien el reporte
// mensual por marca (agregar como tab / ruta hermana).
export default function ReportesComercialesPage() {
  return <ReporteTrimestral />;
}
