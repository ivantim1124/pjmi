import {
  checkLoginRateLimit,
  clearLoginFailures,
  constantTimeEqual,
  createSessionToken,
  json,
  readJsonObject,
  recordLoginFailure,
  requireSameOrigin,
  sessionCookie,
  type PageFunction,
} from '../../_lib';

export const onRequestPost: PageFunction = async ({ env, request }) => {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  if (!env.DB || !env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
    return json({ error: 'Admin login protection is not configured' }, 503);
  }

  let rateLimit: Awaited<ReturnType<typeof checkLoginRateLimit>>;
  try {
    rateLimit = await checkLoginRateLimit(request, env);
  } catch (error) {
    console.error(error);
    return json({ error: 'Login protection is unavailable' }, 503);
  }

  if (!rateLimit.allowed) {
    return json({ error: 'Too many login attempts' }, 429, { 'retry-after': String(rateLimit.retryAfter) });
  }

  try {
    const body = await readJsonObject(request);
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password || !await constantTimeEqual(password, env.ADMIN_PASSWORD)) {
      let failure: Awaited<ReturnType<typeof recordLoginFailure>>;
      try {
        failure = await recordLoginFailure(env, rateLimit.clientHash);
      } catch (error) {
        console.error(error);
        return json({ error: 'Login protection is unavailable' }, 503);
      }
      if (failure.retryAfter) {
        return json({ error: 'Too many login attempts' }, 429, { 'retry-after': String(failure.retryAfter) });
      }
      return json({ error: 'Invalid credentials' }, 401, { 'x-ratelimit-remaining': String(failure.remaining) });
    }

    try {
      await clearLoginFailures(env, rateLimit.clientHash);
    } catch (error) {
      console.error(error);
      return json({ error: 'Login protection is unavailable' }, 503);
    }
    const token = await createSessionToken(env.ADMIN_SESSION_SECRET);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) });
  } catch (error) {
    console.error(error);
    return json({ error: 'Invalid request' }, 400);
  }
};
