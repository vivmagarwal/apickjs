import { describe, it, expect } from 'vitest';
import {
  createRegistry,
  createLazyRegistry,
  createHookRegistry,
  createCustomFieldRegistry,
} from '../src/registries/index.js';

describe('createRegistry', () => {
  it('adds and retrieves entries', () => {
    const reg = createRegistry<string>();
    reg.add('key1', 'value1');
    expect(reg.get('key1')).toBe('value1');
  });

  it('returns undefined for missing entries', () => {
    const reg = createRegistry();
    expect(reg.get('missing')).toBeUndefined();
  });

  it('has() checks existence', () => {
    const reg = createRegistry();
    reg.add('x', 1);
    expect(reg.has('x')).toBe(true);
    expect(reg.has('y')).toBe(false);
  });

  it('getAll() returns all entries', () => {
    const reg = createRegistry<number>();
    reg.add('a', 1);
    reg.add('b', 2);
    expect(reg.getAll()).toEqual({ a: 1, b: 2 });
  });

  it('delete() removes entries', () => {
    const reg = createRegistry();
    reg.add('x', 1);
    reg.delete('x');
    expect(reg.has('x')).toBe(false);
  });

  it('extend() modifies existing entries', () => {
    const reg = createRegistry<{ count: number }>();
    reg.add('x', { count: 1 });
    reg.extend('x', (current) => ({ count: current.count + 10 }));
    expect(reg.get('x')).toEqual({ count: 11 });
  });

  it('extend() throws for missing entries', () => {
    const reg = createRegistry();
    expect(() => reg.extend('missing', (c) => c)).toThrow();
  });

  it('is iterable', () => {
    const reg = createRegistry<number>();
    reg.add('a', 1);
    reg.add('b', 2);
    const entries = [...reg];
    expect(entries).toEqual([['a', 1], ['b', 2]]);
  });
});

describe('createLazyRegistry', () => {
  const fakeApick = {} as any;

  it('lazily instantiates on first get()', () => {
    const reg = createLazyRegistry<{ value: string }>(fakeApick);
    let callCount = 0;
    reg.add('svc', () => {
      callCount++;
      return { value: 'hello' };
    });

    expect(callCount).toBe(0);
    expect(reg.get('svc')).toEqual({ value: 'hello' });
    expect(callCount).toBe(1);

    // Second get returns cached instance
    expect(reg.get('svc')).toEqual({ value: 'hello' });
    expect(callCount).toBe(1);
  });

  it('passes { apick } to factories', () => {
    const reg = createLazyRegistry(fakeApick);
    let receivedApick: any;
    reg.add('svc', ({ apick }) => {
      receivedApick = apick;
      return {};
    });
    reg.get('svc');
    expect(receivedApick).toBe(fakeApick);
  });

  it('re-adding a uid clears the cached instance', () => {
    const reg = createLazyRegistry<{ val: number }>(fakeApick);
    reg.add('svc', () => ({ val: 1 }));
    expect(reg.get('svc')).toEqual({ val: 1 });

    reg.add('svc', () => ({ val: 2 }));
    expect(reg.get('svc')).toEqual({ val: 2 });
  });

  it('getAll() materializes all factories', () => {
    const reg = createLazyRegistry<number>(fakeApick);
    reg.add('a', () => 1);
    reg.add('b', () => 2);
    expect(reg.getAll()).toEqual({ a: 1, b: 2 });
  });
});

describe('createHookRegistry', () => {
  it('auto-creates hooks on first access', () => {
    const reg = createHookRegistry();
    const hook = reg.get('test');
    expect(hook).toBeDefined();
    expect(typeof hook.register).toBe('function');
    expect(typeof hook.call).toBe('function');
  });

  it('registers and calls handlers sequentially', async () => {
    const reg = createHookRegistry();
    const hook = reg.get('test');
    const calls: number[] = [];

    hook.register(() => calls.push(1));
    hook.register(() => calls.push(2));

    await hook.call();
    expect(calls).toEqual([1, 2]);
  });

  it('passes arguments to handlers', async () => {
    const reg = createHookRegistry();
    const hook = reg.get('test');
    let received: any;

    hook.register((ctx: any) => {
      received = ctx;
    });

    await hook.call({ key: 'value' });
    expect(received).toEqual({ key: 'value' });
  });

  it('delete removes a handler', async () => {
    const reg = createHookRegistry();
    const hook = reg.get('test');
    const calls: number[] = [];
    const handler = () => calls.push(1);

    hook.register(handler);
    hook.delete(handler);

    await hook.call();
    expect(calls).toEqual([]);
  });
});

describe('createCustomFieldRegistry', () => {
  it('registers fields with plugin UID', () => {
    const reg = createCustomFieldRegistry();
    reg.register({ name: 'color-picker', plugin: 'my-plugin', type: 'string' });
    expect(reg.has('plugin::my-plugin.color-picker')).toBe(true);
    expect(reg.get('plugin::my-plugin.color-picker')).toEqual({
      name: 'color-picker',
      plugin: 'my-plugin',
      type: 'string',
    });
  });

  it('registers fields with global UID', () => {
    const reg = createCustomFieldRegistry();
    reg.register({ name: 'rating', type: 'integer' });
    expect(reg.has('global::rating')).toBe(true);
  });

  it('getAll returns all fields', () => {
    const reg = createCustomFieldRegistry();
    reg.register({ name: 'a', type: 'string' });
    reg.register({ name: 'b', plugin: 'x', type: 'integer' });
    const all = reg.getAll();
    expect(Object.keys(all)).toEqual(['global::a', 'plugin::x.b']);
  });
});
