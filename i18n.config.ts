// i18n.config.ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["es", "en"],
  defaultLocale: "es",
});

export type Locale = (typeof routing.locales)[number];
