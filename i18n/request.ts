import { getRequestConfig } from "next-intl/server";
import { routing } from "../i18n.config";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  // Validar que el locale sea válido
  if (!locale || !routing.locales.includes(locale as any)) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
