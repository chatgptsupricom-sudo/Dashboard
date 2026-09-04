import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";
import { jwtSecretBytes } from "@/lib/secretos";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";
import { ReporteTrimestral } from "@/components/reportes-comerciales/ReporteTrimestral";

export const dynamic = "force-dynamic";

// Sección "Reportes Comerciales". Por ahora solo el reporte trimestral de
// Panamá por marca (default EZVIZ). El acceso se valida acá en el servidor
// (además del middleware) para no depender de env incrustadas en el cliente.
export default async function ReportesComercialesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const token = (await cookies()).get("token")?.value;
  if (!token) redirect(`/${locale}/login`);

  let payload: Record<string, unknown>;
  try {
    payload = (await jwtVerify(token, jwtSecretBytes())).payload as Record<string, unknown>;
  } catch {
    redirect(`/${locale}/login`);
  }

  if (
    !puedeVerReportesComerciales({
      role: payload.role as string,
      email: payload.email as string,
    })
  ) {
    redirect(`/${locale}/dashboard`);
  }

  return <ReporteTrimestral />;
}
