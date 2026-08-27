"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Send,
  ShieldCheck,
  Smartphone,
  Star,
  X,
} from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth.store";

/**
 * Sidebar propio del modulo Seguridad.
 *
 * NO es el sidebar del panel: este solo lista lo que el almacen usa, y el rol
 * `seguridad` no tiene por que ver el resto del dashboard. Por eso el rol
 * mantiene `sections: []` en lib/types.ts.
 *
 * En movil no ocupa sitio: se abre desde el boton del header y se cierra al
 * navegar. El mostrador (/seguridad/mostrador) se queda sin sidebar a
 * proposito — es la pantalla de estar de pie con el equipo en la mano, y ahi
 * cada pixel cuenta.
 */

type Entrada = {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** true cuando la ruta activa debe coincidir exacto y no por prefijo. */
  exacta?: boolean;
};

export default function SidebarSeguridad() {
  const t = useTranslations("seguridad");
  const tn = useTranslations("seguridad.nav");
  const params = useParams();
  const pathname = usePathname() || "";
  const locale = (params?.locale as string) || "es";
  const { user, logout } = useAuthStore();
  const [abierto, setAbierto] = useState(false);

  const base = `/${locale}/seguridad`;

  const entradas: Entrada[] = [
    {
      href: base,
      label: tn("dashboard"),
      icon: <LayoutDashboard className="w-4 h-4" />,
      exacta: true,
    },
    {
      href: `${base}/ingreso`,
      label: tn("ingresos"),
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      href: `${base}/despacho`,
      label: tn("despachos"),
      icon: <Send className="w-4 h-4" />,
    },
    {
      href: `${base}/almacenista`,
      label: tn("almacenistas"),
      icon: <Star className="w-4 h-4" />,
    },
    {
      href: `${base}/mostrador`,
      label: tn("mostrador"),
      icon: <Smartphone className="w-4 h-4" />,
    },
  ];

  const activa = (e: Entrada) =>
    e.exacta ? pathname === e.href : pathname.startsWith(e.href);

  const contenido = (
    <>
      <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200">
        <div className="p-2 rounded-xl bg-violet-100 shrink-0">
          <ShieldCheck className="w-5 h-5 text-violet-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-slate-900 truncate">
            {t("module_title")}
          </p>
          <p className="text-[11px] text-slate-500 truncate">
            {user?.name || t("logged_in_as")}
          </p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {entradas.map((e) => (
          <Link
            key={e.href}
            href={e.href}
            onClick={() => setAbierto(false)}
            className={`flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold transition-colors ${
              activa(e)
                ? "text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            }`}
            style={
              activa(e)
                ? { backgroundColor: "var(--portal-primary,#741DFE)" }
                : undefined
            }
          >
            {e.icon}
            {e.label}
          </Link>
        ))}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <button
          type="button"
          onClick={() => {
            logout();
            window.location.href = `/${locale}/login`;
          }}
          className="w-full flex items-center gap-3 min-h-[44px] px-3 rounded-[10px] text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          {t("logout")}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Escritorio: fijo a la izquierda */}
      <aside className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 lg:w-60 bg-white border-r border-slate-200 z-30">
        {contenido}
      </aside>

      {/* Movil: boton flotante que abre el panel */}
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label={tn("abrir_menu")}
        className="lg:hidden fixed top-3 left-3 z-40 p-2.5 rounded-[10px] bg-white border border-slate-200 shadow-sm text-slate-600"
      >
        <Menu className="w-5 h-5" />
      </button>

      {abierto && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-white flex flex-col shadow-xl">
            <div className="flex justify-end p-2">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                aria-label={tn("cerrar_menu")}
                className="p-2 rounded-[10px] text-slate-500 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {contenido}
          </div>
          {/* Tocar fuera cierra */}
          <div className="flex-1 bg-black/40" onClick={() => setAbierto(false)} />
        </div>
      )}
    </>
  );
}
