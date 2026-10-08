import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { DiscordError, isDiscordWebhook } from '../../notify/discord.js';
import { NotifyPreview } from '../../notify/preview.js';
import { RetryError } from '../../notify/service.js';
import { preferencesSchema, templateSchema } from '../../notify/settings.js';
import { templateErrors, validatePreferences } from '../../notify/validate.js';
import { activityView, settingsView, statusView } from '../../notify/views.js';
import type {
  ActivityView,
  NotifyIssue,
  NotifySettingsView,
  NotifyStatusView,
  PreviewResult,
  SampleView,
} from '../../shared/api.js';
import { MESSAGE_KINDS } from '../../shared/notify.js';
import { ApiError, parseBody } from '../errors.js';
import type { RouteContext } from './context.js';

const kindSchema = z.enum(MESSAGE_KINDS);

const settingsBody = z.object({
  preferences: preferencesSchema,
  discordWebhookUrl: z.string().trim().nullable().optional(),
  tmdbApiKey: z.string().trim().nullable().optional(),
});

const previewBody = z.object({
  kind: kindSchema,
  template: templateSchema,
  sampleId: z.string().default('sample'),
});

const idParam = z.string().regex(/^[0-9a-f]{32}$/);

async function upstream<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (err) {
    if (err instanceof DiscordError || err instanceof RetryError) {
      throw new ApiError(502, 'upstream', err.message);
    }
    throw err;
  }
}

export function notificationRoutes(app: FastifyInstance, ctx: RouteContext) {
  const { notify, client, ui } = ctx;
  if (!notify) return;

  const preview = new NotifyPreview(notify, (image) => {
    const file = ui?.get(`/samples/${image}.jpg`);
    return file && { filename: `${image}.jpg`, bytes: file.body, contentType: 'image/jpeg' };
  });
  const view = () => settingsView(notify, client.http.baseUrl || null);

  app.get('/api/notifications/settings', async (): Promise<NotifySettingsView> => view());

  app.put('/api/notifications/settings', async (req): Promise<NotifySettingsView> => {
    const body = parseBody(settingsBody, req.body, 'notification settings');
    const problems = templateErrors(body.preferences);
    if (problems.length) {
      throw new ApiError(400, 'config', 'Fix the template errors first.', problems);
    }
    const current = notify.settings;
    const discord =
      body.discordWebhookUrl === undefined
        ? current.discordWebhookUrl
        : body.discordWebhookUrl || null;
    if (discord && !isDiscordWebhook(discord)) {
      throw new ApiError(
        400,
        'bad-request',
        'That is not a Discord webhook URL. Copy it from the channel settings: Integrations › Webhooks.',
        [{ path: 'discordWebhookUrl', message: 'not a Discord webhook URL' }],
      );
    }
    await notify.updateSettings({
      ...body.preferences,
      webhookToken: current.webhookToken,
      discordWebhookUrl: discord,
      tmdbApiKey: body.tmdbApiKey === undefined ? current.tmdbApiKey : body.tmdbApiKey || null,
    });
    return view();
  });

  app.post('/api/notifications/validate', async (req): Promise<{ issues: NotifyIssue[] }> => ({
    issues: validatePreferences((req.body as { preferences?: unknown } | null)?.preferences),
  }));

  app.post('/api/notifications/token/rotate', async (): Promise<NotifySettingsView> => {
    await notify.rotateToken();
    return view();
  });

  app.get('/api/notifications/status', async (): Promise<NotifyStatusView> =>
    statusView(notify, client.http.configured),
  );

  app.get('/api/notifications/activity', async (): Promise<ActivityView[]> => activityView(notify));

  app.post('/api/notifications/batch/send', async () => ({ sent: await notify.sendNow() }));

  app.post<{ Params: { id: string } }>('/api/notifications/activity/:id/retry', async (req) => {
    await upstream(() => notify.retry(req.params.id));
    return { sent: true };
  });

  app.post('/api/notifications/test', async () => upstream(() => notify.test()));

  app.get<{ Querystring: { kind?: string } }>(
    '/api/notifications/samples',
    async (req): Promise<SampleView[]> =>
      preview.samples(kindSchema.catch('movie').parse(req.query.kind)),
  );

  app.post('/api/notifications/preview', async (req): Promise<PreviewResult> => {
    const {
      imageItemId: _id,
      attachment: _bytes,
      ...result
    } = preview.render(parseBody(previewBody, req.body, 'preview'));
    return result;
  });

  app.post('/api/notifications/preview/send', async (req) => {
    const result = preview.render(parseBody(previewBody, req.body, 'preview'));
    const { embed } = result;
    if (!embed) {
      throw new ApiError(400, 'bad-request', result.error ?? 'Fix the template errors first.');
    }
    await upstream(() => notify.sendPreview(embed, result.imageItemId, result.attachment));
    return { sent: true };
  });

  app.get<{ Params: { id: string }; Querystring: { type?: string } }>(
    '/api/notifications/image/:id',
    async (req, reply) => {
      const id = idParam.safeParse(req.params.id);
      if (!id.success) throw new ApiError(400, 'bad-request', 'Not an item id.');
      const backdrop = req.query.type === 'backdrop';
      const image = await client.image(
        id.data,
        backdrop ? 'Backdrop' : 'Primary',
        backdrop ? 800 : 300,
      );
      if (!image) throw new ApiError(404, 'not-found', 'No image.');
      return reply
        .header('Content-Type', image.contentType || 'image/jpeg')
        .header('Cache-Control', 'private, max-age=3600')
        .send(Buffer.from(image.bytes));
    },
  );
}
