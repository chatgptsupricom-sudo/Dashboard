import StoplightReportSuperadmin from "@/components/superadmin/StoplightReport";

// Metadatos para el SEO interno y la pestaña del navegador
export const metadata = {
  title: "Stoplight Reports | Superadmin",
  description: "Gestión y evaluación de KPIs estratégicos",
};

export default function StoplightReportPage() {
  return (
    <div className="w-full h-full min-h-screen bg-slate-50/50">
      {/*
        El componente importado ya maneja su propio padding y fondos,
        pero este contenedor asegura que ocupe todo el espacio disponible
        dentro del layout del superadmin.
      */}
      <StoplightReportSuperadmin />
    </div>
  );
}
