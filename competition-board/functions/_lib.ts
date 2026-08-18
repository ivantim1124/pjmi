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
  ADMIN_EMAIL?: string;
}

export type CompetitionRow = {
  id: string;
  title: string;
  category: string;
  event_date: string;
  location: string;
  status: 'upcoming' | 'completed' | 'archived';
  description: string;
  link: string;
  featured: number;
  created_at: string;
  updated_at: string;
};

export const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

export const rowToCompetition = (row: CompetitionRow) => ({
  id: row.id,
  title: row.title,
  category: row.category,
  eventDate: row.event_date,
  location: row.location,
  status: row.status,
  description: row.description,
  link: row.link,
  featured: Boolean(row.featured),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const isAdmin = (request: Request, env: Env) => {
  const expected = env.ADMIN_EMAIL?.trim().toLowerCase();
  const actual = request.headers.get('CF-Access-Authenticated-User-Email')?.trim().toLowerCase();
  return Boolean(expected && actual && expected === actual);
};

export const requireAdmin = (request: Request, env: Env) => {
  if (!isAdmin(request, env)) return json({ error: 'Unauthorized' }, 401);
  return null;
};

const allowedStatuses = new Set(['upcoming', 'completed', 'archived']);

export const parseCompetition = (body: Record<string, unknown>) => {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 120) throw new Error('title is required');

  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 30) : '競賽';
  const status = typeof body.status === 'string' && allowedStatuses.has(body.status) ? body.status : 'upcoming';
  const eventDate = typeof body.eventDate === 'string' ? body.eventDate.trim().slice(0, 40) : '';
  const location = typeof body.location === 'string' ? body.location.trim().slice(0, 80) : '';
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : '';
  const link = typeof body.link === 'string' ? body.link.trim().slice(0, 500) : '';
  if (link) {
    const url = new URL(link);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('link must be http or https');
  }

  return { title, category, status, eventDate, location, description, link, featured: body.featured === true ? 1 : 0 };
};
