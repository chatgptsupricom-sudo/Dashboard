"use client";

import { usePathname, useRouter } from "@/lib/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { useState, useTransition } from "react";

interface LanguageSwitcherProps {
  className?: string;
}

export function LanguageSwitcher({ className = "" }: LanguageSwitcherProps) {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);

  const languages = [
    { code: "es", label: "Español", flag: "🇪🇸" },
    { code: "en", label: "English", flag: "🇺🇸" },
  ];

  const handleLanguageChange = (newLocale: string) => {
    startTransition(() => {
      // ESTA ES LA CLAVE: next-intl/navigation maneja el cambio de URL
      router.replace(pathname, { locale: newLocale });
      setIsOpen(false);
    });
  };

  const currentLanguage = languages.find((lang) => lang.code === locale);

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/80 backdrop-blur hover:bg-white transition shadow-sm border border-gray-100 hover:shadow-md">
        <Globe size={16} className="text-gray-700" />
        <span className="text-sm font-medium text-gray-700">
          {currentLanguage?.label || "Idioma"}
        </span>
        <ChevronDown size={14} className="text-gray-400" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            // El pt-2 actúa como puente invisible para evitar distorsiones
            className="absolute top-full right-0 pt-2 z-50"
          >
            <div className="bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden min-w-[140px] py-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  disabled={isPending || locale === lang.code}
                  className={`flex items-center w-full px-4 py-2.5 text-sm transition-colors ${
                    locale === lang.code
                      ? "bg-blue-50 text-blue-700 font-semibold"
                      : "hover:bg-gray-50 text-gray-700"
                  }`}
                >
                  <span className="mr-3">{lang.flag}</span>
                  {lang.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
