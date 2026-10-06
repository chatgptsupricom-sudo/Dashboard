"use client";

import { useTranslations } from "next-intl";
import { StickyNote, UserRound } from "lucide-react";

/**
 * La nota del pedido en Odoo (lib/seguridad/notaPedido). Cuando retira el
 * cliente (o su transporte), ahí Ventas dice quién viene a buscar: se resalta,
 * y si falta se avisa, para que no se entregue sin saber a quién.
 */
export default function NotaPedido({
  nota,
  retira,
  className = "",
}: {
  nota: string | null | undefined;
  /** El cliente (o su transporte) retira en la sucursal. */
  retira: boolean;
  className?: string;
}) {
  const t = useTranslations("seguridad.mercancia.nota_pedido");
  if (!nota && !retira) return null;
  if (!nota) {
    return (
      <p className={`flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ${className}`}>
        <UserRound className="w-4 h-4 shrink-0 mt-px" />
        <span>{t("sin_nota_retira")}</span>
      </p>
    );
  }
  const Icono = retira ? UserRound : StickyNote;
  return (
    <div
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 ${
        retira ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50"
      } ${className}`}
    >
      <Icono
        className={`w-4 h-4 shrink-0 mt-0.5 ${retira ? "text-[color:var(--portal-primary,#741DFE)]" : "text-slate-400"}`}
      />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {t(retira ? "titulo_retira" : "titulo")}
        </p>
        <p className="mt-0.5 text-sm font-medium text-slate-800 whitespace-pre-line break-words">{nota}</p>
      </div>
    </div>
  );
}
