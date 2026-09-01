import { Mail } from "lucide-react";
import Link from "next/link";

const SITIO = "https://supricom.com.ve";
const LOGO = `${SITIO}/wp-content/uploads/2025/06/LOGO-SUPRICOM.png`;
const EMAIL = "soporte.tecnico@supricom.com.ve";

export function PortalHeader({ locale }: { locale: string }) {
  return (
    <header>
      {/* Franja de contacto, igual a la del sitio. En móvil se oculta para no
          robarle la pantalla al contenido. */}
      <div className="portal-topbar hidden sm:block">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-x-6 gap-y-1 px-5 py-2 text-[13px] text-white">
          <a
            href={`mailto:${EMAIL}`}
            className="flex items-center gap-1.5 hover:underline"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {EMAIL}
          </a>
        </div>
      </div>

      <div className="border-b border-[color:var(--portal-line)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-4">
          <Link href={`/${locale}/servicio-tecnico`} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={LOGO}
              alt="Supricom"
              className="h-9 w-auto sm:h-10"
              width={180}
              height={40}
            />
          </Link>
          <a
            href={SITIO}
            className="text-sm font-semibold text-[color:var(--portal-muted)] hover:text-[color:var(--portal-primary)]"
          >
            supricom.com.ve
          </a>
        </div>
      </div>
    </header>
  );
}
