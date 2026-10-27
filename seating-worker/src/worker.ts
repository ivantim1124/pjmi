import { checkVpn } from '../../security/network-guard';
import { onRequestGet as getRoster, onRequestPut as importRoster } from '../functions/api/admin/seating/roster';
import { onRequestPost as printLabels } from '../functions/api/admin/seating/labels';
import { onRequestPost as login } from '../functions/api/auth/login';
import { onRequestPost as logout } from '../functions/api/auth/logout';
import { onRequestGet as getSession } from '../functions/api/auth/session';
import { json, type Env, type PageFunction } from '../functions/_lib';
import { seatingHtml, seatingJavaScript } from './generated-assets';

type WorkerContext = {
  waitUntil: (promise: Promise<unknown>) => void;
};

type WorkerRequest = Request & { cf?: { country?: string | null } };

const routes = new Map<string, Map<string, PageFunction>>([
  ['/api/auth/login', new Map([['POST', login]])],
  ['/api/auth/logout', new Map([['POST', logout]])],
  ['/api/auth/session', new Map([['GET', getSession]])],
  ['/api/admin/seating/roster', new Map([['GET', getRoster], ['PUT', importRoster]])],
  ['/api/admin/seating/labels', new Map([['POST', printLabels]])],
]);

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self'",
  "font-src 'self' https://fonts.gstatic.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data:",
  "media-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' https://fonts.googleapis.com",
  "worker-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

const withSecurityHeaders = (response: Response, request: Request, pathname: string) => {
  const headers = new Headers(response.headers);
  if (!headers.has('content-security-policy'))
    headers.set('content-security-policy', contentSecurityPolicy);
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('x-permitted-cross-domain-policies', 'none');
  headers.set('x-pjmi-network-guard', 'vpn-v1');
  if (
    pathname.startsWith('/api/') ||
    pathname === '/' ||
    pathname === '/index.html' ||
    pathname === '/seating.js'
  ) {
    headers.set('cache-control', 'no-store, no-cache, max-age=0, must-revalidate');
    headers.set('cloudflare-cdn-cache-control', 'no-store');
    headers.set('pragma', 'no-cache');
  }
  if (pathname.startsWith('/api/')) headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  if (pathname === '/' || pathname === '/index.html')
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const errorResponse = (message: string, status: number, headers: Record<string, string> = {}) =>
  json({ error: message }, status, headers);

const notTaiwanResponse = () => new Response(
  `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>目前無法提供服務</title></head><body><main><h1>目前無法提供服務</h1><p>此網站目前只開放台灣地區使用。若你人在台灣仍看到這個畫面，請關閉 VPN 或代理後重新整理。</p></main></body></html>`,
  { status: 403, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow, noarchive' } },
);

const declaredBodyBytes = (request: Request) => {
  const value = request.headers.get('content-length');
  if (value === null) return undefined;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
};

export default {
  async fetch(request: Request, env: Env, context: WorkerContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;
    try {
      const vpnBlocked = await checkVpn(request, context);
      if (vpnBlocked) return withSecurityHeaders(vpnBlocked, request, pathname);

      if (env.BLOCK_NON_TW_SITE === '1') {
        const country = (request as WorkerRequest).cf?.country?.toUpperCase();
        if (country && country !== 'TW')
          return withSecurityHeaders(notTaiwanResponse(), request, pathname);
      }

      if (pathname === '/' || pathname === '/index.html') {
        const response = new Response(seatingHtml, {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
        return withSecurityHeaders(response, request, pathname);
      }

      if (pathname === '/seating.js') {
        const response = new Response(seatingJavaScript, {
          headers: { 'content-type': 'text/javascript; charset=utf-8' },
        });
        return withSecurityHeaders(response, request, pathname);
      }

      if (pathname === '/seating' || pathname.startsWith('/seating/'))
        return withSecurityHeaders(Response.redirect(new URL('/', url), 308), request, pathname);

      if (pathname === '/api' || pathname.startsWith('/api/')) {
        if (request.url.length > 4096)
          return withSecurityHeaders(errorResponse('Request URL is too large', 414), request, pathname);
        const methods = routes.get(pathname);
        if (!methods)
          return withSecurityHeaders(errorResponse('Not found', 404), request, pathname);
        const method = request.method.toUpperCase();
        const handler = methods.get(method);
        if (!handler)
          return withSecurityHeaders(errorResponse('Method not allowed', 405, { allow: [...methods.keys()].join(', ') }), request, pathname);
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          const bodyBytes = declaredBodyBytes(request);
          if (bodyBytes === null)
            return withSecurityHeaders(errorResponse('Invalid content length', 400), request, pathname);
          if (bodyBytes !== undefined && bodyBytes > 64 * 1024)
            return withSecurityHeaders(errorResponse('Request is too large', 413), request, pathname);
        }
        const response = await handler({ env, request });
        return withSecurityHeaders(response, request, pathname);
      }

      const response = await env.ASSETS.fetch(request);
      return withSecurityHeaders(response, request, pathname);
    } catch (error) {
      console.error('Unhandled seating Worker error');
      const response = errorResponse('Internal Server Error', 500);
      return withSecurityHeaders(response, request, pathname);
    }
  },
};
