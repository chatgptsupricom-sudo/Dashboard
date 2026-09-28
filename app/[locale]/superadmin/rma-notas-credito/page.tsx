"use client";

import { SolicitudesNotaCredito } from "@/components/rma/SolicitudesNotaCredito";
import { FileCheck2 } from "lucide-react";
import { useTranslations } from "next-intl";

/** Las solicitudes de nota de crédito que envía RMA, para que el Super Admin las vea. */
export default function SuperAdminNotasCreditoRmaPage() {
  const t = useTranslations("rma");

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-purple-100 rounded-xl">
          <FileCheck2 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t("nc_aprobacion_title")}</h1>
          <p className="text-sm text-slate-500">{t("nc_aprobacion_desc")}</p>
        </div>
      </div>

      <SolicitudesNotaCredito />
    </div>
  );
}
