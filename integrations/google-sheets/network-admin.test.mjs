import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['network-guard/src/sheets-admin.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { checkNetworkSheets } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const bridgeBundle = await build({ entryPoints: ['integrations/google-sheets/bridge.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const { sheetHmac } = await import(`data:text/javascript;base64,${Buffer.from(bridgeBundle.outputFiles[0].text).toString('base64')}`);
const env = { GOOGLE_SHEETS_SECRET: 'a'.repeat(64), GOOGLE_SHEETS_URL: 'https://script.google.com/macros/s/example/exec', GOOGLE_SHEETS_ENABLED: '0' };
const request = (method = 'POST', host = 'competitions.pjmi.dpdns.org', path = '/api/admin/google-sheets') => new Request(`https://${host}${path}`, { method });

test('network health does nothing until existing Pages authentication and validation succeed', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('No Google request expected'); };
  try {
    for (const status of [401, 403, 400, 302, 500]) {
      const response = new Response('', { status });
      assert.equal(await checkNetworkSheets(request(), env, response), response);
    }
    for (const req of [request('POST', 'englishword.pjmi.dpdns.org'), request('POST', 'pjmi.dpdns.org'), request('DELETE'), request('POST', 'competitions.pjmi.dpdns.org', '/api/other')]) {
      const response = Response.json({ connected: true });
      assert.equal(await checkNetworkSheets(req, env, response), response);
    }
    assert.equal((await checkNetworkSheets(request(), env, Response.json({ connected: false }))).status, 503);
  } finally { globalThis.fetch = original; }
});

test('authenticated status adds only non-sensitive network settings and writes nothing', async () => {
  const response = await checkNetworkSheets(request('GET'), env, Response.json({ configured: true, enabled: false }));
  const data = await response.json();
  assert.deepEqual(data.networkGuard, { configured: true, enabled: false, quizLogging: false });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(data).includes(env.GOOGLE_SHEETS_SECRET));
  assert.ok(!JSON.stringify(data).includes(env.GOOGLE_SHEETS_URL));
});

test('authenticated Pages health checks the actual shared Worker secret using signed read-only health', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(url, env.GOOGLE_SHEETS_URL);
    const sent = JSON.parse(options.body);
    assert.deepEqual(JSON.parse(sent.payload), { action: 'health', site: 'competitions' });
    assert.equal(sent.signature, await sheetHmac(`v1\n${sent.requestId}\n${sent.issuedAt}\n${sent.payload}`, env.GOOGLE_SHEETS_SECRET));
    const payload = JSON.stringify({ ok: true, dailyLimit: 1000, rowLimit: 10000 });
    return Response.json({ v: 1, requestId: sent.requestId, payload, signature: await sheetHmac(`response-v1\n${sent.requestId}\n${payload}`, env.GOOGLE_SHEETS_SECRET) });
  };
  try {
    const response = await checkNetworkSheets(request(), env, Response.json({ configured: true, enabled: false, connected: true }));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).networkGuard.connected, true);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('shared bridge failures are sanitized, never falsely report connection success', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error(`secret=${env.GOOGLE_SHEETS_SECRET}`); };
  try {
    const response = await checkNetworkSheets(request(), env, Response.json({ connected: true }));
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.ok(!text.includes(env.GOOGLE_SHEETS_SECRET));
    assert.match(text, /共用網路入口/);
  } finally { globalThis.fetch = original; }
});
