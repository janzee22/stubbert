import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { JellyfinClient } from '../../jellyfin/client.js';
import { JellyfinHttp, JellyfinHttpError } from '../../jellyfin/http.js';
import type { JellyfinCheck, Settings } from '../../shared/api.js';
import { hashPassword } from '../auth.js';
import { ApiError, parseBody } from '../errors.js';
import type { RouteContext } from './context.js';
import { newPasswordSchema } from './session.js';

const jellyfinBody = z.object({
  url: z
    .string()
    .trim()
    .regex(/^https?:\/\/[^/\s]+/i, 'an http:// or https:// address')
    .transform((url) => url.replace(/\/+$/, '')),
  apiKey: z.string().trim().min(1).optional(),
});

const passwordBody = z.object({ current: z.string(), password: newPasswordSchema });

export function settingsRoutes(app: FastifyInstance, ctx: RouteContext) {
  const { auth, data, client, media, fromEnv } = ctx;

  const checkJellyfin = async (body: unknown) => {
    const { url, apiKey = (await data.loadSettings()).jellyfinApiKey } = parseBody(
      jellyfinBody,
      body,
      'Jellyfin settings',
    );
    if (!apiKey) throw new ApiError(400, 'bad-request', 'Enter the API key.');
    const probe = new JellyfinClient(new JellyfinHttp(url, apiKey, client.http.client), {
      attempts: 1,
      baseDelayMs: 0,
    });
    let info;
    try {
      info = await probe.publicInfo();
    } catch (err) {
      throw new ApiError(
        502,
        'jellyfin',
        `Cannot reach Jellyfin at ${url}: ${(err as Error).message}`,
      );
    }
    try {
      await probe.plugins();
    } catch (err) {
      if (err instanceof JellyfinHttpError && [401, 403].includes(err.response.status)) {
        throw new ApiError(400, 'jellyfin', 'Jellyfin rejected the API key.');
      }
      throw err;
    }
    const check: JellyfinCheck = {
      ok: true,
      version: info.Version,
      serverName: info.ServerName ?? null,
    };
    return { url, apiKey, check };
  };

  app.get('/api/settings', async (): Promise<Settings> => {
    const saved = await data.loadSettings();
    return {
      jellyfin: {
        url: client.http.baseUrl || null,
        apiKeySet: client.http.configured && (fromEnv.jellyfin || !!saved.jellyfinApiKey),
        fromEnv: fromEnv.jellyfin,
      },
      password: { fromEnv: fromEnv.password, open: auth.open },
    };
  });

  app.post('/api/settings/jellyfin/test', async (req): Promise<JellyfinCheck> => {
    const { check } = await checkJellyfin(req.body);
    return check;
  });

  app.put('/api/settings/jellyfin', async (req): Promise<JellyfinCheck> => {
    if (fromEnv.jellyfin) {
      throw new ApiError(
        409,
        'conflict',
        'JELLYFIN_URL and JELLYFIN_API_KEY are set in the environment; change them there.',
      );
    }
    const { url, apiKey, check } = await checkJellyfin(req.body);
    await data.saveSettings({ jellyfinUrl: url, jellyfinApiKey: apiKey });
    client.configure(url, apiKey);
    media.clear();
    return check;
  });

  app.put('/api/settings/password', async (req, reply) => {
    if (fromEnv.password || auth.open) {
      throw new ApiError(
        409,
        'conflict',
        'The password is set in the environment (UI_PASSWORD or UI_ALLOW_NO_PASSWORD); change it there.',
      );
    }
    const { current, password } = parseBody(passwordBody, req.body, 'password change');
    if (!auth.check(current)) {
      throw new ApiError(400, 'bad-request', 'The current password is wrong.');
    }
    const hash = hashPassword(password);
    await data.saveSettings({ passwordHash: hash });
    auth.setPassword(hash);
    reply.header('Set-Cookie', auth.cookie(auth.startSession()));
    return { changed: true };
  });
}
