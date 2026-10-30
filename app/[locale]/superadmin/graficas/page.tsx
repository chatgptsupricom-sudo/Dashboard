import { CentroGraficas } from "@/components/graficas/CentroGraficas";

export const metadata = {
  title: "Centro de mando | Gráficas",
  description: "Gráficas de ventas, cobranza, inventario, RMA y RRHH",
};

export default function GraficasPage() {
  return <CentroGraficas />;
}
