import { describe, it, expect, vi } from 'vitest';
import { createEventHub } from '../src/event-hub/index.js';
import { createLogger } from '../src/logging/index.js';

function makeHub() {
  const logger = createLogger({ level: 'silent' });
  return createEventHub({ logger });
}

describe('EventHub', () => {
  it('emits events to listeners', async () => {
    const hub = makeHub();
    const calls: any[] = [];

    hub.on('test.event', (data) => {
      calls.push(data);
    });

    await hub.emit('test.event', { key: 'value' });

    expect(calls).toEqual([{ key: 'value' }]);
  });

  it('supports multiple listeners for the same event', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('test', () => calls.push(1));
    hub.on('test', () => calls.push(2));

    await hub.emit('test');

    expect(calls).toEqual([1, 2]);
  });

  it('subscribers receive all events', async () => {
    const hub = makeHub();
    const calls: Array<[string, any]> = [];

    hub.subscribe((event, data) => {
      calls.push([event, data]);
    });

    await hub.emit('a', 1);
    await hub.emit('b', 2);

    expect(calls).toEqual([['a', 1], ['b', 2]]);
  });

  it('subscribers run before listeners', async () => {
    const hub = makeHub();
    const order: string[] = [];

    hub.subscribe(() => order.push('subscriber'));
    hub.on('test', () => order.push('listener'));

    await hub.emit('test');

    expect(order).toEqual(['subscriber', 'listener']);
  });

  it('on() returns an unsubscribe function', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    const off = hub.on('test', () => calls.push(1));
    await hub.emit('test');
    expect(calls).toEqual([1]);

    off();
    await hub.emit('test');
    expect(calls).toEqual([1]); // no second call
  });

  it('once() fires only once', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.once('test', () => calls.push(1));

    await hub.emit('test');
    await hub.emit('test');

    expect(calls).toEqual([1]);
  });

  it('off() removes a specific listener', async () => {
    const hub = makeHub();
    const calls: number[] = [];
    const handler = () => calls.push(1);

    hub.on('test', handler);
    await hub.emit('test');
    expect(calls).toEqual([1]);

    hub.off('test', handler);
    await hub.emit('test');
    expect(calls).toEqual([1]);
  });

  it('errors in handlers are caught and do not propagate', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('test', () => {
      throw new Error('boom');
    });
    hub.on('test', () => calls.push(2));

    // Should not throw
    await hub.emit('test');
    expect(calls).toEqual([2]);
  });

  it('removeAllListeners clears all event listeners', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('a', () => calls.push(1));
    hub.on('b', () => calls.push(2));
    hub.removeAllListeners();

    await hub.emit('a');
    await hub.emit('b');
    expect(calls).toEqual([]);
  });

  it('removeAllSubscribers clears all subscribers', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.subscribe(() => calls.push(1));
    hub.removeAllSubscribers();

    await hub.emit('test');
    expect(calls).toEqual([]);
  });

  it('destroy clears everything', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    hub.on('test', () => calls.push(1));
    hub.subscribe(() => calls.push(2));

    hub.destroy();

    await hub.emit('test');
    expect(calls).toEqual([]);
  });

  it('subscribe() returns an unsubscribe function', async () => {
    const hub = makeHub();
    const calls: number[] = [];

    const unsub = hub.subscribe(() => calls.push(1));
    await hub.emit('test');
    expect(calls).toEqual([1]);

    unsub();
    await hub.emit('test');
    expect(calls).toEqual([1]);
  });
});
