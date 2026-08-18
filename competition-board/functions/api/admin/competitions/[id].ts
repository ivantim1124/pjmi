import { json, parseCompetition, requireAdmin, type PageFunction } from '../../../_lib';

export const onRequestPut: PageFunction = async ({ env, request, params }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  try {
    const body = await request.json() as Record<string, unknown>;
    const competition = parseCompetition(body);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(
      `UPDATE competitions SET title = ?, category = ?, event_date = ?, location = ?, status = ?, link = ?, featured = ?, updated_at = ? WHERE id = ?`,
    ).bind(competition.title, competition.category, competition.eventDate, competition.location, competition.status, competition.link, competition.featured, now, params.id).run();
    if (!result.meta.changes) return json({ error: 'Competition not found' }, 404);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : 'Invalid request' }, 400);
  }
};

export const onRequestDelete: PageFunction = async ({ env, request, params }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  try {
    const result = await env.DB.prepare('DELETE FROM competitions WHERE id = ?').bind(params.id).run();
    if (!result.meta.changes) return json({ error: 'Competition not found' }, 404);
    return json({ ok: true });
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to delete competition' }, 500);
  }
};
