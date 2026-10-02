import { callSheet, sheetAdminError, sheetStatus, type SheetsConfig } from '../../integrations/google-sheets/bridge';

/** Pages performs login, CSRF and payload validation first. Never trust a visitor's auth headers. */
export async function checkNetworkSheets(request: Request, env: SheetsConfig, origin: Response): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== 'competitions.pjmi.dpdns.org' || url.pathname !== '/api/admin/google-sheets'
    || !['GET', 'POST'].includes(request.method) || origin.status !== 200) return origin;
  try {
    const body = await origin.json();
    const networkGuard = sheetStatus(env);
    if (request.method === 'POST') {
      // Only the authenticated Pages health route can return connected=true.
      if (body.connected !== true) throw new Error('Connection failed');
      const result = await callSheet(env, { action: 'health', site: 'competitions' });
      if (!result.ok) throw new Error(result.code || 'Connection failed');
      Object.assign(networkGuard, { connected: true, dailyLimit: result.dailyLimit, rowLimit: result.rowLimit });
    }
    return Response.json({ ...body, networkGuard }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: `共用網路入口：${sheetAdminError(error).error}` }, {
      status: 503, headers: { 'cache-control': 'no-store' },
    });
  }
}
