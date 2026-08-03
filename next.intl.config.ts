import { getRequestConfig } from 'next-intl/server';
import { i18n } from './i18n.config';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = requestLocale;

  // Validar que el locale sea válido
  if (!locale || !i18n.locales.includes(locale as any)) {
    locale = i18n.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
