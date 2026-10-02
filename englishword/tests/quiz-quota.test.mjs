import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const compiled = await build({
  stdin: { contents: `export * from './functions/_quiz-quota';
    export { onRequestGet } from './functions/api/quiz/quota';
    export { onRequestPost } from './functions/api/quiz/start';`,
    resolveDir: fileURLToPath(new URL('../', import.meta.url)), loader: 'ts' },
  bundle: true, write: false, format: 'esm', platform: 'node',
});
const { admitQuiz, readQuizQuota, quizDay, quizIdentity, onRequestGet, onRequestPost } =
  await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const schema = await readFile(new URL('../migrations/20260930_quiz_quota.sql', import.meta.url), 'utf8');

const makeDatabase = () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  const db = { prepare(sql) {
    let values = [];
    const statement = {
      bind(...bindings) { values = bindings; return statement; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() { return { meta: sqlite.prepare(sql).run(...values) }; },
    };
    return statement;
  } };
  return { db, sqlite, env: { DB: db, ADMIN_SESSION_SECRET: 'only-used-in-local-quota-tests-32-bytes' } };
};
const identity = (ipHash = 'ip-one', deviceHash = 'device-one') => ({ ipHash, deviceHash, valid: true, cookie: '' });
const now = Date.parse('2026-09-30T04:00:00Z');

test('20 admissions succeed; concurrent excess requests fail without charging either identity', async () => {
  const { db, sqlite } = makeDatabase();
  const admissions = await Promise.all(Array.from({ length: 30 }, () => admitQuiz(db, identity(), now)));
  assert.equal(admissions.filter(Boolean).length, 20);
  assert.equal((await readQuizQuota(db, identity(), now)).remaining, 0);
  assert.equal(await admitQuiz(db, identity('ip-one', 'new-device'), now), null);
  assert.equal(await admitQuiz(db, identity('new-ip', 'device-one'), now), null);
  assert.equal((await readQuizQuota(db, identity('new-ip', 'new-device'), now)).used, 0);
  assert.ok(await admitQuiz(db, identity('new-ip', 'new-device'), now));
  sqlite.close();
});

test('device follows an IP change; separate devices still share their IP cap', async () => {
  const { db, sqlite } = makeDatabase();
  for (let index = 0; index < 20; index++) assert.ok(await admitQuiz(db, identity(`ip-${index}`, 'same-device'), now));
  assert.equal(await admitQuiz(db, identity('ip-new', 'same-device'), now), null);
  for (let index = 0; index < 20; index++) assert.ok(await admitQuiz(db, identity('shared-ip', `device-${index}`), now));
  assert.equal(await admitQuiz(db, identity('shared-ip', 'new-browser'), now), null);
  sqlite.close();
});

test('quota resets exactly at Taiwan midnight', async () => {
  const { db, sqlite } = makeDatabase();
  const before = Date.parse('2026-09-30T15:59:59.999Z');
  const after = Date.parse('2026-09-30T16:00:00.000Z');
  assert.deepEqual(quizDay(before), { day: '2026-09-30', resetsAt: '2026-09-30T16:00:00.000Z' });
  assert.equal(quizDay(after).day, '2026-10-01');
  for (let index = 0; index < 20; index++) await admitQuiz(db, identity(), before);
  assert.equal(await admitQuiz(db, identity(), before), null);
  assert.equal((await readQuizQuota(db, identity(), after)).remaining, 20);
  assert.ok(await admitQuiz(db, identity(), after));
  sqlite.close();
});

test('signed device cookie is preserved; forged cookie is replaced; forwarded IP is ignored', async () => {
  const { env, sqlite } = makeDatabase();
  const request = new Request('https://example.test/api/quiz/quota', { headers: { 'cf-connecting-ip': '192.0.2.1' } });
  const first = await quizIdentity(request, env);
  assert.match(first.cookie, /HttpOnly; Secure; SameSite=Strict/);
  const cookie = first.cookie.split(';')[0];
  const repeat = await quizIdentity(new Request(request.url, {
    headers: { 'cf-connecting-ip': '192.0.2.1', cookie, 'x-forwarded-for': '192.0.2.99' },
  }), env);
  assert.equal(repeat.valid, true);
  assert.equal(repeat.ipHash, first.ipHash);
  assert.equal(repeat.deviceHash, first.deviceHash);
  const forged = await quizIdentity(new Request(request.url, {
    headers: { 'cf-connecting-ip': '192.0.2.1', cookie: cookie.slice(0, -1) + '!' },
  }), env);
  assert.equal(forged.valid, false);
  await assert.rejects(() => quizIdentity(new Request(request.url), env));
  sqlite.close();
});

test('API status does not charge; the 21st start is HTTP 429; missing cookie and bad origin fail', async () => {
  const { env, sqlite } = makeDatabase();
  const url = 'https://example.test/api/quiz';
  const statusRequest = new Request(`${url}/quota`, { headers: { 'cf-connecting-ip': '192.0.2.1' } });
  const status = await onRequestGet({ env, request: statusRequest, params: {} });
  assert.equal(status.status, 200);
  assert.equal((await status.json()).quota.remaining, 20);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  const cookie = status.headers.get('set-cookie').split(';')[0];
  const start = (overrides = {}) => onRequestPost({ env, params: {}, request: new Request(`${url}/start`, {
    method: 'POST', headers: { origin: 'https://example.test', 'cf-connecting-ip': '192.0.2.1',
      'content-type': 'application/json', cookie, ...overrides }, body: JSON.stringify({ mode: 'spelling' }),
  }) });
  assert.equal((await start({ origin: 'https://other.test' })).status, 403);
  assert.equal((await start({ cookie: '' })).status, 428);
  for (let index = 1; index <= 20; index++) {
    const response = await start();
    assert.equal(response.status, 201);
    assert.equal((await response.json()).quota.remaining, 20 - index);
  }
  const denied = await start();
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get('retry-after')) > 0);
  assert.equal((await denied.json()).quota.remaining, 0);
  sqlite.close();
});

test('database failure stops admission instead of allowing unlimited tests', async () => {
  const { env, sqlite } = makeDatabase();
  const initial = await quizIdentity(new Request('https://example.test/api/quiz/quota', {
    headers: { 'cf-connecting-ip': '192.0.2.1' },
  }), env);
  sqlite.close();
  const log = console.error;
  console.error = () => {};
  try {
    const response = await onRequestPost({ env, params: {}, request: new Request('https://example.test/api/quiz/start', {
      method: 'POST', headers: { origin: 'https://example.test', 'cf-connecting-ip': '192.0.2.1',
        cookie: initial.cookie.split(';')[0], 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'spelling' }),
    }) });
    assert.equal(response.status, 503);
  } finally { console.error = log; }
});
