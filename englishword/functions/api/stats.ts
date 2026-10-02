import { json, readCookie, type D1Database, type PageFunction } from '../_lib';
import { sheetViews } from '../../../integrations/google-sheets/bridge';

type StatsRow = { view_count: number };
type EdgeCache = {
  match: (request: Request) => Promise<Response | undefined>;
  put: (request: Request, response: Response) => Promise<void>;
};

const statKey = 'homepage';
const viewCookieName = '__Host-englishword_viewed';
const viewCookieMaxAge = 30 * 60;
const statsSchema = `CREATE TABLE IF NOT EXISTS site_stats (
  stat_key TEXT PRIMARY KEY,
  view_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
)`;

const getEdgeCache = () => {
  const runtime = globalThis as typeof globalThis & {
    caches?: { default?: EdgeCache };
  };
  return runtime.caches?.default;
};

const statsCacheKey = (request: Request) => {
  const url = new URL(request.url);
  url.pathname = '/api/stats';
  url.search = 'edge-cache=v2';
  return new Request(url.toString(), { method: 'GET' });
};

const viewCookie = () =>
  `${viewCookieName}=1; Path=/; Max-Age=${viewCookieMaxAge}; HttpOnly; Secure; SameSite=Strict; Priority=High`;

const readViews = async (db: D1Database, countVisit: boolean) => {
  const now = new Date().toISOString();
  await db.prepare(statsSchema).run();
  await db
    .prepare('INSERT OR IGNORE INTO site_stats (stat_key, view_count, updated_at) VALUES (?, 0, ?)')
    .bind(statKey, now)
    .run();
  if (countVisit) {
    await db
      .prepare('UPDATE site_stats SET view_count = view_count + 1, updated_at = ? WHERE stat_key = ?')
      .bind(now, statKey)
      .run();
  }
  const result = await db
    .prepare('SELECT view_count FROM site_stats WHERE stat_key = ?')
    .bind(statKey)
    .all<StatsRow>();
  return Number(result.results[0]?.view_count || 0);
};

export const onRequestGet: PageFunction = async ({ env, request, waitUntil }) => {
  if (env.GOOGLE_SHEETS_ENABLED === '1') return sheetViews(request, env, 'englishword');
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  // Brief migration window: retain the displayed total while freezing only
  // this counter. No schema, insert or update is performed; quizzes are unaffected.
  if (env.D1_STATS_READ_ONLY === '1') {
    try {
      const rows = await env.DB.prepare('SELECT view_count FROM site_stats WHERE stat_key = ?')
        .bind(statKey).all<StatsRow>();
      return json({ views: Number(rows.results[0]?.view_count || 0), storage: 'd1', recording: false });
    } catch { return json({ error: '瀏覽統計暫時無法取得。' }, 503); }
  }

  const hasViewedRecently = Boolean(readCookie(request, viewCookieName));
  const cache = getEdgeCache();
  if (hasViewedRecently && cache) {
    const cached = await cache.match(statsCacheKey(request));
    if (cached) return cached;
  }

  try {
    const views = await readViews(env.DB, !hasViewedRecently);
    const response = json(
      { views },
      200,
      hasViewedRecently
        ? { 'cache-control': 'public, max-age=15, s-maxage=30, stale-while-revalidate=30' }
        : { 'cache-control': 'private, no-store', 'set-cookie': viewCookie() },
    );

    if (hasViewedRecently && cache) {
      const cacheWrite = cache.put(statsCacheKey(request), response.clone());
      if (waitUntil)
        waitUntil(cacheWrite.catch((error) => console.error('Unable to cache page views', error)));
      else await cacheWrite;
    }
    return response;
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to update page views' }, 500);
  }
};
