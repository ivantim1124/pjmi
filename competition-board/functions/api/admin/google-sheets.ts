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
    const result = await callSheet(env, { action: 'health', site: 'competitions' });
    if (!result.ok) throw new Error(result.code || 'Connection failed');
    return json({ ...sheetStatus(env), connected: true, dailyLimit: result.dailyLimit, rowLimit: result.rowLimit });
  } catch (error) {
    return json(sheetAdminError(error), 503);
  }
};
