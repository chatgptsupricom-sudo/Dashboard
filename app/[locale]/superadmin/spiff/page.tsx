"use client";
import SpiffSeccion from "@/components/spiff/SpiffSeccion";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/lib/stores/auth.store";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";

// La usa también Inteligencia de Negocio (re-export), que solo lee.
export default function SuperadminSpiffPage() {
  const t = useTranslations("spiff");
  const { user } = useAuthStore();
  const readonly = (user?.role || "").toLowerCase().trim() === ROL_BI;

  return (
    <div className="space-y-6 bg-slate-50/50 p-4 sm:p-8 min-h-screen">
      <SpiffSeccion
        title={t("title")}
        subtitle={t("subtitle")}
        showCompanyFilter={true}
        readonly={readonly}
      />
    </div>
  );
}
