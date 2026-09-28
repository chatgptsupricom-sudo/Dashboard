"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PenLine } from "lucide-react";
import ActasPorFirmar from "@/components/seguridad/ActasPorFirmar";
import { PageHeader } from "@/components/seguridad/mercancia-ui";

/**
 * Panel de Almacén para firmar su parte de las actas de RMA (ingreso y
 * despacho). La firma de Almacén es opcional; Seguridad firma la suya en el
 * mostrador y RMA en el caso.
 */
export default function ActasRmaAlmacenPage() {
  const t = useTranslations("seguridad.actas_firmar");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <PageHeader
        icon={PenLine}
        titulo={t("titulo_almacen")}
        subtitulo={t("subtitulo_almacen")}
        volverA={`/${locale}/seguridad/mercancia/egreso`}
      />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <ActasPorFirmar rol="almacen" />
      </main>
    </div>
  );
}
