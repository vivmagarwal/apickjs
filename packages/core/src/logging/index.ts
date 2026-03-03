import pino from 'pino';
import type { Logger, LoggerConfig } from '@apick/types';

/**
 * Creates a Pino logger instance from the given configuration.
 *
 * Supports structured JSON output (production) or pino-pretty (development).
 * The returned pino instance satisfies the Logger interface which includes
 * fatal, error, warn, info, debug, trace, and child().
 */
export function createLogger(config: LoggerConfig): Logger {
  const options: pino.LoggerOptions = {
    level: config.level ?? 'info',
  };

  // Explicitly disable the logger if configured
  if (config.enabled === false) {
    options.enabled = false;
  }

  // Timestamp configuration
  if (config.timestamp !== undefined) {
    if (typeof config.timestamp === 'boolean') {
      options.timestamp = config.timestamp;
    } else {
      // Custom timestamp function
      options.timestamp = config.timestamp as () => string;
    }
  }

  // Formatters (e.g. level, bindings, log formatters)
  if (config.formatters) {
    options.formatters = config.formatters as pino.LoggerOptions['formatters'];
  }

  // Serializers — custom functions that transform specific keys in log output
  if (config.serializers) {
    options.serializers = config.serializers;
  }

  // Redaction — mask sensitive fields in log output
  if (config.redact) {
    options.redact = {
      paths: config.redact.paths,
      ...(config.redact.censor !== undefined ? { censor: config.redact.censor } : {}),
    };
  }

  // Transport — pino-pretty for dev, custom transports for production pipelines.
  // When a transport is configured, pino handles it via worker threads.
  if (config.transport) {
    options.transport = config.transport as pino.TransportSingleOptions | pino.TransportMultiOptions;
  }

  const logger = pino(options);

  // Pino's logger already satisfies our Logger interface (fatal, error, warn,
  // info, debug, trace, child) so we return it directly.
  return logger as unknown as Logger;
}
