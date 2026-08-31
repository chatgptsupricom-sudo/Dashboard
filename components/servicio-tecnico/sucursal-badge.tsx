import { MapPin } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

/**
 * Franja delgada bajo el header con la sucursal detectada por la URL.
 *
 * La sucursal del portal es automática por URL (no la elige el cliente), así
 * que sin esto no hay ninguna pista visible de en qué sucursal está: solo se
 * infiere del correo del footer. Un cliente que llegó a /panama por un enlace
 * viejo o mal copiado no tiene forma de notarlo antes de llenar el formulario.
 */
export async function SucursalBadge({
  locale,
  nombre,
}: {
  locale: string;
  nombre: string;
}) {
  const t = await getTranslations({ locale, namespace: "servicioTecnico" });

  return (
    <div className="border-b border-[color:var(--portal-line)] bg-[color:var(--portal-surface-soft)]">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 font-semibold text-[color:var(--portal-primary)]">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {t("sucursalBadge", { nombre })}
        </span>
        <Link
          href={`/${locale}/servicio-tecnico`}
          className="text-[color:var(--portal-muted)] hover:text-[color:var(--portal-primary)] hover:underline"
        >
          {t("sucursalBadgeChange")}
        </Link>
      </div>
    </div>
  );
}
