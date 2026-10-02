import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { ipv4Number, compileRanges, containsAddress, validRanges, boundedText } from './ip-ranges.mjs';

async function load(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: 'browser', format: 'esm', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const guard = await load('security/network-guard.ts');
const worker = (await load('network-guard/src/index.ts')).default;
const english = await load('englishword/functions/_middleware.ts');
const competitions = await load('competition-board/functions/_middleware.ts');

function request(path = '/', ip = '203.0.113.40', country = 'TW', headers = {}, host = 'pjmi.dpdns.org') {
  const req = new Request(`https://${host}${path}`, { headers: { 'cf-connecting-ip': ip, ...headers } });
  Object.defineProperty(req, 'cf', { value: { country } });
  return req;
}

test('strict IPv4 and IPv4-mapped IPv6 parser', () => {
  assert.equal(ipv4Number('255.255.255.255'), 4294967295);
  assert.equal(ipv4Number('0.0.0.0'), 0);
  assert.equal(ipv4Number('::ffff:2.26.157.42'), ipv4Number('2.26.157.42'));
  assert.equal(ipv4Number('::ffff:21a:9d2a'), ipv4Number('2.26.157.42'));
  for (const bad of ['001.2.3.4', '256.1.1.1', '1.2.3', '1.2.3.4, 5.6.7.8', '1e1.2.3.4', '2001:db8::1', '::ffff:1:2:3']) assert.equal(ipv4Number(bad), null);
});

test('CIDR merging and binary lookup handle inclusive boundaries', () => {
  const { ranges } = compileRanges('198.51.100.128/25\n198.51.100.0/25\n203.0.113.10\n203.0.113.10', 1);
  assert.equal(ranges.length, 2);
  for (const ip of ['198.51.100.0', '198.51.100.255', '203.0.113.10']) assert.equal(containsAddress(ranges, ip), true);
  for (const ip of ['198.51.99.255', '198.51.101.0', '203.0.113.9', '203.0.113.11']) assert.equal(containsAddress(ranges, ip), false);
  assert.equal(validRanges(ranges), true);
  assert.equal(validRanges([[1, 3], [2, 4]]), false);
});

test('bad or too broad feed never replaces the built-in denylist', () => {
  for (const text of ['<!doctype html>', '0.0.0.0/0', '1.2.3.4/', '1.2.3.4/33', '1.2.3.4/NaN', '']) assert.throws(() => compileRanges(text, 1));
  assert.throws(() => compileRanges('1.2.3.4', 50));
});

test('known VPN blocks HTML, assets, API and IPv4-mapped IPv6', async () => {
  for (const path of ['/', '/_astro/app.js', '/api/quiz/start', '/admin/import']) {
    const response = await guard.checkVpn(request(path, '2.26.157.42'));
    assert.equal(response.status, 403);
    assert.match(response.headers.get('cache-control'), /no-store/);
    if (path.startsWith('/api/')) assert.equal((await response.json()).code, 'VPN_PROXY_BLOCKED');
    else assert.match(await response.text(), /請關閉 VPN／代理/);
  }
  assert.equal((await guard.checkVpn(request('/', '::ffff:2.26.157.42'))).status, 403);
});

test('Tor exit and Cloudflare Tor metadata block even Taiwan/IPv6', async () => {
  assert.equal((await guard.checkVpn(request('/', '171.25.193.25'))).status, 403);
  assert.equal((await guard.checkVpn(request('/', '2001:db8::1', 'T1'))).status, 403);
});

test('normal connections allowed; claimed forwarding headers never bypass guard', async () => {
  assert.equal(await guard.checkVpn(request()), null);
  assert.equal(await guard.checkVpn(request('/', '2001:db8::1')), null);
  assert.equal((await guard.checkVpn(request('/', '2.26.157.42', 'TW', {
    'x-forwarded-for': '203.0.113.40', 'x-real-ip': '203.0.113.40', 'x-pjmi-network-guard': 'allow', 'cf-ipcountry': 'TW',
  }))).status, 403);
  assert.equal(await guard.checkVpn(request('/', '203.0.113.40', 'TW', { 'x-forwarded-for': '2.26.157.42' })), null);
});

test('production missing trusted IP is unavailable, not an allow bypass', async () => {
  const req = request();
  req.headers.delete('cf-connecting-ip');
  assert.equal((await guard.checkVpn(req)).status, 503);
  assert.equal(await guard.checkVpn(new Request('http://localhost/')), null);
});

test('both Pages middleware reject before next() and preserve quota route', async () => {
  for (const middleware of [english, competitions]) {
    const blocked = await middleware.onRequest({ env: { BLOCK_NON_TW_SITE: '1' }, request: request('/api/quiz/start', '2.26.157.42'), waitUntil() {}, next() { throw new Error('Origin must not be called'); } });
    assert.equal(blocked.status, 403);
  }
  const allowed = await english.onRequest({ env: { BLOCK_NON_TW_SITE: '1' }, request: request('/api/quiz/quota'), waitUntil() {}, next: async () => Response.json({ remaining: 20 }) });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).remaining, 20);
});

test('guard Worker limits hosts, rejects overseas, forwards cookies and pins verified IP', async () => {
  const originalFetch = globalThis.fetch;
  try {
    let calls = 0;
    globalThis.fetch = async (req, options) => {
      calls++;
      assert.equal(req.headers.get('x-real-ip'), '203.0.113.40');
      assert.equal(req.headers.get('cookie'), 'quiz_device=signed');
      assert.equal(options.redirect, 'manual');
      return new Response('origin', { headers: { 'set-cookie': 'session=abc; Secure; HttpOnly' } });
    };
    const env = { BLOCK_NON_TW_SITE: '1' };
    const ctx = { waitUntil() {} };
    assert.equal((await worker.fetch(request('/', '203.0.113.40', 'TW', {}, 'example.com'), env, ctx)).status, 404);
    assert.equal((await worker.fetch(request('/', '203.0.113.40', 'US'), env, ctx)).status, 403);
    assert.equal((await worker.fetch(request('/', '2.26.157.42'), env, ctx)).status, 403);
    assert.equal(calls, 0);
    for (const host of ['pjmi.dpdns.org', 'competitions.pjmi.dpdns.org', 'englishword.pjmi.dpdns.org']) {
      const response = await worker.fetch(request('/', '203.0.113.40', 'TW', { cookie: 'quiz_device=signed', 'x-real-ip': '2.26.157.42' }, host), env, ctx);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-pjmi-network-guard'), 'vpn-v1');
      assert.match(response.headers.get('set-cookie'), /session=abc/);
      assert.equal(await response.text(), 'origin');
    }
    assert.equal(calls, 3);
  } finally { globalThis.fetch = originalFetch; }
});

test('HEAD denial has no body', async () => {
  const response = guard.blockedResponse(new Request('https://pjmi.dpdns.org/', { method: 'HEAD' }));
  assert.equal(response.status, 403);
  assert.equal(await response.text(), '');
});

test('prepared Sheets endpoints preserve VPN/country blocks and never accept a public POST', async () => {
  const env = { BLOCK_NON_TW_SITE: '1', GOOGLE_SHEETS_ENABLED: '0' };
  const ctx = { waitUntil() {} };
  for (const host of ['pjmi.dpdns.org', 'competitions.pjmi.dpdns.org']) {
    const response = await worker.fetch(request('/api/integrations/google-sheets', '203.0.113.40', 'TW', {}, host), env, ctx);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).enabled, false);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await worker.fetch(request('/api/stats', '203.0.113.40', 'TW', {}, host), env, ctx)).status, 503);
    assert.equal((await worker.fetch(request('/api/stats', '2.26.157.42', 'TW', {}, host), env, ctx)).status, 403);
    assert.equal((await worker.fetch(request('/api/integrations/google-sheets', '203.0.113.40', 'US', {}, host), env, ctx)).status, 403);
    const post = new Request(`https://${host}/api/integrations/google-sheets`, { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.40' }, body: 'arbitrary' });
    assert.equal((await worker.fetch(post, env, ctx)).status, 405);
  }
});

test('background outage retains snapshot, retries safely, never sends visitor IP to feeds', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const pending = [];
  let cached;
  try {
    globalThis.caches = { open: async () => ({ match: async () => undefined, put: async (_key, response) => { cached = response; } }) };
    globalThis.fetch = async (url, options) => {
      assert.ok(url.startsWith('https://raw.githubusercontent.com/') || url === 'https://check.torproject.org/torbulkexitlist');
      assert.equal(options.headers, undefined);
      throw new Error('Offline');
    };
    const response = await guard.checkVpn(request('/', '2.26.157.42'), { waitUntil(promise) { pending.push(promise); } });
    assert.equal(response.status, 403);
    await Promise.all(pending);
    assert.equal(cached.headers.get('cache-control'), 'public, max-age=300');
    assert.ok((await cached.json()).vpn.entries >= 50);
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('fresh valid lists take effect, including removal of reassigned VPN networks', async () => {
  const originalCaches = globalThis.caches;
  try {
    const lists = { version: 1, generatedAt: new Date().toISOString(), vpn: compileRanges('203.0.113.40', 1), tor: compileRanges('203.0.113.41', 1) };
    globalThis.caches = { open: async () => ({ match: async () => Response.json(lists) }) };
    const ctx = { waitUntil() { throw new Error('Fresh cache must not fetch'); } };
    assert.equal((await guard.checkVpn(request(), ctx)).status, 403);
    assert.equal(await guard.checkVpn(request('/', '2.26.157.42'), ctx), null);
  } finally { globalThis.caches = originalCaches; }
});

test('streaming feed has a hard size limit even without Content-Length', async () => {
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(100)); controller.close(); } });
  await assert.rejects(boundedText(new Response(stream), 50), /Feed too large/);
});

test('successful refresh validates both sources and caches for six hours', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const pending = [];
  let cached;
  try {
    globalThis.caches = { open: async () => ({ match: async () => undefined, put: async (_key, response) => { cached = response; } }) };
    globalThis.fetch = async () => new Response(Array.from({ length: 50 }, (_, index) => `203.0.113.${index}`).join('\n'));
    assert.equal(await guard.checkVpn(request('/', '198.51.100.42'), { waitUntil(promise) { pending.push(promise); } }), null);
    await Promise.all(pending);
    assert.equal(cached.headers.get('cache-control'), 'public, max-age=21600');
    const lists = await cached.json();
    assert.equal(lists.vpn.entries, 50);
    assert.equal(lists.tor.entries, 50);
  } finally { globalThis.fetch = originalFetch; globalThis.caches = originalCaches; }
});

test('origin redirect and POST body pass through without buffering or following', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (req, options) => {
      assert.equal(req.method, 'POST');
      assert.equal(await req.text(), 'upload-body');
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: '/done' } });
    };
    const req = new Request('https://englishword.pjmi.dpdns.org/api/admin/import', { method: 'POST', body: 'upload-body', headers: { 'cf-connecting-ip': '203.0.113.40' } });
    Object.defineProperty(req, 'cf', { value: { country: 'TW' } });
    const response = await worker.fetch(req, { BLOCK_NON_TW_SITE: '1' }, { waitUntil() {} });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/done');
  } finally { globalThis.fetch = originalFetch; }
});
