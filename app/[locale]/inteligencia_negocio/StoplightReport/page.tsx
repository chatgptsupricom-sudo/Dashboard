import { Loader2 } from "lucide-react";

export const metadata = {
  title: "Stoplight Reports | Inteligencia de Negocio",
  description: "KPIs estratégicos de las tres sedes",
};

// Por ahora Inteligencia de Negocio no ve los KPIs del Stoplight: solo el
// aviso de que viene. Para volver a mostrarlo, renderizar
// <StoplightReportSuperadmin biMode /> (components/superadmin/StoplightReport).
export default function StoplightReportPage() {
  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white px-10 py-12 text-center shadow-sm">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-slate-900">Próximamente</h1>
          <p className="text-sm text-slate-500">Estamos preparando el Stoplight Report para Inteligencia de Negocio.</p>
        </div>
      </div>
    </div>
  );
}
