/**
 * Locale Service.
 *
 * Manages available locales: CRUD operations, default locale,
 * and fallback chain resolution.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Locale {
  id?: number;
  code: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocaleService {
  /** Get all configured locales */
  findAll(): Locale[];
  /** Find a locale by its code */
  findByCode(code: string): Locale | null;
  /** Find a locale by ID */
  findOne(id: number): Locale | null;
  /** Create a new locale */
  create(data: { code: string; name: string; isDefault?: boolean }): Locale;
  /** Update a locale */
  updateById(id: number, data: Partial<{ name: string; isDefault: boolean }>): Locale | null;
  /** Delete a locale (cannot delete default locale) */
  deleteById(id: number): boolean;
  /** Get the default locale */
  getDefaultLocale(): Locale;
  /** Set the default locale by code */
  setDefaultLocale(code: string): Locale | null;
  /** Get all locale codes */
  getLocaleCodes(): string[];
  /** Check if a locale code exists */
  isValidLocale(code: string): boolean;
}

export interface LocaleServiceConfig {
  rawDb: any;
  defaultLocale?: string;
  locales?: string[];
}

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

function ensureTables(db: any): void {
  db.exec(`CREATE TABLE IF NOT EXISTS "i18n_locales" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "code" VARCHAR(10) NOT NULL UNIQUE,
    "name" VARCHAR(255) NOT NULL,
    "is_default" INTEGER NOT NULL DEFAULT 0,
    "created_at" TEXT NOT NULL,
    "updated_at" TEXT NOT NULL
  )`);
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function rowToLocale(row: any): Locale {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    isDefault: row.is_default === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Locale name resolution
// ---------------------------------------------------------------------------

const LOCALE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  ru: 'Russian',
  nl: 'Dutch',
  sv: 'Swedish',
  da: 'Danish',
  fi: 'Finnish',
  no: 'Norwegian',
  pl: 'Polish',
  tr: 'Turkish',
  cs: 'Czech',
  el: 'Greek',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
};

function resolveLocaleName(code: string): string {
  return LOCALE_NAMES[code] || LOCALE_NAMES[code.split('-')[0]] || code;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createLocaleService(config: LocaleServiceConfig): LocaleService {
  const { rawDb } = config;
  ensureTables(rawDb);

  // Seed initial locales
  const defaultCode = config.defaultLocale || 'en';
  const initialLocales = config.locales || [defaultCode];

  function seedLocales(): void {
    const existing = rawDb.prepare(`SELECT code FROM "i18n_locales"`).all();
    const existingCodes = new Set(existing.map((r: any) => r.code));

    for (const code of initialLocales) {
      if (!existingCodes.has(code)) {
        const now = new Date().toISOString();
        rawDb.prepare(`
          INSERT INTO "i18n_locales" (code, name, is_default, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(code, resolveLocaleName(code), code === defaultCode ? 1 : 0, now, now);
      }
    }
  }

  seedLocales();

  return {
    findAll() {
      return rawDb.prepare(`SELECT * FROM "i18n_locales" ORDER BY id ASC`).all().map(rowToLocale);
    },

    findByCode(code) {
      const row = rawDb.prepare(`SELECT * FROM "i18n_locales" WHERE code = ?`).get(code);
      return row ? rowToLocale(row) : null;
    },

    findOne(id) {
      const row = rawDb.prepare(`SELECT * FROM "i18n_locales" WHERE id = ?`).get(id);
      return row ? rowToLocale(row) : null;
    },

    create(data) {
      const now = new Date().toISOString();
      const isDefault = data.isDefault ? 1 : 0;

      // If setting as default, unset others
      if (isDefault) {
        rawDb.prepare(`UPDATE "i18n_locales" SET is_default = 0`).run();
      }

      const result = rawDb.prepare(`
        INSERT INTO "i18n_locales" (code, name, is_default, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.code, data.name, isDefault, now, now);

      return this.findOne(result.lastInsertRowid as number)!;
    },

    updateById(id, data) {
      const existing = rawDb.prepare(`SELECT * FROM "i18n_locales" WHERE id = ?`).get(id);
      if (!existing) return null;

      const now = new Date().toISOString();
      const sets: string[] = ['updated_at = ?'];
      const values: any[] = [now];

      if (data.name !== undefined) { sets.push('name = ?'); values.push(data.name); }
      if (data.isDefault !== undefined) {
        if (data.isDefault) {
          rawDb.prepare(`UPDATE "i18n_locales" SET is_default = 0`).run();
        }
        sets.push('is_default = ?');
        values.push(data.isDefault ? 1 : 0);
      }

      values.push(id);
      rawDb.prepare(`UPDATE "i18n_locales" SET ${sets.join(', ')} WHERE id = ?`).run(...values);

      return this.findOne(id);
    },

    deleteById(id) {
      const locale = this.findOne(id);
      if (!locale) return false;
      if (locale.isDefault) return false; // Cannot delete default locale

      const result = rawDb.prepare(`DELETE FROM "i18n_locales" WHERE id = ?`).run(id);
      return result.changes > 0;
    },

    getDefaultLocale() {
      const row = rawDb.prepare(`SELECT * FROM "i18n_locales" WHERE is_default = 1`).get();
      if (!row) {
        // Fallback to first locale
        const first = rawDb.prepare(`SELECT * FROM "i18n_locales" ORDER BY id ASC LIMIT 1`).get();
        return first ? rowToLocale(first) : { id: 0, code: 'en', name: 'English', isDefault: true, createdAt: '', updatedAt: '' };
      }
      return rowToLocale(row);
    },

    setDefaultLocale(code) {
      const locale = this.findByCode(code);
      if (!locale) return null;

      rawDb.prepare(`UPDATE "i18n_locales" SET is_default = 0`).run();
      rawDb.prepare(`UPDATE "i18n_locales" SET is_default = 1 WHERE code = ?`).run(code);

      return this.findByCode(code);
    },

    getLocaleCodes() {
      return rawDb.prepare(`SELECT code FROM "i18n_locales" ORDER BY id ASC`).all().map((r: any) => r.code);
    },

    isValidLocale(code) {
      const row = rawDb.prepare(`SELECT 1 FROM "i18n_locales" WHERE code = ?`).get(code);
      return !!row;
    },
  };
}
