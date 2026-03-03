/**
 * Registry system for the APICK CMS core.
 *
 * Provides four registry factories:
 *  - createRegistry<T>()            — simple key-value store
 *  - createLazyRegistry<T>(apick)   — lazy-singleton store (factory invoked on first get)
 *  - createHookRegistry()           — named hook chains
 *  - createCustomFieldRegistry()    — custom field type registration
 */

import type {
  Apick,
  Hook,
  HookRegistry,
  CustomFieldRegistry,
  CustomFieldDefinition,
} from '@apick/types';

// ---------------------------------------------------------------------------
// Registry interface (re-exported for convenience)
// ---------------------------------------------------------------------------

export interface Registry<T = any> {
  add(uid: string, value: T): void;
  get(uid: string): T | undefined;
  has(uid: string): boolean;
  getAll(): Record<string, T>;
  delete(uid: string): void;
  extend(uid: string, extender: (current: T) => T): void;
  [Symbol.iterator](): Iterator<[string, T]>;
}

export interface LazyRegistry<T = any> {
  add(uid: string, factory: (opts: { apick: Apick }) => T): void;
  get(uid: string): T | undefined;
  has(uid: string): boolean;
  getAll(): Record<string, T>;
  delete(uid: string): void;
  extend(uid: string, extender: (current: T) => T): void;
  [Symbol.iterator](): Iterator<[string, T]>;
}

// ---------------------------------------------------------------------------
// createRegistry — simple key-value registry
// ---------------------------------------------------------------------------

export function createRegistry<T = any>(): Registry<T> {
  const store = new Map<string, T>();

  return {
    add(uid: string, value: T): void {
      store.set(uid, value);
    },

    get(uid: string): T | undefined {
      return store.get(uid);
    },

    has(uid: string): boolean {
      return store.has(uid);
    },

    getAll(): Record<string, T> {
      const result: Record<string, T> = {};
      for (const [key, value] of store) {
        result[key] = value;
      }
      return result;
    },

    delete(uid: string): void {
      store.delete(uid);
    },

    extend(uid: string, extender: (current: T) => T): void {
      const current = store.get(uid);
      if (current === undefined) {
        throw new Error(
          `Registry: cannot extend "${uid}" — entry does not exist.`,
        );
      }
      store.set(uid, extender(current));
    },

    [Symbol.iterator](): Iterator<[string, T]> {
      return store.entries();
    },
  };
}

// ---------------------------------------------------------------------------
// createLazyRegistry — lazy-singleton registry
//
// Factories are stored separately from instances.  On the first call to
// get(uid) the factory is invoked with { apick } and the resulting instance
// is cached for all subsequent accesses.
// ---------------------------------------------------------------------------

export function createLazyRegistry<T = any>(apick: Apick): LazyRegistry<T> {
  const factories = new Map<string, (opts: { apick: Apick }) => T>();
  const instances = new Map<string, T>();

  return {
    add(uid: string, factory: (opts: { apick: Apick }) => T): void {
      factories.set(uid, factory);
      // If this uid was previously instantiated, clear the cached instance so
      // the new factory takes effect on the next get().
      instances.delete(uid);
    },

    get(uid: string): T | undefined {
      // Return cached instance if available.
      if (instances.has(uid)) {
        return instances.get(uid);
      }

      // Attempt lazy instantiation.
      const factory = factories.get(uid);
      if (!factory) {
        return undefined;
      }

      const instance = factory({ apick });
      instances.set(uid, instance);
      return instance;
    },

    has(uid: string): boolean {
      return factories.has(uid) || instances.has(uid);
    },

    getAll(): Record<string, T> {
      // Instantiate every registered factory that hasn't been resolved yet,
      // then return the full map.
      for (const [uid] of factories) {
        if (!instances.has(uid)) {
          const factory = factories.get(uid)!;
          instances.set(uid, factory({ apick }));
        }
      }

      const result: Record<string, T> = {};
      for (const [key, value] of instances) {
        result[key] = value;
      }
      return result;
    },

    delete(uid: string): void {
      factories.delete(uid);
      instances.delete(uid);
    },

    extend(uid: string, extender: (current: T) => T): void {
      // Ensure the instance exists (triggers lazy instantiation if needed).
      const current = this.get(uid);
      if (current === undefined) {
        throw new Error(
          `LazyRegistry: cannot extend "${uid}" — entry does not exist.`,
        );
      }
      instances.set(uid, extender(current));
    },

    [Symbol.iterator](): Iterator<[string, T]> {
      // Materialize all entries so the iterator is complete.
      this.getAll();
      return instances.entries();
    },
  };
}

// ---------------------------------------------------------------------------
// createHookRegistry — named hook chains
//
// Hooks are auto-created on first access.  Each hook stores an ordered array
// of handler functions.  call() executes them sequentially (awaiting each).
// ---------------------------------------------------------------------------

function createHook(): Hook {
  const handlers: Array<(...args: any[]) => any> = [];

  return {
    register(handler: (...args: any[]) => any): void {
      handlers.push(handler);
    },

    delete(handler: (...args: any[]) => any): void {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) {
        handlers.splice(idx, 1);
      }
    },

    async call(...args: any[]): Promise<void> {
      for (const handler of handlers) {
        await handler(...args);
      }
    },
  };
}

export function createHookRegistry(): HookRegistry {
  const hooks = new Map<string, Hook>();

  return {
    get(name: string): Hook {
      let hook = hooks.get(name);
      if (!hook) {
        hook = createHook();
        hooks.set(name, hook);
      }
      return hook;
    },
  };
}

// ---------------------------------------------------------------------------
// createCustomFieldRegistry — custom field type registration
//
// UIDs follow the pattern:
//   - "plugin::{plugin}.{name}" when the field has a plugin property
//   - "global::{name}"          when there is no plugin
// ---------------------------------------------------------------------------

function buildCustomFieldUid(field: CustomFieldDefinition): string {
  if (field.plugin) {
    return `plugin::${field.plugin}.${field.name}`;
  }
  return `global::${field.name}`;
}

export function createCustomFieldRegistry(): CustomFieldRegistry {
  const store = new Map<string, CustomFieldDefinition>();

  return {
    register(field: CustomFieldDefinition): void {
      const uid = buildCustomFieldUid(field);
      store.set(uid, field);
    },

    get(uid: string): CustomFieldDefinition | undefined {
      return store.get(uid);
    },

    getAll(): Record<string, CustomFieldDefinition> {
      const result: Record<string, CustomFieldDefinition> = {};
      for (const [key, value] of store) {
        result[key] = value;
      }
      return result;
    },

    has(uid: string): boolean {
      return store.has(uid);
    },
  };
}
