import type { z } from 'zod';
import { ConfigError, formatPath, type ConfigIssue } from '../config/validate.js';
import { IncompleteFetchError } from '../jellyfin/client.js';
import {
  JellyfinHttpError,
  JellyfinUnreachableError,
  NotConfiguredError,
} from '../jellyfin/http.js';
import { SetupError } from '../jellyfin/setup.js';
import { NotManagedError } from '../sync/collections.js';
import { PreflightError } from '../sync/preflight.js';
import { BusyError } from '../sync/service.js';
import type { ErrorBody, ErrorCode } from '../shared/api.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly issues?: ConfigIssue[],
  ) {
    super(message);
  }

  get body(): ErrorBody {
    return { error: this.message, code: this.code, ...(this.issues && { issues: this.issues }) };
  }
}

export function parseBody<T>(
  schema: z.ZodType<T>,
  body: unknown,
  what: string,
  code: ErrorCode = 'bad-request',
): T {
  const parsed = schema.safeParse(body ?? {});
  if (parsed.success) return parsed.data;
  const issues = parsed.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }));
  const summary = issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join('; ');
  throw new ApiError(400, code, `Invalid ${what}: ${summary}.`, issues);
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof BusyError) return new ApiError(409, 'busy', err.message);
  if (err instanceof ConfigError) return new ApiError(400, 'config', 'Invalid config.', err.issues);
  if (err instanceof PreflightError) return new ApiError(409, 'preflight', err.message);
  if (err instanceof SetupError) return new ApiError(409, 'setup', err.message);
  if (err instanceof NotConfiguredError) return new ApiError(409, 'not-configured', err.message);
  if (err instanceof IncompleteFetchError) return new ApiError(502, 'jellyfin', err.message);
  if (err instanceof NotManagedError) return new ApiError(404, 'not-managed', err.message);
  if (err instanceof JellyfinHttpError) {
    return err.response.status === 404
      ? new ApiError(404, 'not-found', err.message)
      : new ApiError(502, 'jellyfin', err.message);
  }
  if (err instanceof JellyfinUnreachableError) {
    return new ApiError(502, 'jellyfin', `Cannot reach Jellyfin: ${err.message}`);
  }
  const { statusCode, message } = err as { statusCode?: number; message?: string };
  if (statusCode && statusCode < 500) {
    return new ApiError(statusCode, 'bad-request', message ?? 'Bad request.');
  }
  return new ApiError(500, 'internal', message ?? 'Internal error.');
}
