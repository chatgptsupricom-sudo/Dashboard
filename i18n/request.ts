import { getRequestConfig } from "next-intl/server";
import { routing } from "../i18n.config";

export default getRequestConfig(async ({ locale }) => {
  // Si el locale es undefined, usamos el por defecto para evitar que la app explote
  const targetLocale = locale || routing.defaultLocale;

  return {
    locale: targetLocale,
    messages: (await import(`../messages/${targetLocale}.json`)).default,
  };
});
