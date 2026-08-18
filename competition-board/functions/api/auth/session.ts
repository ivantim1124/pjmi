import { isAdmin, json, type PageFunction } from '../../_lib';

export const onRequestGet: PageFunction = async ({ env, request }) => {
  return json({ authenticated: await isAdmin(request, env) });
};
