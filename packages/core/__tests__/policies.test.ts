import { describe, it, expect, vi } from 'vitest';
import { createPolicyRunner } from '../src/policies/index.js';
import { createRegistry } from '../src/registries/index.js';
import { createLogger } from '../src/logging/index.js';

const logger = createLogger({ level: 'silent' });

// --- Helper to create a mock Apick-like object ---

function createMockApick(policies: Record<string, any> = {}) {
  const registry = createRegistry();
  for (const [name, handler] of Object.entries(policies)) {
    registry.add(name, handler);
  }

  return {
    log: logger,
    policies: registry,
  };
}

// --- Helper to create a mock ApickContext ---

function createMockContext(overrides: any = {}): any {
  return {
    state: overrides.state || {},
    params: overrides.params || {},
    query: overrides.query || {},
    request: {
      body: overrides.body || null,
      headers: overrides.headers || {},
      method: overrides.method || 'GET',
      url: overrides.url || '/',
    },
    ip: '127.0.0.1',
    ...overrides,
  };
}

// ==========================================================================
// createPolicyRunner
// ==========================================================================

describe('createPolicyRunner', () => {
  it('returns true when no policies are provided', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies([], ctx);
    expect(result).toBe(true);
  });

  it('returns true when policies array is empty', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies([], ctx);
    expect(result).toBe(true);
  });

  it('resolves inline function policies', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies([() => true], ctx);
    expect(result).toBe(true);
  });

  it('short-circuits on first false return', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();
    const secondPolicy = vi.fn(() => true);

    const result = await runPolicies([() => false, secondPolicy], ctx);
    expect(result).toBe(false);
    expect(secondPolicy).not.toHaveBeenCalled();
  });

  it('runs all policies when all return true', async () => {
    const first = vi.fn(() => true);
    const second = vi.fn(() => true);
    const third = vi.fn(() => true);
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies([first, second, third], ctx);
    expect(result).toBe(true);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(third).toHaveBeenCalledTimes(1);
  });

  it('resolves policies by string name from registry', async () => {
    const handler = vi.fn(() => true);
    const apick = createMockApick({ 'global::is-admin': handler });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(['global::is-admin'], ctx);
    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('returns false for unresolved string policies', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(['nonexistent-policy'], ctx);
    expect(result).toBe(false);
  });

  it('resolves object-form policies { name, config }', async () => {
    const handler = vi.fn((_pctx: any, config: any) => {
      return config.role === 'admin';
    });
    const apick = createMockApick({ 'global::has-role': handler });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(
      [{ name: 'global::has-role', config: { role: 'admin' } }],
      ctx,
    );
    expect(result).toBe(true);
    expect(handler).toHaveBeenCalledWith(
      expect.any(Object),
      { role: 'admin' },
      { apick },
    );
  });

  it('denies when object-form policy returns false', async () => {
    const handler = vi.fn((_pctx: any, config: any) => {
      return config.role === 'admin';
    });
    const apick = createMockApick({ 'global::has-role': handler });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(
      [{ name: 'global::has-role', config: { role: 'user' } }],
      ctx,
    );
    expect(result).toBe(false);
  });

  it('supports async policies', async () => {
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const asyncPolicy = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      return true;
    };

    const result = await runPolicies([asyncPolicy], ctx);
    expect(result).toBe(true);
  });

  it('builds restricted policy context from full context', async () => {
    const handler = vi.fn((_pctx: any) => {
      expect(_pctx.state).toBeDefined();
      expect(_pctx.request).toBeDefined();
      expect(_pctx.request.method).toBe('POST');
      expect(_pctx.request.url).toBe('/api/articles');
      return true;
    });
    const apick = createMockApick();
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext({
      method: 'POST',
      url: '/api/articles',
    });
    // Manually set request method/url since the helper doesn't propagate these
    ctx.request.method = 'POST';
    ctx.request.url = '/api/articles';

    await runPolicies([handler], ctx);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('supports object-form policies with .handler property', async () => {
    const policyObj = {
      handler: vi.fn(() => true),
    };
    const apick = createMockApick({ 'global::is-authenticated': policyObj });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(['global::is-authenticated'], ctx);
    expect(result).toBe(true);
    expect(policyObj.handler).toHaveBeenCalledTimes(1);
  });

  it('validates config using .validator when present', async () => {
    const policyObj = {
      handler: vi.fn(() => true),
      validator: (config: any) => {
        if (!config.role) {
          return { valid: false, errors: ['role is required'] };
        }
        return { valid: true };
      },
    };
    const apick = createMockApick({ 'global::has-role': policyObj });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    // Should throw when config validation fails
    await expect(
      runPolicies([{ name: 'global::has-role', config: {} }], ctx),
    ).rejects.toThrow('Policy config validation failed');
  });

  it('passes validation when config is valid', async () => {
    const policyObj = {
      handler: vi.fn(() => true),
      validator: (config: any) => ({ valid: !!config.role }),
    };
    const apick = createMockApick({ 'global::has-role': policyObj });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(
      [{ name: 'global::has-role', config: { role: 'admin' } }],
      ctx,
    );
    expect(result).toBe(true);
  });

  it('mixes inline, string, and object policies', async () => {
    const registeredPolicy = vi.fn(() => true);
    const apick = createMockApick({ 'global::is-authenticated': registeredPolicy });
    const runPolicies = createPolicyRunner(apick);
    const ctx = createMockContext();

    const result = await runPolicies(
      [
        () => true, // inline
        'global::is-authenticated', // string
      ],
      ctx,
    );
    expect(result).toBe(true);
    expect(registeredPolicy).toHaveBeenCalledTimes(1);
  });
});
