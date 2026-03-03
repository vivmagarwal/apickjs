import type { MiddlewareConfigEntry } from '@apick/types';

const middlewares: MiddlewareConfigEntry[] = [
  'apick::logger',
  'apick::errors',
  'apick::security',
  'apick::cors',
  'apick::body',
  'apick::session',
  'apick::favicon',
  'apick::public',
];

export default middlewares;
