type MiddlewareContext = {
  request: Request;
  env: { ADMIN_EMAIL?: string };
  next: () => Response | Promise<Response>;
};

const isAllowedAdmin = (request: Request, env: MiddlewareContext['env']) => {
  const expected = env.ADMIN_EMAIL?.trim().toLowerCase();
  const actual = request.headers.get('CF-Access-Authenticated-User-Email')?.trim().toLowerCase();
  return Boolean(expected && actual && expected === actual);
};

export const onRequest = async ({ request, env, next }: MiddlewareContext) => {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) return next();

  if (!isAllowedAdmin(request, env)) {
    return new Response('管理介面需要 Cloudflare Access 管理者登入。', {
      status: env.ADMIN_EMAIL ? 401 : 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    });
  }

  return next();
};
