import {
  clearSessionCookie,
  hasAdminSessionCookie,
  isAdmin,
  json,
  type PageFunction,
} from '../../_lib';

export const onRequestGet: PageFunction = async ({ env, request }) => {
  const authenticated = await isAdmin(request, env);
  const headers = !authenticated && hasAdminSessionCookie(request)
    ? { 'set-cookie': clearSessionCookie }
    : {};
  return json({ authenticated }, 200, headers);
};
