"use client";
import SpiffManager from "@/components/spiff/spiff-manager";
import { useTranslations } from "next-intl";

export default function SuperadminSpiffPage() {
  const t = useTranslations("spiff");

  return (
    <div className="space-y-6 bg-slate-50/50 p-8 min-h-screen">
      <SpiffManager
        title={t("title")}
        subtitle={t("subtitle")}
        showCompanyFilter={true}
      />
    </div>
  );
}
