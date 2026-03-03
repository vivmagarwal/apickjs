/**
 * Policy Execution System.
 *
 * Policies are guard functions that run before a route handler.
 * They receive a policy context, optional configuration, and the apick instance,
 * and return `true` to allow the request or `false` to deny it.
 *
 * Policies execute sequentially — the first `false` return short-circuits
 * the chain and denies the request.
 *
 * Policies can be specified as:
 *   - A string name → resolved from `apick.policies.get(name)`
 *   - An inline function → used directly
 *   - An object `{ name, config }` → resolved by name, invoked with config
 */

import type { Apick, ApickContext, PolicyHandler } from '@apick/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The context object passed to every policy function.
 * Derived from the full ApickContext but limited to what policies need.
 */
export interface PolicyContext {
  state: ApickContext['state'];
  request: {
    body: any;
    headers: Record<string, string | undefined>;
    method: string;
    url: string;
    params: Record<string, string>;
    query: Record<string, any>;
  };
}

/**
 * A policy definition can take several forms.
 */
export type PolicyDefinition =
  | string
  | PolicyHandler
  | { name: string; config?: any };

/**
 * An object-form policy with a handler and an optional validator.
 * When a registered policy has `.handler` and optionally `.validator` properties,
 * the validator is called first to validate the config before the handler runs.
 */
export interface PolicyObject {
  handler: PolicyHandler;
  validator?: (config: any) => boolean | { valid: boolean; errors?: string[] };
}

/**
 * The runner function returned by `createPolicyRunner`.
 */
export type PolicyRunner = (
  policies: PolicyDefinition[],
  ctx: ApickContext,
) => Promise<boolean>;

// ---------------------------------------------------------------------------
// Policy context builder
// ---------------------------------------------------------------------------

/**
 * Builds a restricted policy context from the full request context.
 */
function buildPolicyContext(ctx: ApickContext): PolicyContext {
  return {
    state: ctx.state,
    request: {
      body: ctx.request.body,
      headers: ctx.request.headers,
      method: ctx.request.method,
      url: ctx.request.url,
      params: ctx.params,
      query: ctx.query,
    },
  };
}

// ---------------------------------------------------------------------------
// Policy resolution
// ---------------------------------------------------------------------------

/**
 * Resolves a policy definition into a callable handler and its config.
 *
 * @returns An object with `handler` and `config`, or `null` if the policy
 *          cannot be resolved (logged as a warning, not a hard error).
 */
function resolvePolicy(
  apick: any,
  definition: PolicyDefinition,
): { handler: PolicyHandler; config: any } | null {
  // --- Inline function ---
  if (typeof definition === 'function') {
    return { handler: definition as PolicyHandler, config: {} };
  }

  // --- String name ---
  if (typeof definition === 'string') {
    const resolved = apick.policies.get(definition);
    if (!resolved) {
      apick.log.warn({ policy: definition }, 'Policy not found in registry — skipping');
      return null;
    }
    return normalizePolicyValue(resolved, {});
  }

  // --- Object `{ name, config }` ---
  if (typeof definition === 'object' && definition !== null && 'name' in definition) {
    const resolved = apick.policies.get(definition.name);
    if (!resolved) {
      apick.log.warn({ policy: definition.name }, 'Policy not found in registry — skipping');
      return null;
    }
    return normalizePolicyValue(resolved, definition.config ?? {});
  }

  return null;
}

/**
 * Normalizes a resolved registry value into a handler + config pair.
 *
 * The value from the registry can be:
 *   - A function (the handler itself)
 *   - An object with `.handler` (and optionally `.validator`)
 */
function normalizePolicyValue(
  value: any,
  config: any,
): { handler: PolicyHandler; config: any } | null {
  if (typeof value === 'function') {
    return { handler: value, config };
  }

  if (typeof value === 'object' && value !== null && typeof value.handler === 'function') {
    const policyObj = value as PolicyObject;

    // Validate config if a validator is present
    if (policyObj.validator) {
      const validation = policyObj.validator(config);
      if (typeof validation === 'boolean' && !validation) {
        throw new Error('Policy config validation failed');
      }
      if (typeof validation === 'object' && !validation.valid) {
        const errorMessages = validation.errors?.join(', ') || 'unknown validation error';
        throw new Error(`Policy config validation failed: ${errorMessages}`);
      }
    }

    return { handler: policyObj.handler, config };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Policy runner factory
// ---------------------------------------------------------------------------

/**
 * Creates a policy runner bound to the given Apick instance.
 *
 * @example
 *   const runPolicies = createPolicyRunner(apick);
 *
 *   const allowed = await runPolicies(
 *     ['isAuthenticated', { name: 'hasRole', config: { role: 'admin' } }],
 *     ctx,
 *   );
 *
 *   if (!allowed) {
 *     ctx.forbidden('Access denied by policy');
 *   }
 */
export function createPolicyRunner(apick: any): PolicyRunner {
  return async function runPolicies(
    policies: PolicyDefinition[],
    ctx: ApickContext,
  ): Promise<boolean> {
    if (!policies || policies.length === 0) {
      return true;
    }

    const policyContext = buildPolicyContext(ctx);

    for (const definition of policies) {
      const resolved = resolvePolicy(apick, definition);

      // If a policy could not be resolved, treat it as a deny for safety
      if (!resolved) {
        return false;
      }

      const { handler, config } = resolved;

      // Execute the policy — it may be sync or async
      const result = await handler(
        policyContext as any,
        config,
        { apick },
      );

      // First false short-circuits the chain
      if (result === false) {
        return false;
      }
    }

    // All policies returned true (or a truthy value)
    return true;
  };
}
