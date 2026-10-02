// Server-only. Never import this module from a browser bundle.
export type SheetsConfig = {
  GOOGLE_SHEETS_ENABLED?: string;
  GOOGLE_SHEETS_URL?: string;
  GOOGLE_SHEETS_SECRET?: string;
  GOOGLE_SHEETS_LOG_QUIZZES?: string;
  GOOGLE_SHEETS_LEGACY_VIEWS?: string;
};
export type SheetSite = 'main' | 'competitions' | 'englishword';
type SheetPayload = {
  action: 'health' | 'views.read' | 'views.record' | 'quiz.record';
  site: SheetSite;
  eventId?: string;
  ipHash?: string;
  deviceHash?: string;
  mode?: string;
};
export type SheetResult = {
  ok: boolean;
  code?: string;
  views?: number;
  recorded?: boolean;
  dailyLimit?: number;
  rowLimit?: number;
};
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maxBytes = 16 * 1024;
const cookieName = '__Host-pjmi_sheets_device';
const viewedCookieName = '__Host-pjmi_sheets_viewed';
const viewWindowMs = 30 * 60 * 1000;

export const sheetStatus = (env: SheetsConfig) => ({
  enabled: env.GOOGLE_SHEETS_ENABLED === '1',
  configured: validScriptUrl(env.GOOGLE_SHEETS_URL) && /^[0-9a-f]{64}$/i.test(env.GOOGLE_SHEETS_SECRET || ''),
  quizLogging: env.GOOGLE_SHEETS_LOG_QUIZZES === '1',
});

// Only fixed diagnostics may be returned to authenticated administrators.
// Never reflect an upstream body, exception text, URL or credential.
export const sheetAdminError = (error: unknown) => {
  const messages: Record<string, string> = {
    'Sheets not configured': '設定不完整：請確認後端部署網址與 64 位十六進位 Secret。',
    'Script request denied': 'Google 拒絕簽章或設定：請確認兩邊 Secret 完全一致，以及 Script Properties 已設定。',
    'Unexpected script redirect': 'Google 回應不是允許的公開部署重新導向；請確認使用公開網頁應用程式的 /exec 網址。',
    'Script unavailable': 'Google 部署無法存取；請確認部署仍有效且存取權為所有人。',
    'Unverified script response': 'Google 回應簽章驗證失敗；請確認兩邊 Secret 完全一致及部署版本正確。',
    'Invalid script result': 'Google 回應格式不符；請確認部署的是 PJMI 串接程式。',
    'Script response too large': 'Google 回應超出安全大小限制。',
    'Script timeout': 'Google 連線逾時；請稍後重試，不會自動重送或寫入測試資料。',
    'Script post failed': 'Cloudflare 無法完成對 Google 的連線；請確認部署網址與 Google 服務狀態。',
    'Script redirect failed': 'Cloudflare 無法取得 Google 重新導向後的回應。',
    'Unexpected response redirect': 'Google 回應網址再次重新導向，安全檢查已停止連線；請確認公開部署的執行身分與存取權。',
    'Script response failed': 'Google 回應無法解析或讀取；請確認部署版本。',
    'Script verification failed': 'Google 回應無法通過簽章驗證；請確認兩邊 Secret 與部署版本。',
    UNAVAILABLE: 'Google 已通過簽章，但無法讀取工作表；請確認試算表 ID、執行身分與授權。',
    RUN_SETUP_FIRST: '請先在 Apps Script 執行 setup，再檢查連線。',
    INVALID_HEADER: 'Events 工作表欄位不符，請確認 setup 建立的標題列未被修改。',
    INVALID_LEDGER: 'Events 資料格式不符，串接已拒絕讀取。',
    BUSY: 'Google 工作表目前忙碌，請稍後再試。',
  };
  const key = error instanceof Error ? error.message : '';
  const message = error instanceof Error && error.name === 'AbortError'
    ? 'Google 連線逾時；請稍後重試，不會自動重送或寫入測試資料。'
    : error instanceof SyntaxError ? 'Google 未回傳有效 JSON；請確認公開部署網址與版本。'
    : messages[key] || '串接未完成：請檢查部署網址、Secret、Script Properties 及 setup()。';
  return { error: message };
};

export const validScriptUrl = (value?: string) => {
  try {
    const url = new URL(value || '');
    return url.origin === 'https://script.google.com' && !url.username && !url.password
      && !url.search && !url.hash && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
  } catch { return false; }
};

const keyFor = (secret: string, usage: ('sign' | 'verify')[]) => crypto.subtle.importKey(
  'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage,
);
export const sheetHmac = async (text: string, secret: string) => {
  const signature = await crypto.subtle.sign('HMAC', await keyFor(secret, ['sign']), encoder.encode(text));
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('');
};
const verifyHmac = async (text: string, signature: unknown, secret: string) => {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/.test(signature)) return false;
  const bytes = Uint8Array.from(signature.match(/../g)!, byte => Number.parseInt(byte, 16));
  return crypto.subtle.verify('HMAC', await keyFor(secret, ['verify']), bytes, encoder.encode(text));
};

const readBounded = async (response: Response) => {
  if (!response.body || Number(response.headers.get('content-length')) > maxBytes) throw new Error('Invalid script response');
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });
  let text = '';
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('Script response too large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
};

export const callSheet = async (env: SheetsConfig, payload: SheetPayload): Promise<SheetResult> => {
  // Authenticated diagnostics may read while disabled; event recording remains disabled.
  const status = sheetStatus(env);
  if (!status.configured || (!status.enabled && !['health', 'views.read'].includes(payload.action))) throw new Error('Sheets not configured');
  const secret = env.GOOGLE_SHEETS_SECRET!;
  const requestId = crypto.randomUUID();
  const issuedAt = Date.now();
  const body = JSON.stringify(payload);
  const signature = await sheetHmac(`v1\n${requestId}\n${issuedAt}\n${body}`, secret);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  let stage = 'post';
  try {
    let response = await fetch(env.GOOGLE_SHEETS_URL!, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ v: 1, requestId, issuedAt, payload: body, signature }),
      redirect: 'manual', signal: controller.signal,
    });
    // ContentService sends a one-time response URL. Never forward the signed
    // POST (or credentials) to an arbitrary redirect, including 307/308.
    if (response.status === 302 || response.status === 303) {
      const target = new URL(response.headers.get('location') || '');
      if (target.origin !== 'https://script.googleusercontent.com' || target.pathname !== '/macros/echo'
        || target.username || target.password || target.hash) throw new Error('Unexpected script redirect');
      await response.body?.cancel();
      stage = 'redirect';
      response = await fetch(target.toString(), { method: 'GET', redirect: 'manual', signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new Error('Unexpected response redirect');
      }
    }
    if (!response.ok) throw new Error('Script unavailable');
    stage = 'response';
    const envelope = JSON.parse(await readBounded(response));
    if (envelope?.ok === false && envelope.code === 'REQUEST_DENIED') throw new Error('Script request denied');
    stage = 'verification';
    if (envelope.v !== 1 || envelope.requestId !== requestId || typeof envelope.payload !== 'string'
      || !await verifyHmac(`response-v1\n${requestId}\n${envelope.payload}`, envelope.signature, secret))
      throw new Error('Unverified script response');
    const result = JSON.parse(envelope.payload);
    if (!result || typeof result.ok !== 'boolean'
      || (result.views !== undefined && (!Number.isSafeInteger(result.views) || result.views < 0)))
      throw new Error('Invalid script result');
    return result;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Script timeout');
    const known = ['Unexpected script redirect', 'Unexpected response redirect', 'Script unavailable', 'Script request denied',
      'Unverified script response', 'Invalid script result', 'Script response too large', 'Invalid script response'];
    if (error instanceof SyntaxError || (error instanceof Error && known.includes(error.message))) throw error;
    // Wrap transport/runtime errors with a fixed stage, never an upstream message.
    throw new Error(`Script ${stage} failed`);
  } finally { clearTimeout(timeout); }
};

const cookie = (request: Request, name: string) => request.headers.get('cookie')?.split(';')
  .map(value => value.trim()).find(value => value.startsWith(`${name}=`))?.slice(name.length + 1) || '';
const siteFor = (request: Request): SheetSite => {
  const host = new URL(request.url).hostname;
  if (host === 'pjmi.dpdns.org') return 'main';
  if (host === 'competitions.pjmi.dpdns.org') return 'competitions';
  // Pages preview/deployment domains are still the EnglishWord application.
  return 'englishword';
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export const sheetViews = async (request: Request, env: SheetsConfig, site = siteFor(request)) => {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { allow: 'GET' } });
  if (request.headers.get('sec-fetch-site') === 'cross-site'
    || (request.headers.has('origin') && request.headers.get('origin') !== new URL(request.url).origin))
    return json({ error: 'Cross-origin request denied' }, 403);
  if (!sheetStatus(env).enabled || !sheetStatus(env).configured) return json({ error: '試算表串接尚未啟用或設定不完整。' }, 503);
  const legacyViews = Number(env.GOOGLE_SHEETS_LEGACY_VIEWS || 0);
  if (!Number.isSafeInteger(legacyViews) || legacyViews < 0 || legacyViews > 1_000_000_000)
    return json({ error: '瀏覽統計基準設定不正確。' }, 503);
  const secret = env.GOOGLE_SHEETS_SECRET!;
  const ip = request.headers.get('cf-connecting-ip')?.trim();
  if (!ip || ip.length > 64) return json({ error: '無法驗證連線。' }, 503);
  try {
    const [candidate, tokenSignature, extra] = cookie(request, cookieName).split('.');
    const valid = uuid.test(candidate || '') && !extra && await verifyHmac(`device-v1:${candidate}`, tokenSignature, secret);
    const device = valid ? candidate : crypto.randomUUID();
    const [expires, viewedSignature, viewedExtra] = cookie(request, viewedCookieName).split('.');
    const now = Date.now();
    const recent = valid && !viewedExtra && Number(expires) > now && Number(expires) <= now + viewWindowMs
      && await verifyHmac(`view-v1:${site}:${device}:${expires}`, viewedSignature, secret);
    const cache = (globalThis as typeof globalThis & { caches?: { default?: {
      match: (request: Request) => Promise<Response | undefined>;
      put: (request: Request, response: Response) => Promise<void>;
    } } }).caches?.default;
    const cacheUrl = new URL(request.url);
    cacheUrl.pathname = '/api/stats';
    cacheUrl.search = `sheet-cache=v2&site=${site}&legacy=${legacyViews}`;
    const cacheKey = new Request(cacheUrl.toString());
    if (recent && cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }
    const day = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    const result = await callSheet(env, recent ? { action: 'views.read', site } : {
      action: 'views.record', site, eventId: crypto.randomUUID(),
      ipHash: await sheetHmac(`ip-v1:${site}:${day}:${ip}`, secret),
      deviceHash: await sheetHmac(`visitor-v1:${site}:${day}:${device}`, secret),
    });
    if (!result.ok || result.views === undefined) return json({ error: '瀏覽統計暫時無法更新。' }, 503);
    const views = result.views + legacyViews;
    if (!Number.isSafeInteger(views)) return json({ error: '瀏覽統計數值不正確。' }, 503);
    const response = json({ views, storage: 'google-sheets' });
    if (!valid) response.headers.append('set-cookie', `${cookieName}=${device}.${await sheetHmac(`device-v1:${device}`, secret)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`);
    if (!recent) {
      const until = String(now + viewWindowMs);
      response.headers.append('set-cookie', `${viewedCookieName}=${until}.${await sheetHmac(`view-v1:${site}:${device}:${until}`, secret)}; Path=/; Max-Age=1800; HttpOnly; Secure; SameSite=Strict`);
    }
    if (cache) {
      // Store only a sanitized aggregate, never device/view cookies.
      const aggregate = json({ views, storage: 'google-sheets' });
      aggregate.headers.set('cache-control', 'public, max-age=30');
      await cache.put(cacheKey, aggregate).catch(() => {});
    }
    return response;
  } catch {
    console.error(JSON.stringify({ event: 'sheets_views_unavailable', site }));
    // No D1 fallback when enabled: an outage must not amplify database writes.
    return json({ error: '瀏覽統計暫時無法更新。' }, 503);
  }
};

export const logSheetQuiz = async (env: SheetsConfig, sessionId: string, ipHash: string, deviceHash: string, mode: string) => {
  if (env.GOOGLE_SHEETS_ENABLED !== '1' || env.GOOGLE_SHEETS_LOG_QUIZZES !== '1') return;
  const secret = env.GOOGLE_SHEETS_SECRET || '';
  const day = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const result = await callSheet(env, {
    action: 'quiz.record', site: 'englishword', eventId: sessionId, mode,
    ipHash: await sheetHmac(`quiz-ip-v1:${day}:${ipHash}`, secret),
    deviceHash: await sheetHmac(`quiz-device-v1:${day}:${deviceHash}`, secret),
  });
  if (!result.ok) throw new Error('Quiz telemetry unavailable');
};
