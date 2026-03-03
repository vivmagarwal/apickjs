import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { createLocaleService } from '../src/services/locale.js';
import { registerI18nRoutes } from '../src/routes/index.js';
import type { LocaleService } from '../src/services/locale.js';

function setupTestEnvironment(config?: { defaultLocale?: string; locales?: string[] }) {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const localeService = createLocaleService({
    rawDb: db,
    defaultLocale: config?.defaultLocale || 'en',
    locales: config?.locales || ['en'],
  });

  const routes: Array<{ method: string; path: string; handler: Function }> = [];
  const server = { route: (r: any) => routes.push(r) };

  return { db, localeService, server, routes };
}

// ==========================================================================
// Locale Service
// ==========================================================================

describe('LocaleService', () => {
  let db: InstanceType<typeof Database>;
  let service: LocaleService;

  beforeEach(() => {
    const env = setupTestEnvironment({ locales: ['en', 'fr', 'de'] });
    db = env.db;
    service = env.localeService;
  });

  afterEach(() => db.close());

  it('seeds initial locales', () => {
    const locales = service.findAll();
    expect(locales).toHaveLength(3);
    const codes = locales.map(l => l.code);
    expect(codes).toContain('en');
    expect(codes).toContain('fr');
    expect(codes).toContain('de');
  });

  it('sets default locale on seed', () => {
    const defaultLocale = service.getDefaultLocale();
    expect(defaultLocale.code).toBe('en');
    expect(defaultLocale.isDefault).toBe(true);
  });

  it('finds locale by code', () => {
    const fr = service.findByCode('fr');
    expect(fr).not.toBeNull();
    expect(fr!.code).toBe('fr');
    expect(fr!.name).toBe('French');
  });

  it('returns null for unknown code', () => {
    expect(service.findByCode('xx')).toBeNull();
  });

  it('creates a new locale', () => {
    const locale = service.create({ code: 'ja', name: 'Japanese' });
    expect(locale.id).toBeDefined();
    expect(locale.code).toBe('ja');
    expect(locale.isDefault).toBe(false);
  });

  it('creates locale with isDefault flag', () => {
    const locale = service.create({ code: 'es', name: 'Spanish', isDefault: true });
    expect(locale.isDefault).toBe(true);

    // Previous default should be unset
    const en = service.findByCode('en');
    expect(en!.isDefault).toBe(false);
  });

  it('updates a locale', () => {
    const fr = service.findByCode('fr')!;
    const updated = service.updateById(fr.id!, { name: 'Français' });
    expect(updated!.name).toBe('Français');
  });

  it('deletes a non-default locale', () => {
    const fr = service.findByCode('fr')!;
    expect(service.deleteById(fr.id!)).toBe(true);
    expect(service.findByCode('fr')).toBeNull();
  });

  it('cannot delete the default locale', () => {
    const en = service.findByCode('en')!;
    expect(service.deleteById(en.id!)).toBe(false);
    expect(service.findByCode('en')).not.toBeNull();
  });

  it('sets default locale by code', () => {
    const result = service.setDefaultLocale('fr');
    expect(result).not.toBeNull();
    expect(result!.isDefault).toBe(true);

    const defaultLocale = service.getDefaultLocale();
    expect(defaultLocale.code).toBe('fr');
  });

  it('returns null when setting non-existent default', () => {
    expect(service.setDefaultLocale('xx')).toBeNull();
  });

  it('gets all locale codes', () => {
    const codes = service.getLocaleCodes();
    expect(codes).toEqual(['en', 'fr', 'de']);
  });

  it('validates locale codes', () => {
    expect(service.isValidLocale('en')).toBe(true);
    expect(service.isValidLocale('fr')).toBe(true);
    expect(service.isValidLocale('xx')).toBe(false);
  });

  it('resolves locale names from code', () => {
    const en = service.findByCode('en')!;
    expect(en.name).toBe('English');

    const de = service.findByCode('de')!;
    expect(de.name).toBe('German');
  });

  it('handles single locale config', () => {
    const env = setupTestEnvironment();
    const locales = env.localeService.findAll();
    expect(locales).toHaveLength(1);
    expect(locales[0].code).toBe('en');
    expect(locales[0].isDefault).toBe(true);
    env.db.close();
  });
});

// ==========================================================================
// i18n Routes
// ==========================================================================

describe('i18n Routes', () => {
  let env: ReturnType<typeof setupTestEnvironment>;

  beforeEach(() => {
    env = setupTestEnvironment({ locales: ['en', 'fr'] });
    registerI18nRoutes({
      server: env.server,
      localeService: env.localeService,
    });
  });

  afterEach(() => env.db.close());

  function findRoute(method: string, path: string) {
    return env.routes.find((r) => r.method === method && r.path === path);
  }

  function mockCtx(overrides: any = {}): any {
    return {
      status: 200,
      body: null,
      params: overrides.params || {},
      query: overrides.query || {},
      request: { body: overrides.body || null },
      state: overrides.state || {},
    };
  }

  it('registers all expected routes', () => {
    expect(findRoute('GET', '/admin/i18n/locales')).toBeDefined();
    expect(findRoute('GET', '/admin/i18n/locales/:id')).toBeDefined();
    expect(findRoute('POST', '/admin/i18n/locales')).toBeDefined();
    expect(findRoute('PUT', '/admin/i18n/locales/:id')).toBeDefined();
    expect(findRoute('DELETE', '/admin/i18n/locales/:id')).toBeDefined();
    expect(findRoute('PUT', '/admin/i18n/locales/default')).toBeDefined();
  });

  it('GET /admin/i18n/locales lists locales', async () => {
    const route = findRoute('GET', '/admin/i18n/locales')!;
    const ctx = mockCtx();
    await route.handler(ctx);

    expect(ctx.body.data).toHaveLength(2);
    expect(ctx.body.data[0].code).toBe('en');
    expect(ctx.body.data[1].code).toBe('fr');
  });

  it('POST /admin/i18n/locales creates a locale', async () => {
    const route = findRoute('POST', '/admin/i18n/locales')!;
    const ctx = mockCtx({ body: { code: 'de', name: 'German' } });
    await route.handler(ctx);

    expect(ctx.status).toBe(201);
    expect(ctx.body.data.code).toBe('de');
  });

  it('POST /admin/i18n/locales rejects duplicates', async () => {
    const route = findRoute('POST', '/admin/i18n/locales')!;
    const ctx = mockCtx({ body: { code: 'en', name: 'English' } });
    await route.handler(ctx);

    expect(ctx.status).toBe(409);
  });

  it('DELETE /admin/i18n/locales/:id deletes locale', async () => {
    const fr = env.localeService.findByCode('fr')!;
    const route = findRoute('DELETE', '/admin/i18n/locales/:id')!;
    const ctx = mockCtx({ params: { id: String(fr.id) } });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(env.localeService.findByCode('fr')).toBeNull();
  });

  it('DELETE /admin/i18n/locales/:id rejects default locale', async () => {
    const en = env.localeService.findByCode('en')!;
    const route = findRoute('DELETE', '/admin/i18n/locales/:id')!;
    const ctx = mockCtx({ params: { id: String(en.id) } });
    await route.handler(ctx);

    expect(ctx.status).toBe(400);
    expect(ctx.body.error.message).toContain('default');
  });

  it('PUT /admin/i18n/locales/default changes default', async () => {
    const route = findRoute('PUT', '/admin/i18n/locales/default')!;
    const ctx = mockCtx({ body: { code: 'fr' } });
    await route.handler(ctx);

    expect(ctx.status).toBe(200);
    expect(ctx.body.data.isDefault).toBe(true);

    const newDefault = env.localeService.getDefaultLocale();
    expect(newDefault.code).toBe('fr');
  });
});
