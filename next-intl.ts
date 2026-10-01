import { getRequestConfig } from "next-intl/server";
import { routing } from "../i18n.config"; // Cambiado de i18n a routing y ajustada la ruta

export default getRequestConfig(async ({ locale }) => {
  // Validar que el locale sea válido o usar el por defecto
  const targetLocale = routing.locales.includes(locale as any)
    ? locale
    : routing.defaultLocale;

  return {
    locale: targetLocale,
    // Asegúrate de que la ruta hacia /messages sea correcta desde la ubicación de este archivo
    messages: (await import(`../messages/${targetLocale}.json`)).default,
  };
});
