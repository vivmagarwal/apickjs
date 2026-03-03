/**
 * @apick/provider-upload-r2 — Cloudflare R2 Upload Provider.
 *
 * Uploads files to Cloudflare R2 using the S3-compatible API.
 * No SDK dependency — uses fetch with AWS Signature V4 signing.
 */

import { createHmac, createHash } from 'node:crypto';

// Inline UploadProvider to avoid cross-package resolution issues
interface UploadProvider {
  upload(file: { name: string; hash: string; ext: string; mime: string; buffer: Buffer; size: number }): Promise<{ url: string }> | { url: string };
  delete(file: { hash: string; ext: string; url: string }): Promise<void> | void;
}

export interface R2ProviderConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

// ---------------------------------------------------------------------------
// AWS Signature V4 helpers (minimal, R2-compatible)
// ---------------------------------------------------------------------------

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function signRequest(
  method: string,
  url: URL,
  headers: Record<string, string>,
  body: Buffer | string,
  config: R2ProviderConfig,
): Record<string, string> {
  const now = new Date();
  const dateStamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const dateOnly = dateStamp.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const payloadHash = sha256(body);

  const signedHeaders: Record<string, string> = {
    ...headers,
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': dateStamp,
  };

  const headerKeys = Object.keys(signedHeaders).sort();
  const canonicalHeaders = headerKeys.map((k) => `${k.toLowerCase()}:${signedHeaders[k]}`).join('\n') + '\n';
  const signedHeaderStr = headerKeys.map((k) => k.toLowerCase()).join(';');

  const canonicalPath = url.pathname;
  const canonicalQuery = url.search ? url.search.slice(1) : '';

  const canonicalRequest = [
    method, canonicalPath, canonicalQuery, canonicalHeaders, signedHeaderStr, payloadHash,
  ].join('\n');

  const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', dateStamp, credentialScope, sha256(canonicalRequest)].join('\n');

  const signingKey = getSignatureKey(config.secretAccessKey, dateOnly, region, service);
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authHeader = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaderStr}, Signature=${signature}`;

  return {
    ...signedHeaders,
    Authorization: authHeader,
  };
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

export function createR2Provider(config: R2ProviderConfig): UploadProvider {
  const { accountId, bucketName, publicUrl } = config;

  if (!accountId || !config.accessKeyId || !config.secretAccessKey || !bucketName) {
    throw new Error('R2 provider requires accountId, accessKeyId, secretAccessKey, and bucketName.');
  }

  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`;

  return {
    async upload(file) {
      const key = `${file.hash}${file.ext}`;
      const url = new URL(`/${bucketName}/${key}`, endpoint);

      const headers = signRequest('PUT', url, { 'content-type': file.mime }, file.buffer, config);

      const response = await fetch(url.toString(), {
        method: 'PUT',
        headers,
        body: file.buffer,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`R2 upload error (${response.status}): ${error}`);
      }

      const fileUrl = publicUrl
        ? `${publicUrl.replace(/\/$/, '')}/${key}`
        : `${endpoint}/${bucketName}/${key}`;

      return { url: fileUrl };
    },

    async delete(file) {
      const key = `${file.hash}${file.ext}`;
      const url = new URL(`/${bucketName}/${key}`, endpoint);

      const headers = signRequest('DELETE', url, {}, '', config);

      const response = await fetch(url.toString(), {
        method: 'DELETE',
        headers,
      });

      if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`R2 delete error (${response.status}): ${error}`);
      }
    },
  };
}
