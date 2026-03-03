/**
 * Database lifecycle hooks.
 *
 * 12 hooks: beforeCreate, afterCreate, beforeUpdate, afterUpdate,
 * beforeDelete, afterDelete, beforeFindOne, afterFindOne,
 * beforeFindMany, afterFindMany, beforeCount, afterCount.
 */

import type { Logger } from '@apick/types';

export type LifecycleAction =
  | 'beforeCreate' | 'afterCreate'
  | 'beforeUpdate' | 'afterUpdate'
  | 'beforeDelete' | 'afterDelete'
  | 'beforeFindOne' | 'afterFindOne'
  | 'beforeFindMany' | 'afterFindMany'
  | 'beforeCount' | 'afterCount';

export interface LifecycleEvent {
  action: LifecycleAction;
  model: string; // UID
  params: any;
  result?: any;
  state: Map<string, any>; // Shared state between before/after pairs
}

export type LifecycleHandler = (event: LifecycleEvent) => void | Promise<void>;

export interface LifecycleSubscription {
  models?: string[]; // UIDs to match, empty = all
  handler: LifecycleHandler;
}

export interface LifecycleRegistry {
  subscribe(uid: string, handlers: Partial<Record<LifecycleAction, LifecycleHandler>>): void;
  subscribeGlobal(handler: LifecycleHandler): void;
  run(event: LifecycleEvent): Promise<void>;
}

export function createLifecycleRegistry(logger: Logger): LifecycleRegistry {
  const perModel = new Map<string, Map<LifecycleAction, LifecycleHandler[]>>();
  const globalHandlers: LifecycleHandler[] = [];

  return {
    subscribe(uid: string, handlers: Partial<Record<LifecycleAction, LifecycleHandler>>) {
      if (!perModel.has(uid)) {
        perModel.set(uid, new Map());
      }
      const modelHandlers = perModel.get(uid)!;

      for (const [action, handler] of Object.entries(handlers)) {
        if (!handler) continue;
        const act = action as LifecycleAction;
        if (!modelHandlers.has(act)) {
          modelHandlers.set(act, []);
        }
        modelHandlers.get(act)!.push(handler);
      }
    },

    subscribeGlobal(handler: LifecycleHandler) {
      globalHandlers.push(handler);
    },

    async run(event: LifecycleEvent) {
      // Run global handlers first
      for (const handler of globalHandlers) {
        try {
          await handler(event);
        } catch (err) {
          logger.error({ err, event: event.action, model: event.model }, 'Lifecycle hook error (global)');
        }
      }

      // Run model-specific handlers
      const modelHandlers = perModel.get(event.model);
      if (modelHandlers) {
        const handlers = modelHandlers.get(event.action) || [];
        for (const handler of handlers) {
          try {
            await handler(event);
          } catch (err) {
            logger.error({ err, event: event.action, model: event.model }, 'Lifecycle hook error');
          }
        }
      }
    },
  };
}
