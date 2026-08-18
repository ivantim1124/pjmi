import { json, rowToCompetition, type CompetitionRow, type PageFunction } from '../_lib';

export const onRequestGet: PageFunction = async ({ env, request }) => {
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 50), 1), 100);

  try {
    const result = await env.DB.prepare(
      `SELECT id, title, category, event_date, location, status, link, featured, created_at, updated_at
       FROM competitions
       ORDER BY featured DESC, CASE WHEN status = 'upcoming' THEN 0 ELSE 1 END, event_date ASC, created_at DESC
       LIMIT ?`,
    ).bind(limit).all<CompetitionRow>();
    return json(result.results.map(rowToCompetition));
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to read competitions' }, 500);
  }
};
