import { json, requireAdmin, requireSameOrigin, readJsonObject, type PageFunction } from '../../_lib';
import { callSheet, sheetStatus, sheetAdminError } from '../../../../integrations/google-sheets/bridge';

export const onRequestGet: PageFunction = async ({ request, env }) =>
  await requireAdmin(request, env) || json(sheetStatus(env));

export const onRequestPost: PageFunction = async ({ request, env }) => {
  const denied = await requireAdmin(request, env) || requireSameOrigin(request);
  if (denied) return denied;
  try {
    const body = await readJsonObject(request);
    if (Object.keys(body).length !== 1 || body.action !== 'check') return json({ error: '只允許檢查連線。' }, 400);
    const result = await callSheet(env, { action: 'health', site: 'englishword' });
    if (!result.ok) throw new Error(result.code || 'Connection failed');
    const current = await callSheet(env, { action: 'views.read', site: 'englishword' });
    if (!current.ok || current.views === undefined) throw new Error(current.code || 'Connection failed');
    const rows = env.DB ? await env.DB.prepare('SELECT view_count FROM site_stats WHERE stat_key = ?')
      .bind('homepage').all<{ view_count: number }>() : null;
    const legacyViews = Number(rows?.results[0]?.view_count || 0);
    const suggestedOffset = env.GOOGLE_SHEETS_ENABLED === '1'
      ? Number(env.GOOGLE_SHEETS_LEGACY_VIEWS || 0) : Math.max(0, legacyViews - current.views);
    if (!Number.isSafeInteger(suggestedOffset) || suggestedOffset < 0 || suggestedOffset > 1_000_000_000)
      throw new Error('Invalid legacy baseline');
    return json({ ...sheetStatus(env), connected: true, dailyLimit: result.dailyLimit, rowLimit: result.rowLimit,
      legacyViews, googleViews: current.views, suggestedOffset });
  } catch (error) {
    return json(sheetAdminError(error), 503);
  }
};
