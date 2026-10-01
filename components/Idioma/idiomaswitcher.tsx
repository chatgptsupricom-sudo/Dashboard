"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next-intl/navigation";
import { useTransition } from "react";

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  const onSelectChange = (nextLocale: string) => {
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  };

  return (
    <div className="relative group">
      {/* Botón */}
      <button className="flex items-center gap-2 px-4 py-2 border rounded-lg bg-white hover:bg-slate-50 transition-colors">
        <span>🌐</span> {locale === "es" ? "Español" : "English"}
      </button>

      {/* Menú (con un padding superior para evitar distorsiones) */}
      <div className="absolute top-full right-0 pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
        <div className="w-40 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          <button
            onClick={() => onSelectChange("es")}
            disabled={isPending || locale === "es"}
            className="w-full text-left px-4 py-3 hover:bg-blue-50 text-blue-600 font-medium"
          >
            Español
          </button>
          <button
            onClick={() => onSelectChange("en")}
            disabled={isPending || locale === "en"}
            className="w-full text-left px-4 py-3 hover:bg-slate-50 text-slate-700 font-medium"
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
