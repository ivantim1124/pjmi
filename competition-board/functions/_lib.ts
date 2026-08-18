export type D1Query = {
  bind: (...values: unknown[]) => D1Query;
  all: <T>() => Promise<{ results: T[] }>;
  run: () => Promise<{ meta: { changes: number } }>;
};

export type D1Database = {
  prepare: (query: string) => D1Query;
};

export type PageContext = {
  env: Env;
  request: Request;
  params: Record<string, string | undefined>;
};

export type PageFunction = (context: PageContext) => Response | Promise<Response>;

export interface Env {
  DB: D1Database;
  ADMIN_PASSWORD?: string;
  ADMIN_SESSION_SECRET?: string;
}

export type CompetitionRow = {
  id: string;
  title: string;
  category: string;
  event_date: string;
  location: string;
  status: 'upcoming' | 'completed' | 'archived';
  link: string;
  featured: number;
  created_at: string;
  updated_at: string;
};

export const json = (data: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  },
});

export const rowToCompetition = (row: CompetitionRow) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  eventDate: row.event_date,
  location: row.location,
  status: row.status,
  link: row.link,
  featured: Boolean(row.featured),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const encoder = new TextEncoder();
const sessionCookieName = 'pjmi_admin_session';

const encodeBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const sign = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return encodeBase64Url(new Uint8Array(signature));
};

const readCookie = (request: Request, name: string) => {
  const cookies = request.headers.get('cookie')?.split(';') ?? [];
  const match = cookies.map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return match?.slice(name.length + 1) ?? '';
};

export const createSessionToken = async (secret: string) => {
  const expiresAt = String(Date.now() + 24 * 60 * 60 * 1000);
  return `${expiresAt}.${await sign(expiresAt, secret)}`;
};

export const isValidSession = async (token: string, secret: string) => {
  try {
    const [expiresAt, signature] = token.split('.');
    if (!expiresAt || !signature || !Number.isFinite(Number(expiresAt)) || Number(expiresAt) < Date.now()) return false;
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, decodeBase64Url(signature), encoder.encode(expiresAt));
  } catch {
    return false;
  }
};

export const isAdmin = async (request: Request, env: Env) => {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = readCookie(request, sessionCookieName);
  return Boolean(token && await isValidSession(token, env.ADMIN_SESSION_SECRET));
};

export const requireAdmin = async (request: Request, env: Env) => {
  if (!await isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  return null;
};

export const sessionCookie = (token: string) => `${sessionCookieName}=${token}; Path=/; Max-Age=86400; HttpOnly; Secure; SameSite=Lax`;
export const clearSessionCookie = `${sessionCookieName}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;

const allowedStatuses = new Set(['upcoming', 'completed', 'archived']);

export const parseCompetition = (body: Record<string, unknown>) => {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 120) throw new Error('title is required');

  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 30) : '競賽';
  const status = typeof body.status === 'string' && allowedStatuses.has(body.status) ? body.status : 'upcoming';
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim().slice(0, 500) : '';
  const location = typeof body.location === 'string' ? body.location.trim().slice(0, 80) : '';
  const link = typeof body.link === 'string' ? body.link.trim().slice(0, 500) : '';
  if (link) {
    const url = new URL(link);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('link must be http or https');
  }

  return { title, category, status, eventDate, location, link, featured: body.featured === true ? 1 : 0 };
};
