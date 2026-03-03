/**
 * @apick/i18n
 *
 * Internationalization plugin for APICK CMS.
 * Provides locale management and locale-aware content operations.
 */

export { createLocaleService } from './services/locale.js';
export type { LocaleService, LocaleServiceConfig, Locale } from './services/locale.js';

export { registerI18nRoutes } from './routes/index.js';
