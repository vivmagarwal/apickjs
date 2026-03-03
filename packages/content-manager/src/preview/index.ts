/**
 * Content Preview Service.
 *
 * Generates preview URLs for draft content. Delegates URL generation
 * to a user-defined handler function configured in plugin settings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PreviewHandler = (
  uid: string,
  context: {
    documentId: string;
    locale?: string;
    status: 'draft' | 'published';
  },
) => Promise<string | null> | string | null;

export interface PreviewConfig {
  enabled: boolean;
  handler: PreviewHandler;
}

export interface PreviewService {
  /** Check if preview is enabled */
  isEnabled(): boolean;

  /** Get preview URL for a content entry */
  getPreviewUrl(params: {
    contentType: string;
    documentId: string;
    locale?: string;
    status?: 'draft' | 'published';
  }): Promise<string | null>;

  /** Update preview configuration */
  configure(config: Partial<PreviewConfig>): void;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createPreviewService(config?: Partial<PreviewConfig>): PreviewService {
  let currentConfig: PreviewConfig = {
    enabled: config?.enabled ?? false,
    handler: config?.handler ?? (() => null),
  };

  return {
    isEnabled() {
      return currentConfig.enabled;
    },

    async getPreviewUrl(params) {
      if (!currentConfig.enabled) return null;

      const result = await currentConfig.handler(params.contentType, {
        documentId: params.documentId,
        locale: params.locale,
        status: params.status || 'draft',
      });

      return result;
    },

    configure(newConfig) {
      if (newConfig.enabled !== undefined) currentConfig.enabled = newConfig.enabled;
      if (newConfig.handler !== undefined) currentConfig.handler = newConfig.handler;
    },
  };
}
