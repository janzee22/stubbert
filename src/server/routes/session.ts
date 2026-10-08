import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hashPassword, MIN_PASSWORD_LENGTH, readCookie, SESSION_COOKIE } from '../auth.js';
import type { Session } from '../../shared/api.js';
import { ApiError, parseBody } from '../errors.js';
import type { RouteContext } from './context.js';

export const newPasswordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `The password needs at least ${MIN_PASSWORD_LENGTH} characters`);

const firstPasswordBody = z.object({ password: newPasswordSchema });
const loginBody = z.object({ password: z.string() });

export function sessionRoutes(app: FastifyInstance, { auth, data }: RouteContext) {
  app.get('/api/health', async () => ({ ok: true }));

  app.get('/api/session', async (req): Promise<Session> => ({
    authRequired: auth.required,
    authenticated: auth.valid(readCookie(req.headers.cookie, SESSION_COOKIE)),
    needsPassword: auth.needsPassword,
  }));

  app.post('/api/onboarding/password', async (req, reply) => {
    if (!auth.needsPassword) {
      throw new ApiError(403, 'forbidden', 'A password is already set. Log in instead.');
    }
    const { password } = parseBody(firstPasswordBody, req.body, 'password');
    const hash = hashPassword(password);
    await data.saveSettings({ passwordHash: hash });
    auth.setPassword(hash);
    reply.header('Set-Cookie', auth.cookie(auth.startSession()));
    return { authenticated: true };
  });

  app.post('/api/login', async (req, reply) => {
    const wait = auth.retryAfter(req.ip);
    if (wait > 0) {
      reply.header('Retry-After', String(wait));
      throw new ApiError(429, 'rate-limited', `Too many attempts. Try again in ${wait} s.`);
    }
    const { password } = parseBody(loginBody, req.body, 'login');
    const token = auth.login(req.ip, password);
    if (!token) throw new ApiError(401, 'unauthorized', 'Wrong password.');
    reply.header('Set-Cookie', auth.cookie(token));
    return { authenticated: true };
  });

  app.post('/api/logout', async (req, reply) => {
    auth.logout(readCookie(req.headers.cookie, SESSION_COOKIE));
    reply.header('Set-Cookie', auth.clearCookie());
    return { authenticated: false };
  });
}
