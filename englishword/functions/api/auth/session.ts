import { isAdmin, json, type PageFunction } from '../../_lib';

export const onRequestGet: PageFunction = async ({ env, request }) =>
  json({ authenticated: await isAdmin(request, env) });
