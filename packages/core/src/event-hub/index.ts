import type { EventHub, EventListener, EventSubscriber, Logger } from '@apick/types';

/**
 * Creates the central event hub for the Apick framework.
 *
 * The hub supports two handler types:
 *
 *   **Subscribers** receive *every* event — useful for audit logging, telemetry,
 *   or global side-effects. They are invoked before any event-specific listeners.
 *
 *   **Listeners** are registered for a specific event name and are invoked only
 *   when that event is emitted.
 *
 * Execution order for `emit(event, data)`:
 *   1. All subscribers — sequentially, in registration order
 *   2. All listeners for `event` — sequentially, in registration order
 *
 * Errors thrown by any handler are caught, logged, and swallowed so that one
 * misbehaving handler cannot break the rest of the pipeline.
 *
 * @example
 *   const hub = createEventHub({ logger });
 *
 *   hub.subscribe((event, data) => {
 *     logger.debug({ event, data }, 'event emitted');
 *   });
 *
 *   const off = hub.on('user.created', async (data) => {
 *     await sendWelcomeEmail(data.email);
 *   });
 *
 *   await hub.emit('user.created', { email: 'ada@example.com' });
 *
 *   off(); // remove the listener
 */
export function createEventHub(opts: { logger: Logger }): EventHub {
  const { logger } = opts;

  /**
   * Map of event name -> ordered set of listeners.
   * Using Set preserves insertion order and provides O(1) deletion.
   */
  const listeners = new Map<string, Set<EventListener>>();

  /**
   * Global subscribers that receive every event.
   */
  const subscribers = new Set<EventSubscriber>();

  // ---- Internal helpers ----

  /**
   * Returns (or creates) the listener set for a given event name.
   */
  function getListenerSet(event: string): Set<EventListener> {
    let set = listeners.get(event);
    if (!set) {
      set = new Set<EventListener>();
      listeners.set(event, set);
    }
    return set;
  }

  /**
   * Safely invokes a handler, catching and logging any errors.
   */
  async function safeCall(
    fn: (...args: any[]) => void | Promise<void>,
    args: any[],
    label: string,
  ): Promise<void> {
    try {
      await fn(...args);
    } catch (error) {
      logger.error(
        { error, label },
        `EventHub: error in ${label}`,
      );
    }
  }

  // ---- Public API ----

  const hub: EventHub = {
    /**
     * Emit an event.
     *
     * Runs all subscribers first (with event name + data), then all listeners
     * registered for the given event name (with data only). Each handler is
     * awaited sequentially so execution order is deterministic.
     */
    async emit(event: string, data?: any): Promise<void> {
      // Phase 1: subscribers (receive every event)
      for (const subscriber of subscribers) {
        await safeCall(subscriber, [event, data], `subscriber for "${event}"`);
      }

      // Phase 2: event-specific listeners
      const set = listeners.get(event);
      if (set) {
        for (const listener of set) {
          await safeCall(listener, [data], `listener for "${event}"`);
        }
      }
    },

    /**
     * Register a listener for a specific event.
     *
     * @returns An unsubscribe function that removes the listener.
     *
     * @example
     *   const off = hub.on('model.beforeCreate', (data) => { ... });
     *   off(); // removes the listener
     */
    on(event: string, handler: EventListener): () => void {
      const set = getListenerSet(event);
      set.add(handler);

      // Return unsubscribe function
      return () => {
        set.delete(handler);
        // Clean up empty sets to avoid memory leaks
        if (set.size === 0) {
          listeners.delete(event);
        }
      };
    },

    /**
     * Register a one-time listener for a specific event.
     * The handler is automatically removed after its first invocation.
     */
    once(event: string, handler: EventListener): void {
      const wrapper: EventListener = async (data?: any) => {
        // Remove ourselves before calling the handler so that if the handler
        // re-emits the same event we don't fire again.
        const set = listeners.get(event);
        if (set) {
          set.delete(wrapper);
          if (set.size === 0) {
            listeners.delete(event);
          }
        }

        await handler(data);
      };

      getListenerSet(event).add(wrapper);
    },

    /**
     * Remove a specific listener for a specific event.
     */
    off(event: string, handler: EventListener): void {
      const set = listeners.get(event);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          listeners.delete(event);
        }
      }
    },

    /**
     * Register a global subscriber that receives every event.
     *
     * @returns An unsubscribe function that removes the subscriber.
     *
     * @example
     *   const unsub = hub.subscribe((event, data) => {
     *     console.log(`[${event}]`, data);
     *   });
     *   unsub(); // removes the subscriber
     */
    subscribe(handler: EventSubscriber): () => void {
      subscribers.add(handler);

      return () => {
        subscribers.delete(handler);
      };
    },

    /**
     * Remove all event-specific listeners (across all events).
     * Subscribers are not affected.
     */
    removeAllListeners(): void {
      listeners.clear();
    },

    /**
     * Remove all global subscribers.
     * Event-specific listeners are not affected.
     */
    removeAllSubscribers(): void {
      subscribers.clear();
    },

    /**
     * Tear down the event hub entirely.
     * Removes all listeners and all subscribers.
     */
    destroy(): void {
      listeners.clear();
      subscribers.clear();
    },
  };

  return hub;
}
