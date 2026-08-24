import { ArrowLeft, Phone } from "lucide-react";
import Link from "next/link";

/**
 * Placeholder de las pantallas que todavía no existen (/nuevo y /consultar).
 * Los enlaces de la landing ya apuntan aquí para que nadie caiga en un 404
 * mientras se desarrollan los issues del formulario y de la consulta.
 */
export function PortalPlaceholder({
  locale,
  title,
  description,
  backLabel,
  phoneLabel,
}: {
  locale: string;
  title: string;
  description: string;
  backLabel: string;
  phoneLabel: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-10 sm:py-16">
      <Link
        href={`/${locale}/servicio-tecnico`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {backLabel}
      </Link>

      <h1 className="mt-6 text-[1.75rem] sm:text-[2.25rem]">{title}</h1>
      <p className="mt-4 text-[color:var(--portal-muted)]">{description}</p>

      <a href="tel:+584228008204" className="portal-btn portal-btn-primary mt-8">
        <Phone className="h-4 w-4" aria-hidden />
        {phoneLabel}
      </a>
    </div>
  );
}
