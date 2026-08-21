"use client";

import { LanguageSwitcher } from "@/components/auth/language-switcher";
import { useAuthStore } from "@/lib/stores/auth.store";
import { motion } from "framer-motion";
import { LogOut, Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";

interface TopBarProps {
  onToggleSidebar: () => void;
}

export function TopBar({ onToggleSidebar }: TopBarProps) {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("common");

  const handleLogout = () => {
    logout();
    router.push("/login");
  };

  return (
    <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
      <div className="flex items-center gap-4">
        <motion.button
          onClick={onToggleSidebar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 hover:bg-gray-100 rounded-lg transition"
        >
          <Menu size={24} className="text-gray-700" />
        </motion.button>

        <div className="flex items-center gap-3">
          <Image
            src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/LOGO%20SUPRICOM%202026-N6SbKZ6A9MEirf101HifmpfeaRIAJa.png"
            alt="SUPRICOM"
            width={100}
            height={30}
            className="h-8 w-auto"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-6">
        <LanguageSwitcher className="flex-shrink-0" />

        {user && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              {/* <p className="text-sm font-semibold text-gray-900">{user.name}</p> */}
              <p className="text-xs text-gray-500 capitalize">{user.role}</p>
            </div>

            <motion.button
              onClick={handleLogout}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition"
              title={t("logout")}
            >
              <LogOut size={20} />
            </motion.button>
          </div>
        )}
      </div>
    </div>
  );
}
