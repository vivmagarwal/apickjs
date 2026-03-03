/**
 * End-User Auth Service.
 *
 * Handles end-user authentication: JWT issuance, login, registration,
 * password reset, email confirmation, and token refresh.
 */

import { createHmac, randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserAuthService {
  /** Issue a JWT for an end-user */
  issue(payload: { id: number }): string;
  /** Verify an end-user JWT and return decoded payload */
  verify(token: string): Record<string, any>;
  /** Register a new end-user */
  register(data: {
    username: string;
    email: string;
    password: string;
  }): { jwt: string; user: any };
  /** Login with email and password */
  login(email: string, password: string): { jwt: string; user: any };
  /** Generate a password reset token */
  forgotPassword(email: string): string | null;
  /** Reset password using a reset token */
  resetPassword(code: string, password: string, passwordConfirmation: string): { jwt: string; user: any } | null;
  /** Change password (authenticated) */
  changePassword(userId: number, currentPassword: string, newPassword: string): boolean;
  /** Generate an email confirmation token */
  generateConfirmationToken(email: string): string | null;
  /** Confirm email */
  confirmEmail(token: string): { jwt: string; user: any } | null;
}

export interface UserAuthServiceConfig {
  userService: any;
  roleService: any;
  secret: string;
  expiresIn?: string;
}

// ---------------------------------------------------------------------------
// Minimal JWT helpers
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
  if (!match) return 2592000; // default 30d
  const num = parseInt(match[1], 10);
  switch (match[2]) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 3600;
    case 'd': return num * 86400;
    default: return 2592000;
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
// In-memory token stores
// ---------------------------------------------------------------------------

const resetTokens = new Map<string, { email: string; expiresAt: number }>();
const confirmationTokens = new Map<string, { email: string; expiresAt: number }>();

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------

export function createUserAuthService(config: UserAuthServiceConfig): UserAuthService {
  const { userService, roleService, secret } = config;
  const expiresIn = config.expiresIn || '30d';

  return {
    issue(payload) {
      return signJWT(payload, secret, expiresIn);
    },

    verify(token) {
      return verifyJWT(token, secret);
    },

    register(data) {
      // Check for existing user
      const existingEmail = userService.findOneByEmail(data.email);
      if (existingEmail) throw new Error('Email already taken');

      const existingUsername = userService.findOneByUsername(data.username);
      if (existingUsername) throw new Error('Username already taken');

      // Assign default authenticated role
      const authRole = roleService.getAuthenticatedRole();

      const user = userService.create({
        username: data.username,
        email: data.email,
        password: data.password,
        confirmed: true, // Auto-confirm for now
        roleId: authRole.id!,
        provider: 'local',
      });

      const jwt = this.issue({ id: user.id! });
      return { jwt, user };
    },

    login(email, password) {
      const userWithPassword = userService.findOneByEmail(email);
      if (!userWithPassword) throw new Error('Invalid identifier or password');

      if (userWithPassword.blocked) throw new Error('Your account has been blocked');
      if (!userWithPassword.confirmed) throw new Error('Your account email is not confirmed');

      if (!userService.verifyPassword(password, userWithPassword.password)) {
        throw new Error('Invalid identifier or password');
      }

      // Strip password from user
      const { password: _, ...user } = userWithPassword;
      const jwt = this.issue({ id: user.id! });
      return { jwt, user };
    },

    forgotPassword(email) {
      const user = userService.findOneByEmail(email);
      if (!user) return null;

      const token = randomBytes(32).toString('hex');
      resetTokens.set(token, {
        email,
        expiresAt: Date.now() + 3600000, // 1 hour
      });

      return token;
    },

    resetPassword(code, password, passwordConfirmation) {
      if (password !== passwordConfirmation) {
        throw new Error('Passwords do not match');
      }

      const entry = resetTokens.get(code);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        resetTokens.delete(code);
        return null;
      }

      const user = userService.findOneByEmail(entry.email);
      if (!user) return null;

      userService.updateById(user.id!, { password });
      resetTokens.delete(code);

      const jwt = this.issue({ id: user.id! });
      return { jwt, user };
    },

    changePassword(userId, currentPassword, newPassword) {
      const user = userService.findOne(userId);
      if (!user) return false;

      // Need to get password hash
      const userWithPassword = userService.findOneByEmail(user.email);
      if (!userWithPassword?.password) return false;

      if (!userService.verifyPassword(currentPassword, userWithPassword.password)) {
        throw new Error('Current password is incorrect');
      }

      userService.updateById(userId, { password: newPassword });
      return true;
    },

    generateConfirmationToken(email) {
      const user = userService.findOneByEmail(email);
      if (!user) return null;
      if (user.confirmed) return null;

      const token = randomBytes(32).toString('hex');
      confirmationTokens.set(token, {
        email,
        expiresAt: Date.now() + 86400000, // 24 hours
      });

      return token;
    },

    confirmEmail(token) {
      const entry = confirmationTokens.get(token);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        confirmationTokens.delete(token);
        return null;
      }

      const user = userService.findOneByEmail(entry.email);
      if (!user) return null;

      userService.updateById(user.id!, { confirmed: true });
      confirmationTokens.delete(token);

      const updated = userService.findOne(user.id!);
      const jwt = this.issue({ id: updated!.id! });
      return { jwt, user: updated };
    },
  };
}
