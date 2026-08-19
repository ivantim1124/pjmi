type MiddlewareContext = {
  request: Request;
  next: () => Promise<Response>;
};

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

const applySecurityHeaders = (response: Response, pathname: string) => {
  const headers = new Headers(response.headers);
  headers.set('content-security-policy', contentSecurityPolicy);
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(), payment=(), usb=()');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('strict-transport-security', 'max-age=31536000');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');

  if (pathname.startsWith('/admin') || pathname.startsWith('/api/')) {
    headers.set('cache-control', 'no-store, max-age=0');
    headers.set('pragma', 'no-cache');
    headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const onRequest = async ({ request, next }: MiddlewareContext) => {
  const pathname = new URL(request.url).pathname;
  try {
    return applySecurityHeaders(await next(), pathname);
  } catch (error) {
    console.error('Unhandled Pages Function error', error);
    return applySecurityHeaders(new Response('Internal Server Error', { status: 500 }), pathname);
  }
};
