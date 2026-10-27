import { checkVpn } from '../../security/network-guard';

type MiddlewareContext = {
  env: {
    BLOCK_NON_TW_SITE?: string;
  };
  request: Request;
  next: () => Promise<Response>;
  waitUntil: (promise: Promise<unknown>) => void;
};

type CloudflareRequest = Request & {
  cf?: {
    country?: string | null;
  };
};

const maxApiUrlLength = 4096;
const maxApiBodyBytes = 64 * 1024;

const apiMethods = new Map<string, readonly string[]>([
  ["/api/competitions", ["GET"]],
  ["/api/auth/login", ["POST"]],
  ["/api/auth/logout", ["POST"]],
  ["/api/auth/session", ["GET"]],
  ["/api/admin/competitions", ["GET", "POST"]],
  ["/api/admin/google-sheets", ["GET", "POST"]],
]);

const getAllowedApiMethods = (pathname: string) => {
  const directMethods = apiMethods.get(pathname);
  if (directMethods) return directMethods;
  if (/^\/api\/admin\/competitions\/[^/]+$/.test(pathname))
    return ["PUT", "DELETE"] as const;
  return undefined;
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
  "upgrade-insecure-requests",
].join("; ");

const jsonError = (
  error: string,
  status: number,
  extraHeaders: Record<string, string> = {},
) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: {
      "cache-control": "no-store, max-age=0",
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });

const unsupportedCountryResponse = () =>
  new Response(
    `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>目前無法提供服務</title>
    <style>
      :root { color-scheme: light; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f4f7f5; color: #16231d; }
      main { width: min(36rem, calc(100% - 2rem)); padding: 2rem; border: 1px solid #d7e1dc; border-radius: 1rem; background: #fff; box-shadow: 0 1rem 3rem rgb(22 35 29 / 8%); }
      h1 { margin-top: 0; font-size: 1.5rem; }
      p { line-height: 1.7; }
    </style>
  </head>
  <body><main><h1>目前無法提供服務</h1><p>此網站目前只開放台灣地區使用。若你人在台灣仍看到這個畫面，請關閉 VPN 或代理後重新整理。</p></main></body>
</html>`,
    {
      status: 403,
      headers: {
        "cache-control": "no-store, max-age=0",
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "noindex, nofollow, noarchive",
      },
    },
  );

const requestTooLargeResponse = () =>
  jsonError("Request is too large", 413);

const requestTooLongResponse = () =>
  jsonError("Request URL is too large", 414);

const applySecurityHeaders = (
  response: Response,
  request: Request,
  pathname: string,
) => {
  const headers = new Headers(response.headers);
  headers.set("x-pjmi-network-guard", "vpn-v1");
  headers.set("content-security-policy", contentSecurityPolicy);
  headers.set("cross-origin-opener-policy", "same-origin");
  headers.set("cross-origin-resource-policy", "same-origin");
  headers.set(
    "permissions-policy",
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("x-permitted-cross-domain-policies", "none");

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isApi = pathname === "/api" || pathname.startsWith("/api/");
  const isPublicRead = request.method === "GET" && pathname === "/api/competitions";
  if (isAdminPage || (isApi && !isPublicRead)) {
    headers.set("cache-control", "no-store, max-age=0");
    headers.set("pragma", "no-cache");
    headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  }
  if (isApi) headers.set("x-robots-tag", "noindex, nofollow, noarchive");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const requestCountry = (request: Request) => {
  const country = (request as CloudflareRequest).cf?.country;
  return typeof country === "string" ? country.toUpperCase() : undefined;
};

const declaredBodyBytes = (request: Request) => {
  const value = request.headers.get("content-length");
  if (value === null) return undefined;
  const bytes = Number(value);
  return Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null;
};

export const onRequest = async (context: MiddlewareContext) => {
  const { env, request, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;
  try {
    const vpnBlocked = await checkVpn(request, context);
    if (vpnBlocked) return applySecurityHeaders(vpnBlocked, request, pathname);
    if (env.BLOCK_NON_TW_SITE === "1") {
      const country = requestCountry(request);
      if (country && country !== "TW")
        return applySecurityHeaders(
          unsupportedCountryResponse(),
          request,
          pathname,
        );
    }

    if (pathname === "/api" || pathname.startsWith("/api/")) {
      if (request.url.length > maxApiUrlLength)
        return applySecurityHeaders(requestTooLongResponse(), request, pathname);

      const allowedMethods = getAllowedApiMethods(pathname);
      if (!allowedMethods)
        return applySecurityHeaders(
          jsonError("Not found", 404),
          request,
          pathname,
        );

      const method = request.method.toUpperCase();
      if (!allowedMethods.includes(method))
        return applySecurityHeaders(
          jsonError("Method not allowed", 405, {
            allow: allowedMethods.join(", "),
          }),
          request,
          pathname,
        );

      if (["POST", "PUT", "PATCH"].includes(method)) {
        const bodyBytes = declaredBodyBytes(request);
        if (bodyBytes === null)
          return applySecurityHeaders(
            jsonError("Invalid content length", 400),
            request,
            pathname,
          );
        if (bodyBytes !== undefined && bodyBytes > maxApiBodyBytes)
          return applySecurityHeaders(
            requestTooLargeResponse(),
            request,
            pathname,
          );
      }
    }

    return applySecurityHeaders(await next(), request, pathname);
  } catch (error) {
    console.error("Unhandled Pages Function error", error);
    return applySecurityHeaders(
      new Response("Internal Server Error", { status: 500 }),
      request,
      pathname,
    );
  }
};
