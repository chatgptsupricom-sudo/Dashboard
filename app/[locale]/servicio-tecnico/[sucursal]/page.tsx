import { ArrowRight, Camera, FileText, Search, Wrench } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function ServicioTecnicoLanding({
  params,
}: {
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;
  const t = await getTranslations({
    locale,
    namespace: "servicioTecnico",
  });

  const base = `/${locale}/servicio-tecnico/${sucursal}`;

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 sm:py-16">
      <section className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--portal-primary)]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-3 text-[2rem] leading-tight sm:text-[2.75rem]">
          {t("title")}
        </h1>
        <p className="mt-4 text-[color:var(--portal-muted)] sm:text-lg">
          {t("subtitle")}
        </p>
      </section>

      {/* Las dos opciones del portal. */}
      <section className="mt-10 grid gap-5 sm:mt-12 sm:grid-cols-2">
        <OptionCard
          href={`${base}/nuevo`}
          icon={<Wrench className="h-6 w-6" aria-hidden />}
          title={t("report.title")}
          description={t("report.desc")}
          hint={t("report.hint")}
          cta={t("report.cta")}
          variant="primary"
        />
        <OptionCard
          href={`${base}/consultar`}
          icon={<Search className="h-6 w-6" aria-hidden />}
          title={t("check.title")}
          description={t("check.desc")}
          hint={t("check.hint")}
          cta={t("check.cta")}
          variant="outline"
        />
      </section>

      {/* Qué debe tener a mano antes de empezar: evita que abandone a mitad
          del formulario porque no encuentra la factura. */}
      <section className="mt-14 rounded-[10px] border border-[color:var(--portal-line)] bg-[color:var(--portal-surface-soft)] p-6 sm:mt-16 sm:p-8">
        <h2 className="text-lg sm:text-xl">{t("needs.title")}</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          <NeedItem
            icon={<FileText className="h-5 w-5" aria-hidden />}
            title={t("needs.invoice")}
            description={t("needs.invoiceDesc")}
          />
          <NeedItem
            icon={<Wrench className="h-5 w-5" aria-hidden />}
            title={t("needs.fault")}
            description={t("needs.faultDesc")}
          />
          <NeedItem
            icon={<Camera className="h-5 w-5" aria-hidden />}
            title={t("needs.media")}
            description={t("needs.mediaDesc")}
          />
        </ul>
      </section>

      <p className="mt-10 text-sm text-[color:var(--portal-muted)]">
        {t("help.text")}{" "}
        <a
          href="mailto:soporte.tecnico@supricom.com.ve"
          className="portal-link-underline font-semibold text-[color:var(--portal-primary)]"
        >
          {t("help.cta")}
        </a>
      </p>
    </div>
  );
}

function OptionCard({
  href,
  icon,
  title,
  description,
  hint,
  cta,
  variant,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  cta: string;
  variant: "primary" | "outline";
}) {
  return (
    <Link href={href} className="portal-card group">
      <span
        className="flex h-12 w-12 items-center justify-center rounded-[10px] bg-[color:var(--portal-primary-soft)] text-[color:var(--portal-primary)]"
        aria-hidden
      >
        {icon}
      </span>
      <h2 className="mt-5 text-xl">{title}</h2>
      <p className="mt-2 text-[color:var(--portal-muted)]">{description}</p>
      <p className="mt-4 text-sm text-[color:var(--portal-muted)]">{hint}</p>
      <span
        className={`portal-btn mt-6 w-full ${
          variant === "primary" ? "portal-btn-primary" : "portal-btn-outline"
        }`}
      >
        {cta}
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  );
}

function NeedItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 shrink-0 text-[color:var(--portal-primary)]" aria-hidden>
        {icon}
      </span>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm text-[color:var(--portal-muted)]">
          {description}
        </p>
      </div>
    </li>
  );
}
