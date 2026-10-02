import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
const bundle = await build({ entryPoints: ['src/scripts/view-counter.ts'], bundle: true, write: false, format: 'esm', platform: 'browser' });
const counter = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('counter uses one same-origin request without sending Google settings or identity', async () => {
  const target = { textContent: '' };
  let calls = 0;
  await counter.loadViewCount(target, async (url, options) => {
    calls++;
    assert.equal(url, '/api/stats');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    return Response.json({ views: 1234 });
  });
  assert.equal(calls, 1);
  assert.equal(target.textContent, '瀏覽次數：1,234');
});

test('outages and invalid counts never display a fake zero or retry', async () => {
  for (const result of [new Response('', { status: 503 }), Response.json({ views: -1 }), Response.json({ views: '10' }), Response.json({ views: 1.5 }), Response.json({ views: '<script>' })]) {
    let calls = 0;
    const target = { textContent: 'loading' };
    await counter.loadViewCount(target, async () => { calls++; return result; });
    assert.equal(calls, 1);
    assert.equal(target.textContent, '瀏覽統計暫時無法取得');
  }
});

test('hidden tabs defer recording until visible; duplicate counters share one fetch', async () => {
  const listeners = new Map();
  const targets = [{ dataset: {}, textContent: '' }, { dataset: {}, textContent: '' }];
  const doc = { visibilityState: 'hidden', querySelectorAll: () => targets,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name) };
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({ views: 7 }); };
  try {
    counter.initViewCounters(doc);
    assert.equal(calls, 0);
    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 1);
    assert.equal(listeners.size, 0);
    assert.deepEqual(targets.map(target => target.textContent), ['瀏覽次數：7', '瀏覽次數：7']);
    counter.initViewCounters(doc);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
