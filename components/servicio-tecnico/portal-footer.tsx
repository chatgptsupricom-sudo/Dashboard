import { Mail } from "lucide-react";

const EMAIL = "soporte.tecnico@supricom.com.ve";

export function PortalFooter() {
  return (
    <footer className="mt-16 border-t border-[color:var(--portal-line)] bg-[color:var(--portal-surface-soft)]">
      <div className="mx-auto max-w-5xl px-5 py-10">
        <p className="max-w-md text-sm text-[color:var(--portal-muted)]">
          Empresa dedicada a la venta al mayor de todo lo referente a equipos de
          impresión y computadora.
        </p>

        <div className="mt-6 flex flex-col gap-2 text-sm sm:flex-row sm:gap-8">
          <a
            href={`mailto:${EMAIL}`}
            className="flex items-center gap-2 font-semibold break-all hover:text-[color:var(--portal-primary)]"
          >
            <Mail className="h-4 w-4" aria-hidden />
            {EMAIL}
          </a>
        </div>

        <p className="mt-8 border-t border-[color:var(--portal-line)] pt-6 text-xs text-[color:var(--portal-muted)]">
          Todos los derechos reservados, Supricom Venezuela.
        </p>
      </div>
    </footer>
  );
}
