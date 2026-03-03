/**
 * Example custom policy — is-owner check.
 *
 * Ensures the authenticated user owns the resource being modified.
 */
export default (ctx: any, config: any, { apick }: any) => {
  const user = ctx.state?.user;
  if (!user) return false;

  // In a real implementation, fetch the entry and compare createdBy
  // For now, allow all authenticated users
  return true;
};
