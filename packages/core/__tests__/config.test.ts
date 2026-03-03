import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createConfigProvider } from '../src/config/index.js';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('ConfigProvider', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'apick-test-'));
    fs.mkdirSync(path.join(tmpDir, 'config'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a config provider with get/set/has', () => {
    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') });
    expect(typeof config.get).toBe('function');
    expect(typeof config.set).toBe('function');
    expect(typeof config.has).toBe('function');
  });

  it('get() returns default for missing keys', () => {
    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') });
    expect(config.get('server.host', '0.0.0.0')).toBe('0.0.0.0');
    expect(config.get('nonexistent')).toBeUndefined();
  });

  it('set() and get() work together', () => {
    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') });
    config.set('server.host', 'localhost');
    expect(config.get('server.host')).toBe('localhost');
  });

  it('has() checks existence', () => {
    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') });
    config.set('server.port', 3000);
    expect(config.has('server.port')).toBe(true);
    expect(config.has('server.missing')).toBe(false);
  });

  it('loads config files via _load()', async () => {
    // Create a JS config file (ESM)
    const serverConfigContent = `export default ({ env }) => ({
  host: '127.0.0.1',
  port: 4000,
});
`;
    fs.writeFileSync(path.join(tmpDir, 'config', 'server.js'), serverConfigContent);

    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') }) as any;
    await config._load();

    expect(config.get('server.host')).toBe('127.0.0.1');
    expect(config.get('server.port')).toBe(4000);
  });

  it('loads environment overrides', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    // Base config
    fs.writeFileSync(
      path.join(tmpDir, 'config', 'server.js'),
      `export default ({ env }) => ({ host: '0.0.0.0', port: 1337 });`
    );

    // Test environment override
    fs.mkdirSync(path.join(tmpDir, 'config', 'env', 'test'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'config', 'env', 'test', 'server.js'),
      `export default ({ env }) => ({ port: 9999 });`
    );

    const config = createConfigProvider({ appDir: tmpDir, distDir: path.join(tmpDir, 'dist') }) as any;
    await config._load();

    expect(config.get('server.host')).toBe('0.0.0.0'); // from base
    expect(config.get('server.port')).toBe(9999); // from override

    process.env.NODE_ENV = originalNodeEnv;
  });
});
