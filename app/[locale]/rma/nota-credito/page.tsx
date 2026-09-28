"use client";

import { SolicitudesNotaCredito } from "@/components/rma/SolicitudesNotaCredito";
import { Button } from "@/components/ui/button";
import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

/**
 * Sección Nota de Crédito de RMA: solicitar una (caso, producto y por qué) y
 * seguir las que ya se pidieron. Las aprueba o rechaza el Super Admin
 * (/superadmin/rma-notas-credito).
 */
export default function RmaNotaCreditoPage() {
  const t = useTranslations("rma");
  const params = useParams();
  const locale = (params?.locale as string) || "es";

  return (
    <div className="p-4 sm:p-8 space-y-6 bg-slate-50/30 min-h-screen max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 rounded-xl">
            <FileText className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("nota_credito_title")}</h1>
            <p className="text-sm text-slate-500">{t("nc_seccion_desc")}</p>
          </div>
        </div>
        <Link href={`/${locale}/rma/nota-credito/solicitar`}>
          <Button className="bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            {t("nc_solicitar")}
          </Button>
        </Link>
      </div>

      <SolicitudesNotaCredito modo="rma" />
    </div>
  );
}
