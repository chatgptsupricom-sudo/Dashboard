import { sucursalesPermitidas } from "@/lib/servicio-tecnico/sucursales";
import { getTranslations } from "next-intl/server";
import { ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";

/**
 * Elige tu sucursal. Cada sucursal reparte su propio enlace
 * (/servicio-tecnico/valencia, /panama, /caracas) — esta pantalla solo
 * existe para quien llega sin ese segmento (el enlace raíz del subdominio,
 * un marcador viejo, alguien que borró la URL a mano).
 */
export default async function ElegirSucursalPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "servicioTecnico" });
  const sucursales = sucursalesPermitidas();

  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--portal-primary)]">
        {t("eyebrow")}
      </p>
      <h1 className="mt-3 text-[2rem] leading-tight sm:text-[2.75rem]">
        {t("chooseBranchTitle")}
      </h1>
      <p className="mt-4 text-[color:var(--portal-muted)] sm:text-lg">
        {t("chooseBranchSubtitle")}
      </p>

      <div className="mt-10 grid gap-4">
        {sucursales.map((s) => (
          <Link
            key={s.cid}
            href={`/${locale}/servicio-tecnico/${s.slug}`}
            className="portal-card group flex items-center justify-between"
          >
            <span className="flex items-center gap-3">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[color:var(--portal-primary-soft)] text-[color:var(--portal-primary)]"
                aria-hidden
              >
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <span className="text-lg font-semibold">{s.nombre}</span>
            </span>
            <ArrowRight
              className="h-5 w-5 text-[color:var(--portal-muted)] transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
