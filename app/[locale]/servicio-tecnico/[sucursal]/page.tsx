import {
  ArrowRight,
  Camera,
  Clock,
  FileText,
  Wrench,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function ServicioTecnicoLanding({
  params,
}: {
  params: Promise<{ locale: string; sucursal: string }>;
}) {
  const { locale, sucursal } = await params;
  const t = await getTranslations({ locale, namespace: "servicioTecnico" });

  const base = `/${locale}/servicio-tecnico/${sucursal}`;

  return (
    <div className="pt-page min-h-full">
      <div className="pt-shell">
        <div className="pt-hero">
          {/* Discurso + acciones */}
          <div>
            <p className="pt-eyebrow">{t("eyebrow")}</p>
            <h1 className="pt-display mt-4">{t("title")}</h1>
            <p className="pt-lede">{t("subtitle")}</p>

            <Link href={`${base}/nuevo`} className="pt-primary">
              {t("report.cta")}
              <ArrowRight className="h-5 w-5" aria-hidden />
            </Link>

            <div>
              <Link href={`${base}/consultar`} className="pt-secondary">
                <span>{t("check.lead")}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>

            <p className="pt-help">
              {t("help.text")}{" "}
              <a href="mailto:soporte.tecnico@supricom.com.ve">
                {t("help.cta")}
              </a>
            </p>
          </div>

          {/* Comprobante: qué tener a mano antes de empezar */}
          <aside className="pt-ticket">
            <div className="pt-ticket__strip" aria-hidden />
            <div className="pt-ticket__body">
              <p className="pt-ticket__kicker">{t("needs.kicker")}</p>
              <p className="pt-ticket__title">{t("needs.cardTitle")}</p>

              <div className="pt-ticket__list">
                <TicketRow
                  icon={<FileText className="h-[1.05rem] w-[1.05rem]" aria-hidden />}
                  title={t("needs.invoice")}
                  desc={t("needs.invoiceDesc")}
                />
                <TicketRow
                  icon={<Wrench className="h-[1.05rem] w-[1.05rem]" aria-hidden />}
                  title={t("needs.fault")}
                  desc={t("needs.faultDesc")}
                />
                <TicketRow
                  icon={<Camera className="h-[1.05rem] w-[1.05rem]" aria-hidden />}
                  title={t("needs.media")}
                  desc={t("needs.mediaDesc")}
                />
              </div>
            </div>

            <div className="pt-ticket__tear" aria-hidden />
            <p className="pt-ticket__foot">
              <Clock className="h-4 w-4" aria-hidden />
              {t("needs.time")}
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TicketRow({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="pt-ticket__row">
      {icon}
      <span>
        <b>{title}</b>
        <p>{desc}</p>
      </span>
    </div>
  );
}
