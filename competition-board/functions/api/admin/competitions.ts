import { json, parseCompetition, readJsonObject, requireAdmin, requireSameOrigin, rowToCompetition, type CompetitionRow, type PageFunction } from '../../_lib';

export const onRequestGet: PageFunction = async ({ env, request }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  try {
    const result = await env.DB.prepare(
      `SELECT id, title, category, event_date, location, status, link, featured, created_at, updated_at
       FROM competitions ORDER BY event_date ASC, created_at DESC`,
    ).all<CompetitionRow>();
    return json(result.results.map(rowToCompetition));
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to read competitions' }, 500);
  }
};

export const onRequestPost: PageFunction = async ({ env, request }) => {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  try {
    const body = await readJsonObject(request);
    const competition = parseCompetition(body);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO competitions (id, title, category, event_date, location, status, link, featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, competition.title, competition.category, competition.eventDate, competition.location, competition.status, competition.link, competition.featured, now, now).run();
    return json({ id }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400);
  }
};
