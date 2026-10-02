import type { SheetsConfig } from '../../integrations/google-sheets/bridge';

export type D1Query = {
  bind: (...values: unknown[]) => D1Query;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

export type D1Database = {
  prepare: (query: string) => D1Query;
  batch?: (statements: D1Query[]) => Promise<unknown>;
};

export type PageContext = {
  env: Env;
  request: Request;
  params: Record<string, string | undefined>;
  waitUntil?: (promise: Promise<unknown>) => void;
};

export type PageFunction = (
  context: PageContext,
) => Response | Promise<Response>;

export interface Env extends SheetsConfig {
  D1_STATS_READ_ONLY?: string;
  DB?: D1Database;
  BLOCK_NON_TW_API?: string;
  BLOCK_NON_TW_SITE?: string;
  ADMIN_EMAIL?: string;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
}

export const json = (
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders,
    },
  });

type EdgeCache = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

const wordCacheVersion = 'v4-r1';

const getEdgeCache = () => {
  const runtime = globalThis as typeof globalThis & {
    caches?: { default?: EdgeCache };
  };
  return runtime.caches?.default;
};

export type WordCacheScope = {
  range: string;
  exam: string;
  source: string;
  query?: string;
};

export const wordCacheKey = (request: Request, scope: WordCacheScope) => {
  const url = new URL(request.url);
  url.pathname = '/api/words';
  const params = new URLSearchParams();
  params.set('edge-cache', wordCacheVersion);
  if (scope.range) params.set('range', scope.range);
  if (scope.exam) params.set('exam', scope.exam);
  if (scope.source) params.set('source', scope.source);
  if (scope.query) params.set('q', normalizeWord(scope.query));
  if (!scope.range && !scope.exam && !scope.source) params.set('scope', 'ranges');
  url.search = params.toString();
  return new Request(url.toString(), { method: 'GET' });
};

export const readWordCache = async (request: Request, scope: WordCacheScope) => {
  const cache = getEdgeCache();
  if (!cache) return undefined;
  return cache.match(wordCacheKey(request, scope));
};

export const writeWordCache = async (
  request: Request,
  scope: WordCacheScope,
  response: Response,
) => {
  const cache = getEdgeCache();
  if (!cache) return;
  await cache.put(wordCacheKey(request, scope), response);
};

const encoder = new TextEncoder();
const sessionCookieName = '__Host-englishword_admin';
const sessionLifetimeSeconds = 8 * 60 * 60;
const loginWindowMs = 15 * 60 * 1000;
const loginBlockMs = 30 * 60 * 1000;
const maxLoginFailures = 5;
const maxJsonBytes = 16 * 1024;

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const normalized = value
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

export const sign = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(signature));
};

export const readCookie = (request: Request, name: string) => {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const match = cookies
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));
  return match?.slice(name.length + 1) ?? '';
};

export const createSessionToken = async (secret: string) => {
  const expiresAt = String(Date.now() + sessionLifetimeSeconds * 1000);
  const nonce = encodeBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `v1.${expiresAt}.${nonce}`;
  return `${payload}.${await sign(payload, secret)}`;
};

export const isValidSession = async (token: string, secret: string) => {
  try {
    const [version, expiresAt, nonce, signature, extra] = token.split('.');
    const expiresAtNumber = Number(expiresAt);
    if (
      version !== 'v1' ||
      !expiresAt ||
      !nonce ||
      !signature ||
      extra ||
      !Number.isFinite(expiresAtNumber)
    ) {
      return false;
    }
    if (
      expiresAtNumber < Date.now() ||
      expiresAtNumber > Date.now() + sessionLifetimeSeconds * 1000 + 60_000
    ) {
      return false;
    }
    const payload = `${version}.${expiresAt}.${nonce}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    return crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signature),
      encoder.encode(payload),
    );
  } catch {
    return false;
  }
};

export const isAdmin = async (request: Request, env: Env) => {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = readCookie(request, sessionCookieName);
  return Boolean(token && (await isValidSession(token, env.ADMIN_SESSION_SECRET)));
};

export const requireAdmin = async (request: Request, env: Env) => {
  if (!(await isAdmin(request, env))) return json({ error: 'Unauthorized' }, 401);
  return null;
};

export const sessionCookie = (token: string) =>
  `${sessionCookieName}=${token}; Path=/; Max-Age=${sessionLifetimeSeconds}; HttpOnly; Secure; SameSite=Strict; Priority=High`;

export const clearSessionCookie = `${sessionCookieName}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict; Priority=High`;

export const requireSameOrigin = (request: Request) => {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    (fetchSite && fetchSite !== 'same-origin')
  ) {
    return json({ error: 'Cross-origin request denied' }, 403);
  }
  return null;
};

export const readJsonObject = async (request: Request) => {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.startsWith('application/json')) {
    throw new Error('JSON content type required');
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxJsonBytes) {
    throw new Error('Request body is too large');
  }
  const raw = await request.text();
  if (encoder.encode(raw).byteLength > maxJsonBytes) {
    throw new Error('Request body is too large');
  }
  const value = JSON.parse(raw) as unknown;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('JSON object required');
  }
  return value as Record<string, unknown>;
};

export const constantTimeEqual = async (left: string, right: string) => {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
};

type LoginAttemptRow = {
  failures: number;
  window_started_at: number;
  blocked_until: number;
};

let loginProtectionSchemaPromise: Promise<void> | undefined;

const ensureLoginProtectionSchema = (db: D1Database) => {
  if (!loginProtectionSchemaPromise) {
    loginProtectionSchemaPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS admin_login_attempts (
            client_hash TEXT PRIMARY KEY,
            failures INTEGER NOT NULL DEFAULT 0,
            window_started_at INTEGER NOT NULL,
            blocked_until INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
          )`,
        )
        .run();
      await db
        .prepare('CREATE INDEX IF NOT EXISTS admin_login_attempts_updated_idx ON admin_login_attempts(updated_at)')
        .run();
    })().catch((error) => {
      loginProtectionSchemaPromise = undefined;
      throw error;
    });
  }
  return loginProtectionSchemaPromise;
};

const loginClientHash = async (request: Request, secret: string) => {
  const address = request.headers.get('cf-connecting-ip')?.trim() || 'unknown-client';
  return sign(`englishword-login:${address}`, secret);
};

const getLoginAttempt = async (db: D1Database, clientHash: string) => {
  const result = await db
    .prepare('SELECT failures, window_started_at, blocked_until FROM admin_login_attempts WHERE client_hash = ?')
    .bind(clientHash)
    .all<LoginAttemptRow>();
  return result.results[0];
};

export const checkLoginRateLimit = async (request: Request, env: Env) => {
  if (!env.DB || !env.ADMIN_SESSION_SECRET) throw new Error('Login protection is not configured');
  await ensureLoginProtectionSchema(env.DB);
  const clientHash = await loginClientHash(request, env.ADMIN_SESSION_SECRET);
  const attempt = await getLoginAttempt(env.DB, clientHash);
  const now = Date.now();
  const retryAfter = attempt && attempt.blocked_until > now
    ? Math.ceil((attempt.blocked_until - now) / 1000)
    : 0;
  return { allowed: retryAfter === 0, clientHash, retryAfter };
};

export const recordLoginFailure = async (env: Env, clientHash: string) => {
  if (!env.DB) throw new Error('Login protection is not configured');
  const now = Date.now();
  await env.DB
    .prepare(
      `INSERT INTO admin_login_attempts (client_hash, failures, window_started_at, blocked_until, updated_at)
       VALUES (?, 1, ?, 0, ?)
       ON CONFLICT(client_hash) DO UPDATE SET
         failures = CASE WHEN ? - window_started_at >= ? THEN 1 ELSE failures + 1 END,
         window_started_at = CASE WHEN ? - window_started_at >= ? THEN ? ELSE window_started_at END,
         blocked_until = CASE WHEN ? - window_started_at < ? AND failures + 1 >= ? THEN ? ELSE 0 END,
         updated_at = ?`,
    )
    .bind(
      clientHash,
      now,
      now,
      now,
      loginWindowMs,
      now,
      loginWindowMs,
      now,
      now,
      loginWindowMs,
      maxLoginFailures,
      now + loginBlockMs,
      now,
    )
    .run();
  const attempt = await getLoginAttempt(env.DB, clientHash);
  const retryAfter = attempt && attempt.blocked_until > now
    ? Math.ceil((attempt.blocked_until - now) / 1000)
    : 0;
  return {
    retryAfter,
    remaining: Math.max(0, maxLoginFailures - (attempt?.failures ?? 1)),
  };
};

export const clearLoginFailures = async (env: Env, clientHash: string) => {
  if (!env.DB) return;
  await env.DB.prepare('DELETE FROM admin_login_attempts WHERE client_hash = ?').bind(clientHash).run();
};

export const normalizeEmail = (value: string) => value.trim().toLocaleLowerCase();

export const normalizeWord = (value: string) =>
  value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
