import { clearSessionCookie, json, type PageFunction } from '../../_lib';

export const onRequestPost: PageFunction = async () => {
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie });
};
