"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardList, LogOut, Package, Send, ShieldCheck, Star } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

export default function SeguridadDashboard() {
  const t = useTranslations("seguridad");
  const params = useParams();
  const locale = (params?.locale as string) || "es";
  const { user, logout } = useAuthStore();

  const base = `/${locale}/seguridad`;

  return (
    <div className="min-h-screen">
      {/* Header del modulo */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-100">
              <ShieldCheck className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900">
                {t("module_title")}
              </h1>
              <p className="text-xs text-slate-500 hidden sm:block">
                {t("module_subtitle")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-slate-400">{t("logged_in_as")}</p>
              <p className="text-sm font-semibold text-slate-700">
                {user?.name || "Seguridad"}
              </p>
            </div>
            <button
              onClick={() => {
                logout();
                window.location.href = `/${locale}/seguridad/login`;
              }}
              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
              title={t("logout")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Saludo */}
        <section>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
            {t("welcome", { name: user?.name || "" })}
          </h2>
          <p className="text-sm text-slate-500 mt-1">{t("welcome_desc")}</p>
        </section>

        {/* Accesos principales - 4 tarjetas */}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ActionCard
            href={`${base}/ingreso/nuevo`}
            icon={<ClipboardList className="w-6 h-6" aria-hidden />}
            title={t("actions.ingreso.title")}
            description={t("actions.ingreso.desc")}
            cta={t("actions.ingreso.cta")}
            variant="primary"
          />
<ActionCard
            href={`${base}/despacho/nuevo`}
            icon={<Send className="w-6 h-6" aria-hidden />}
            title={t("actions.despacho.title")}
            description={t("actions.despacho.desc")}
            cta={t("actions.despacho.cta")}
            variant="outline"
          />
          <ActionCard
            href={`${base}/ingreso`}
            icon={<Package className="w-6 h-6" aria-hidden />}
            title={t("actions.ingresos_list.title")}
            description={t("actions.ingresos_list.desc")}
            cta={t("actions.ingresos_list.cta")}
            variant="outline"
          />
          <ActionCard
            href={`${base}/almacenista`}
            icon={<Star className="w-6 h-6" aria-hidden />}
            title={t("actions.calificaciones.title")}
            description={t("actions.calificaciones.desc")}
            cta={t("actions.calificaciones.cta")}
            variant="outline"
            disabled
          />
        </section>

        {/* Aviso de modulo en construccion */}
        <section className="rounded-2xl border border-violet-200 bg-violet-50 p-6">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-violet-100 shrink-0">
              <ShieldCheck className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="font-bold text-violet-900">{t("construction.title")}</h3>
              <p className="text-sm text-violet-700 mt-1">
                {t("construction.desc")}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
  cta,
  variant,
  disabled,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  cta: string;
  variant: "primary" | "outline";
  disabled?: boolean;
}) {
  const base =
    "flex flex-col rounded-2xl border p-5 sm:p-6 transition-all min-h-[180px]";
  const styles =
    variant === "primary"
      ? "border-violet-200 bg-violet-50 hover:bg-violet-100"
      : "border-slate-200 bg-white hover:border-violet-300";

  const content = (
    <>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-600 mb-4">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-slate-600 flex-1">{description}</p>
      <span
        className={`mt-4 text-sm font-semibold ${
          variant === "primary" ? "text-violet-700" : "text-slate-700"
        }`}
      >
        {cta} →
      </span>
    </>
  );

  if (disabled) {
    return (
      <div className={`${base} ${styles} opacity-60 cursor-not-allowed`}>
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={`${base} ${styles} hover:shadow-md`}>
      {content}
    </Link>
  );
}