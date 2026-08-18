import { createSessionToken, json, sessionCookie, type PageFunction } from '../../_lib';

export const onRequestPost: PageFunction = async ({ env, request }) => {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: 'Admin password is not configured' }, 503);
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || password !== env.ADMIN_PASSWORD) return json({ error: 'Invalid password' }, 401);

    const token = await createSessionToken(env.ADMIN_SESSION_SECRET);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) });
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
};
