/**
 * @apick/users-permissions
 *
 * Users & Permissions plugin for APICK CMS.
 * Provides end-user authentication, registration, role-based access control,
 * and Content API permission management.
 */

export { createUserService } from './services/user.js';
export type { UserService, UserServiceConfig, EndUser } from './services/user.js';

export { createRoleService } from './services/role.js';
export type { RoleService, RoleServiceConfig, EndUserRole } from './services/role.js';

export { createUserAuthService } from './services/auth.js';
export type { UserAuthService, UserAuthServiceConfig } from './services/auth.js';

export { registerUsersPermissionsRoutes } from './routes/index.js';
