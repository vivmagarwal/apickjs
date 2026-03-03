import { describe, it, expect } from 'vitest';
import { createR2Provider } from '../src/index.js';

/**
 * Cloudflare R2 Upload Provider Tests.
 *
 * Tests with real R2 API when R2 credentials are set.
 */

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;
const hasR2 = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME);

describe('R2 Upload Provider', () => {
  it('has correct factory function', () => {
    expect(typeof createR2Provider).toBe('function');
  });

  it('throws without required config', () => {
    expect(() => createR2Provider({ accountId: '', accessKeyId: '', secretAccessKey: '', bucketName: '', publicUrl: '' }))
      .toThrow('R2 provider requires');
  });

  it('creates provider with upload and delete methods', () => {
    const provider = createR2Provider({
      accountId: 'test', accessKeyId: 'test', secretAccessKey: 'test',
      bucketName: 'test', publicUrl: 'https://example.com',
    });
    expect(typeof provider.upload).toBe('function');
    expect(typeof provider.delete).toBe('function');
  });

  describe.skipIf(!hasR2)('real R2 API calls', () => {
    function makeProvider() {
      return createR2Provider({
        accountId: R2_ACCOUNT_ID!,
        accessKeyId: R2_ACCESS_KEY_ID!,
        secretAccessKey: R2_SECRET_ACCESS_KEY!,
        bucketName: R2_BUCKET_NAME!,
        publicUrl: R2_PUBLIC_URL || '',
      });
    }

    it('uploads a file and returns a public URL', async () => {
      const provider = makeProvider();
      const testContent = `APICK test file created at ${new Date().toISOString()}`;
      const buffer = Buffer.from(testContent, 'utf-8');

      const result = await provider.upload({
        name: 'apick-test.txt',
        hash: `apick-test-${Date.now()}`,
        ext: '.txt',
        mime: 'text/plain',
        buffer,
        size: buffer.length,
      });

      expect(result.url).toBeTruthy();
      expect(result.url).toContain('.txt');

      // Verify the file is publicly accessible
      if (R2_PUBLIC_URL) {
        const response = await fetch(result.url);
        expect(response.ok).toBe(true);
        const text = await response.text();
        expect(text).toBe(testContent);
      }
    });

    it('uploads and then deletes a file', async () => {
      const provider = makeProvider();
      const hash = `apick-delete-test-${Date.now()}`;
      const buffer = Buffer.from('delete me', 'utf-8');

      const result = await provider.upload({
        name: 'delete-test.txt', hash, ext: '.txt',
        mime: 'text/plain', buffer, size: buffer.length,
      });

      expect(result.url).toBeTruthy();

      // Delete should not throw
      await expect(
        provider.delete({ hash, ext: '.txt', url: result.url })
      ).resolves.toBeUndefined();
    });

    it('delete of non-existent file does not throw', async () => {
      const provider = makeProvider();

      await expect(
        provider.delete({ hash: 'nonexistent-file-12345', ext: '.txt', url: 'https://example.com/nonexistent.txt' })
      ).resolves.toBeUndefined();
    });
  });
});
