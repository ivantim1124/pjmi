import { checkVpn } from '../../security/network-guard';

type MiddlewareContext = {
  env: {
    BLOCK_NON_TW_API?: string;
    BLOCK_NON_TW_SITE?: string;
  };
  request: Request;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
};

type RequestWithCf = Request & {
  cf?: {
    country?: string | null;
  };
};

const maxApiUrlLength = 2048;
const maxRequestBodyBytes = 3 * 1024 * 1024;
const publicReadPaths = new Set(['/api/words', '/api/stats']);
const apiMethods: Record<string, readonly string[]> = {
  '/api/words': ['GET'],
  '/api/stats': ['GET'],
  '/api/quiz/quota': ['GET'],
  '/api/quiz/start': ['POST'],
  '/api/auth/login': ['POST'],
  '/api/auth/logout': ['POST'],
  '/api/auth/session': ['GET'],
  '/api/admin/summary': ['GET'],
  '/api/admin/import': ['POST'],
  '/api/admin/google-sheets': ['GET', 'POST'],
};

const normalizePath = (pathname: string) =>
  pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;

const requestTooLargeResponse = () =>
  new Response(JSON.stringify({ error: 'Request URL is too large' }), {
    status: 414,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const requestBodyTooLargeResponse = () =>
  new Response(JSON.stringify({ error: 'Request body is too large' }), {
    status: 413,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const unknownApiResponse = () =>
  new Response(JSON.stringify({ error: 'Not found' }), {
    status: 404,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const methodNotAllowedResponse = (methods: readonly string[]) =>
  new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      allow: methods.join(', '),
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const foreignApiResponse = () =>
  new Response(JSON.stringify({ error: 'API access is limited to Taiwan' }), {
    status: 403,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const foreignSiteResponse = () =>
  new Response(
    `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow, noarchive">
    <title>目前不支援此地區</title>
  </head>
  <body>
    <main>
      <h1>目前不支援您所在的國家／地區</h1>
      <p>EnglishWord 目前僅提供台灣地區使用。</p>
      <p>若你使用 VPN 或代理伺服器，請關閉後重新整理。</p>
    </main>
  </body>
</html>`,
    {
      status: 403,
      headers: {
        'cache-control': 'no-store, max-age=0',
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      },
    },
  );

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

const applySecurityHeaders = (response: Response, request: Request, pathname: string) => {
  const headers = new Headers(response.headers);
  headers.set('x-pjmi-network-guard', 'vpn-v1');
  const normalizedPath = normalizePath(pathname);
  headers.set('content-security-policy', contentSecurityPolicy);
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');

  const isPublicRead = request.method === 'GET' && publicReadPaths.has(normalizedPath);
  if (pathname.startsWith('/admin') || (pathname.startsWith('/api/') && !isPublicRead)) {
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('pragma', 'no-cache');
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  }
  if (pathname.startsWith('/api/') && isPublicRead)
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequest = async (context: MiddlewareContext) => {
  const { env, request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  const normalizedPath = normalizePath(pathname);
  try {
    const vpnBlocked = await checkVpn(request, context);
    if (vpnBlocked) return applySecurityHeaders(vpnBlocked, request, pathname);
    const country = (request as RequestWithCf).cf?.country?.toUpperCase();
    if (env.BLOCK_NON_TW_SITE === '1' && country && country !== 'TW')
      return applySecurityHeaders(foreignSiteResponse(), request, pathname);

    if (pathname.startsWith('/api/')) {
      if (env.BLOCK_NON_TW_API === '1' && country && country !== 'TW')
        return applySecurityHeaders(foreignApiResponse(), request, pathname);

      if (request.url.length > maxApiUrlLength)
        return applySecurityHeaders(requestTooLargeResponse(), request, pathname);

      const methods = apiMethods[normalizedPath];
      if (!methods)
        return applySecurityHeaders(unknownApiResponse(), request, pathname);
      if (!methods.includes(request.method))
        return applySecurityHeaders(methodNotAllowedResponse(methods), request, pathname);

      if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
        const declaredLength = Number(request.headers.get('content-length') ?? 0);
        if (Number.isFinite(declaredLength) && declaredLength > maxRequestBodyBytes)
          return applySecurityHeaders(requestBodyTooLargeResponse(), request, pathname);
      }
    }
    return applySecurityHeaders(await next(), request, pathname);
  } catch (error) {
    console.error('Unhandled Pages Function error', error);
    return applySecurityHeaders(new Response('Internal Server Error', { status: 500 }), request, pathname);
  }
};
