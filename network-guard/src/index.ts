import { blockedResponse, checkVpn } from '../../security/network-guard';
import { sheetStatus, sheetViews } from '../../integrations/google-sheets/bridge';
import { checkNetworkSheets } from './sheets-admin';

const hosts = new Set(['pjmi.dpdns.org', 'competitions.pjmi.dpdns.org', 'englishword.pjmi.dpdns.org']);
const secureResponse = (response: Response) => {
  const outgoing = new Response(response.body, response);
  outgoing.headers.set('x-pjmi-network-guard', 'vpn-v1');
  outgoing.headers.set('x-content-type-options', 'nosniff');
  outgoing.headers.set('x-frame-options', 'DENY');
  outgoing.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  return outgoing;
};

export default {
  async fetch(request, env, ctx) {
    if (!hosts.has(new URL(request.url).hostname)) return new Response('Not found', { status: 404 });
    try {
      const blocked = await checkVpn(request, ctx);
      if (blocked) return blocked;
      const country = request.cf?.country;
      if (env.BLOCK_NON_TW_SITE === '1' && typeof country === 'string' && country.toUpperCase() !== 'TW') return blockedResponse(request, 'COUNTRY_NOT_SUPPORTED');
      const url = new URL(request.url);
      if (url.pathname === '/api/integrations/google-sheets' && url.hostname !== 'englishword.pjmi.dpdns.org') {
        if (request.method !== 'GET') return secureResponse(new Response('Method not allowed', { status: 405, headers: { allow: 'GET', 'cache-control': 'no-store' } }));
        // Status only: never reveals the deployment URL, secret or sheet ID.
        return secureResponse(Response.json(sheetStatus(env), { headers: { 'cache-control': 'no-store' } }));
      }
      if (url.pathname === '/api/stats' && url.hostname !== 'englishword.pjmi.dpdns.org')
        return secureResponse(await sheetViews(request, env, url.hostname === 'pjmi.dpdns.org' ? 'main' : 'competitions'));
      // A Worker Route forwards to the existing proxied origin, not to itself.
      // Pin X-Real-IP to the edge-assigned address: same-zone subrequest
      // CF-Connecting-IP depends on this header, not on a visitor's claimed IP.
      const headers = new Headers(request.headers);
      headers.set('x-real-ip', request.headers.get('cf-connecting-ip')!);
      const response = await fetch(new Request(request, { headers }), { redirect: 'manual' });
      return secureResponse(await checkNetworkSheets(request, env, response));
    } catch {
      console.error(JSON.stringify({ event: 'network_guard_failed' }));
      return new Response('Service temporarily unavailable', { status: 503, headers: { 'cache-control': 'no-store' } });
    }
  },
} satisfies ExportedHandler<Env>;
