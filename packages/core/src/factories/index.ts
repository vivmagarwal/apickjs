/**
 * Factory barrel exports.
 *
 * These factories are the primary API for user-land code to define
 * controllers, services, and routers for their content types.
 */

export { createCoreController } from './core-controller.js';
export { createCoreService } from './core-service.js';
export { createCoreRouter } from './core-router.js';

import { createCoreController } from './core-controller.js';
import { createCoreService } from './core-service.js';
import { createCoreRouter } from './core-router.js';

export const factories = {
  createCoreController,
  createCoreService,
  createCoreRouter,
};
