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
    <div className="pt-page min-h-full">
      <div className="pt-shell" style={{ maxWidth: "48rem" }}>
        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-display mt-4">{t("chooseBranchTitle")}</h1>
        <p className="pt-lede">{t("chooseBranchSubtitle")}</p>

        <div className="pt-branches">
          {sucursales.map((s) => (
            <Link
              key={s.cid}
              href={`/${locale}/servicio-tecnico/${s.slug}`}
              className="pt-branch group"
            >
              <span className="pt-branch__pin" aria-hidden>
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <span className="pt-branch__name">{s.nombre}</span>
              <span className="pt-branch__go">
                {t("chooseBranchGo")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
