/**
 * Admin Auth Service.
 *
 * Handles admin authentication: JWT issuance, verification,
 * registration of the first admin, login, and token renewal.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminAuthService {
  /** Issue a JWT for an admin user */
  issue(payload: { id: number; isAdmin?: boolean }): string;
  /** Verify an admin JWT and return the decoded payload */
  verify(token: string): Record<string, any>;
  /** Register the first admin (fails if any admin exists) */
  registerFirstAdmin(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
  }): { token: string; user: any };
  /** Login with email and password */
  login(email: string, password: string): { token: string; user: any };
  /** Renew a token (re-issue from existing valid token) */
  renewToken(token: string): { token: string };
  /** Check if any admin users exist */
  hasAdmin(): boolean;
  /** Generate a password reset token */
  generateResetToken(email: string): string | null;
  /** Reset password using a reset token */
  resetPassword(resetToken: string, newPassword: string): boolean;
}

export interface AdminAuthServiceConfig {
  /** The admin user service */
  userService: any;
  /** The admin role service */
  roleService: any;
  /** JWT secret for admin tokens */
  secret: string;
  /** JWT expiration (default: '7d') */
  expiresIn?: string;
}

// ---------------------------------------------------------------------------
// Minimal JWT helpers (inline to avoid circular deps)
// ---------------------------------------------------------------------------

function base64urlEncode(data: Buffer): string {
  return data.toString('base64url');
}

function base64urlDecode(str: string): Buffer {
  return Buffer.from(str, 'base64url');
}

function parseDuration(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 604800; // default 7d
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 604800;
  }
}

function signJWT(payload: Record<string, any>, secret: string, expiresIn?: string | number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: Record<string, any> = { ...payload, iat: payload.iat ?? now };
  if (expiresIn) fullPayload.exp = now + parseDuration(expiresIn);

  const headerStr = base64urlEncode(Buffer.from(JSON.stringify(header)));
  const payloadStr = base64urlEncode(Buffer.from(JSON.stringify(fullPayload)));
  const signature = createHmac('sha256', secret).update(`${headerStr}.${payloadStr}`).digest();
  return `${headerStr}.${payloadStr}.${base64urlEncode(signature)}`;
}

function verifyJWT(token: string, secret: string): Record<string, any> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid token format');

  const [headerStr, payloadStr, signatureStr] = parts;
  const expectedSig = createHmac('sha256', secret).update(`${headerStr}.${payloadStr}`).digest();
  const actualSig = base64urlDecode(signatureStr);
  if (!expectedSig.equals(actualSig)) throw new Error('Invalid token signature');

  const payload = JSON.parse(base64urlDecode(payloadStr).toString());
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

// In-memory reset token store (in production, use DB)
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

export function createAdminAuthService(config: AdminAuthServiceConfig): AdminAuthService {
  const { userService, roleService, secret } = config;
  const expiresIn = config.expiresIn || '7d';

  return {
    issue(payload) {
      return signJWT({ ...payload, isAdmin: payload.isAdmin ?? true }, secret, expiresIn);
    },

    verify(token) {
      return verifyJWT(token, secret);
    },

    registerFirstAdmin(data) {
      if (userService.count() > 0) {
        throw new Error('Registration is forbidden — an admin already exists');
      }

      // Ensure default roles exist
      roleService.ensureDefaultRoles();
      const superAdminRole = roleService.getSuperAdminRole();

      const user = userService.create({
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email,
        password: data.password,
        isActive: true,
        roles: [superAdminRole.id!],
      });

      const token = this.issue({ id: user.id! });
      return { token, user };
    },

    login(email, password) {
      const userWithPassword = userService.findOneByEmail(email);
      if (!userWithPassword) {
        throw new Error('Invalid credentials');
      }

      if (!userWithPassword.isActive) {
        throw new Error('User account is not active');
      }

      if (!userService.verifyPassword(password, userWithPassword.password)) {
        throw new Error('Invalid credentials');
      }

      // Strip password from user object
      const { password: _, ...user } = userWithPassword;
      const token = this.issue({ id: user.id! });
      return { token, user };
    },

    renewToken(token) {
      const payload = this.verify(token);
      const newToken = this.issue({ id: payload.id });
      return { token: newToken };
    },

    hasAdmin() {
      return userService.count() > 0;
    },

    generateResetToken(email) {
      const user = userService.findOneByEmail(email);
      if (!user) return null;

      const resetToken = randomBytes(32).toString('hex');
      resetTokens.set(resetToken, {
        email,
        expiresAt: Date.now() + 3600000, // 1 hour
      });

      return resetToken;
    },

    resetPassword(resetToken, newPassword) {
      const entry = resetTokens.get(resetToken);
      if (!entry) return false;
      if (entry.expiresAt < Date.now()) {
        resetTokens.delete(resetToken);
        return false;
      }

      const user = userService.findOneByEmail(entry.email);
      if (!user) return false;

      userService.updateById(user.id!, { password: newPassword });
      resetTokens.delete(resetToken);
      return true;
    },
  };
}
