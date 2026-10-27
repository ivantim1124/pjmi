import { clearSessionCookie, json, requireSameOrigin, type PageFunction } from '../../_lib';

export const onRequestPost: PageFunction = async ({ request }) => {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie });
};
