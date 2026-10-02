import snapshot from './network-lists.json';
import { VPN_FEED, TOR_FEED, compileRanges, containsAddress, validRanges, boundedText } from './ip-ranges.mjs';

type Lists = typeof snapshot;
type BackgroundContext = { waitUntil(promise: Promise<unknown>): void };
type CloudflareRequest = Request & { cf?: { country?: string | null } };
const cacheName = 'pjmi-network-guard-v1';

function isLists(value: unknown): value is Lists {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const vpn = record.vpn as Record<string, unknown> | undefined;
  const tor = record.tor as Record<string, unknown> | undefined;
  return record.version === 1 && typeof record.generatedAt === 'string' && !!vpn && !!tor && validRanges(vpn.ranges) && validRanges(tor.ranges);
}

async function refreshLists(cache: Cache, key: Request) {
  const results = await Promise.allSettled([VPN_FEED, TOR_FEED].map(async url => {
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(5000) });
    return compileRanges(await boundedText(response));
  }));
  const success = results.every(result => result.status === 'fulfilled');
  const lists = {
    ...snapshot, generatedAt: new Date().toISOString(),
    vpn: results[0].status === 'fulfilled' ? results[0].value : snapshot.vpn,
    tor: results[1].status === 'fulfilled' ? results[1].value : snapshot.tor,
  };
  if (!success) console.warn(JSON.stringify({ event: 'network_feed_fallback' }));
  await cache.put(key, new Response(JSON.stringify(lists), { headers: {
    'content-type': 'application/json', 'cache-control': `public, max-age=${success ? 21600 : 300}`,
  } }));
}

async function activeLists(request: Request, context?: BackgroundContext): Promise<Lists> {
  // Local tests/development have no Cloudflare Cache API. Use the bundled fallback.
  if (typeof caches === 'undefined' || !context) return snapshot;
  try {
    const cache = await caches.open(cacheName);
    // Never vary this private cache key by client IP or arbitrary query parameters.
    const key = new Request(`${new URL(request.url).origin}/__pjmi_internal_network_list_v1`);
    const cached = await cache.match(key);
    if (cached) {
      const value: unknown = JSON.parse(await boundedText(cached));
      if (isLists(value)) return value;
    }
    context.waitUntil(refreshLists(cache, key).catch(() => {
      console.warn(JSON.stringify({ event: 'network_feed_refresh_failed' }));
    }));
  } catch {
    console.warn(JSON.stringify({ event: 'network_cache_fallback' }));
  }
  return snapshot;
}

export function blockedResponse(request: Request, code = 'VPN_PROXY_BLOCKED'): Response {
  const isApi = new URL(request.url).pathname.startsWith('/api/');
  const country = code === 'COUNTRY_NOT_SUPPORTED';
  const error = country ? '目前不支援您所在的國家／地區。此網站僅開放台灣地區使用。' : '此網站不支援 VPN、代理或 Tor 網路，請關閉後再試。';
  const headers = {
    'cache-control': 'no-store, max-age=0',
    'content-type': isApi ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex, nofollow, noarchive',
    'x-pjmi-network-guard': 'vpn-v1',
  };
  const body = isApi ? JSON.stringify({ code, error }) : `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>存取受限</title></head><body><main><h1>${country ? '目前不支援您所在的國家／地區' : '請關閉 VPN／代理'}</h1><p>${error}</p><p>若未使用上述服務仍被攔截，請向網站管理員回報。</p></main></body></html>`;
  return new Response(request.method === 'HEAD' ? null : body, { status: 403, headers });
}

export async function checkVpn(request: Request, context?: BackgroundContext): Promise<Response | null> {
  // Only trust edge-assigned metadata. Never use X-Forwarded-For, X-Real-IP,
  // client country headers, query parameters, or a client-provided bypass flag.
  if ((request as CloudflareRequest).cf?.country?.toUpperCase() === 'T1') return blockedResponse(request);
  const ip = request.headers.get('cf-connecting-ip');
  if (!ip) {
    if (!(request as CloudflareRequest).cf) return null; // local development only
    return new Response('Client network identity unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
  }
  // A validated refresh replaces the snapshot, so removed/reassigned networks
  // do not remain blocked forever. A cache miss still uses the bundled lists.
  const lists = await activeLists(request, context);
  if (containsAddress(lists.vpn.ranges, ip) || containsAddress(lists.tor.ranges, ip)) return blockedResponse(request);
  return null;
}
