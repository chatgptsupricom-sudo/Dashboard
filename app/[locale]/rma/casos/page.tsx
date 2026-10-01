import { redirect } from "next/navigation";

/**
 * La lista única de casos se partió en dos inventarios: vendidos por Supricom
 * y no vendidos por Supricom. Los enlaces viejos (/rma/casos?status=...)
 * llevan al de Supricom, o al externo con ?procedencia=externo.
 */
export default async function RmaCasosPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const procedencia = sp.procedencia === "externo" ? "externo" : "supricom";
  const q = new URLSearchParams();
  for (const k of ["status", "grupo", "mes"]) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  redirect(`/${locale}/rma/inventario/${procedencia}${q.size ? `?${q}` : ""}`);
}
