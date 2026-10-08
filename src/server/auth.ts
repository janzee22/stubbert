import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'stubbert_session';
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60 * 1000;
const MAX_TRACKED_CLIENTS = 10_000;

const KEY_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 8;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `scrypt:${salt.toString('base64url')}:${scryptSync(password, salt, KEY_LENGTH).toString('base64url')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  return timingSafeEqual(
    scryptSync(password, Buffer.from(salt, 'base64url'), expected.length),
    expected,
  );
}

export interface AuthOptions {
  secureCookie?: boolean;
  open?: boolean;
  now?: () => number;
}

export class Auth {
  #hash?: string;
  readonly #sessions = new Map<string, number>();
  readonly #failures = new Map<string, number[]>();
  readonly secureCookie: boolean;
  readonly open: boolean;
  private readonly now: () => number;

  constructor(
    passwordHash: string | undefined,
    { secureCookie = false, open = false, now = Date.now }: AuthOptions = {},
  ) {
    this.#hash = passwordHash;
    this.secureCookie = secureCookie;
    this.open = open;
    this.now = now;
  }

  get required(): boolean {
    return !this.open;
  }

  get needsPassword(): boolean {
    return !this.open && !this.#hash;
  }

  setPassword(hash: string) {
    this.#hash = hash;
    this.#sessions.clear();
  }

  check(password: string): boolean {
    return !!this.#hash && verifyPassword(password, this.#hash);
  }

  retryAfter(client: string): number {
    const [oldest, ...rest] = this.#recentFailures(client);
    if (oldest === undefined || rest.length + 1 < MAX_FAILURES) return 0;
    return Math.ceil((oldest + FAILURE_WINDOW_MS - this.now()) / 1000);
  }

  login(client: string, password: string): string | undefined {
    if (!this.check(password)) {
      this.#recordFailure(client);
      return undefined;
    }
    this.#failures.delete(client);
    return this.startSession();
  }

  startSession(): string {
    const token = randomBytes(32).toString('base64url');
    this.#sessions.set(token, this.now() + SESSION_MS);
    return token;
  }

  logout(token: string | undefined) {
    if (token) this.#sessions.delete(token);
  }

  valid(token: string | undefined): boolean {
    if (this.open) return true;
    if (!token || !this.#hash) return false;
    const expires = this.#sessions.get(token);
    if (expires === undefined) return false;
    if (expires <= this.now()) {
      this.#sessions.delete(token);
      return false;
    }
    return true;
  }

  cookie(token: string): string {
    return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${this.secureCookie ? '; Secure' : ''}`;
  }

  clearCookie(): string {
    return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secureCookie ? '; Secure' : ''}`;
  }

  get trackedClients(): number {
    return this.#failures.size;
  }

  #recordFailure(client: string) {
    const failures = [...this.#recentFailures(client), this.now()];
    this.#failures.delete(client);
    for (const known of this.#failures.keys()) {
      if (this.#recentFailures(known).length === 0) this.#failures.delete(known);
    }
    if (this.#failures.size >= MAX_TRACKED_CLIENTS) {
      const oldest = this.#failures.keys().next().value;
      if (oldest !== undefined) this.#failures.delete(oldest);
    }
    this.#failures.set(client, failures);
  }

  #recentFailures(client: string): number[] {
    const since = this.now() - FAILURE_WINDOW_MS;
    return (this.#failures.get(client) ?? []).filter((t) => t > since);
  }
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}
