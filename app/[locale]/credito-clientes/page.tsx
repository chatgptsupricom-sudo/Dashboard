import { baseNC } from "@/lib/notas-credito/hostCliente";
import { sucursalesPermitidas } from "@/lib/servicio-tecnico/sucursales";
import { ArrowRight, MapPin } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";

/** Portada del servicio: elige la sucursal donde compraste. */
export default async function ElegirSucursalNCPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "creditoClientes" });
  const base = baseNC((await headers()).get("host"), locale);
  return (
    <div className="pt-page min-h-full">
      <div className="pt-shell" style={{ maxWidth: "48rem" }}>
        <p className="pt-eyebrow">{t("eyebrow")}</p>
        <h1 className="pt-display mt-4">{t("elegirTitulo")}</h1>
        <p className="pt-lede">{t("elegirSubtitulo")}</p>
        <div className="pt-branches">
          {sucursalesPermitidas().map((s) => (
            <Link key={s.cid} href={`${base}/${s.slug}`} className="pt-branch group">
              <span className="pt-branch__pin" aria-hidden>
                <MapPin className="h-5 w-5" aria-hidden />
              </span>
              <span className="pt-branch__name">{s.nombre}</span>
              <span className="pt-branch__go">
                {t("elegirIr")}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
