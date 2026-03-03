/**
 * @apick/admin — Admin API for managing admin users, roles, permissions,
 * and system settings.
 *
 * Provides:
 *   - Admin authentication (register, login, token renewal)
 *   - Admin user CRUD
 *   - Role management with RBAC
 *   - API token management
 *   - System initialization and settings
 */

export { createAdminService } from './services/admin-user.js';
export type { AdminUser, AdminUserService } from './services/admin-user.js';
export { createAdminRoleService } from './services/admin-role.js';
export type { AdminRole, AdminRoleService } from './services/admin-role.js';
export { createAdminAuthService } from './services/admin-auth.js';
export type { AdminAuthService } from './services/admin-auth.js';
export { createApiTokenService } from './services/api-token.js';
export type { ApiToken, ApiTokenService } from './services/api-token.js';
export { registerAdminApi } from './routes/index.js';
export { createAuditLogService, TRACKED_ACTIONS } from './audit-logs/index.js';
export type { AuditLogEntry, AuditLogService, AuditLogServiceConfig, TrackedAction } from './audit-logs/index.js';
