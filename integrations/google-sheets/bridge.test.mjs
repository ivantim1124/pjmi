import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { test } from 'node:test';
import { build } from 'esbuild';

const compiled = await build({ stdin: {
  contents: `export * from './integrations/google-sheets/bridge';
    export { onRequestGet as stats } from './englishword/functions/api/stats';
    export { onRequestGet as adminStatus, onRequestPost as adminCheck } from './englishword/functions/api/admin/google-sheets';
    export { createSessionToken } from './englishword/functions/_lib';
    export { onRequestPost as startQuiz } from './englishword/functions/api/quiz/start';
    export { quizIdentity } from './englishword/functions/_quiz-quota';`,
  resolveDir: fileURLToPath(new URL('../../', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'esm', platform: 'node' });
const bridge = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`);
const gs = await readFile(new URL('./Code.gs', import.meta.url), 'utf8');
const quotaSchema = await readFile(new URL('../../englishword/migrations/20260930_quiz_quota.sql', import.meta.url), 'utf8');
const secret = 'a'.repeat(64); // test fixture, never a production credential
const env = { GOOGLE_SHEETS_ENABLED: '1', GOOGLE_SHEETS_URL: 'https://script.google.com/macros/s/test-deployment/exec', GOOGLE_SHEETS_SECRET: secret };

function script(properties = {}) {
  const props = { SPREADSHEET_ID: 'test_spreadsheet_id_12345', BRIDGE_SECRET: secret, ...properties };
  const rows = [];
  let sheetReads = 0;
  let busy = false;
  let held = false;
  const sheet = {
    getLastRow: () => rows.length,
    getMaxRows: () => 1001,
    insertRowsAfter() {}, setFrozenRows() {}, setColumnWidths() {}, setColumnWidth() {},
    getRange(start, col, count, width) {
      const range = {
        getValues: () => Array.from({ length: count }, (_, index) => Array.from({ length: width }, (_, offset) => rows[start - 1 + index]?.[col - 1 + offset] ?? '')),
        getFormulas: () => Array.from({ length: count }, () => Array(width).fill('')),
        setValues(values) { values.forEach((row, index) => { rows[start - 1 + index] = [...row]; }); return range; },
        setFontWeight() { return range; }, setBackground() { return range; },
      };
      return range;
    },
  };
  let created = false;
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperties: () => props }) },
    Utilities: {
      Charset: { UTF_8: 'UTF_8' },
      computeHmacSha256Signature: (text, key) => [...createHmac('sha256', key).update(text).digest()],
      formatDate: (date) => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10),
    },
    SpreadsheetApp: {
      openById: () => { sheetReads++; return { getSheetByName: () => created ? sheet : null, insertSheet: () => { created = true; return sheet; } }; },
      flush() {},
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: text => ({ text, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => { if (busy || held) return false; held = true; return true; },
      waitLock: () => { if (busy || held) throw Error('busy'); held = true; }, hasLock: () => held, releaseLock: () => { held = false; } }) },
  });
  vm.runInContext(gs, context);
  return { context, rows, props, sheet, setup: () => context.setup(), sheetReads: () => sheetReads, setBusy: value => { busy = value; } };
}
async function envelope(payload, changes = {}) {
  const requestId = randomUUID();
  const issuedAt = Date.now();
  const body = JSON.stringify(payload);
  return { v: 1, requestId, issuedAt, payload: body,
    signature: await bridge.sheetHmac(`v1\n${requestId}\n${issuedAt}\n${body}`, secret), ...changes };
}
function post(script, body) {
  const contents = JSON.stringify(body);
  const response = JSON.parse(script.context.doPost({ contentLength: contents.length, postData: { contents } }).text);
  return response.payload ? JSON.parse(response.payload) : response;
}
const event = (action = 'views.record', overrides = {}) => ({ action, site: 'englishword', eventId: randomUUID(),
  ipHash: '1'.repeat(64), deviceHash: '2'.repeat(64), ...(action === 'quiz.record' ? { mode: 'spelling' } : {}), ...overrides });
async function withGoogle(script, callback, wrapper) {
  const original = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const response = new Response(script.context.doPost({ contentLength: options.body.length,
      postData: { contents: options.body } }).text, { headers: { 'content-type': 'application/json' } });
    return wrapper ? wrapper(response, requests) : response;
  };
  try { return await callback(requests); } finally { globalThis.fetch = original; }
}

test('disabled by default; URL restrictions reject non-Google URLs, /dev, query strings and credentials', async () => {
  assert.equal(bridge.sheetStatus({}).enabled, false);
  for (const url of ['https://attacker.test/exec', 'http://script.google.com/macros/s/x/exec',
    'https://script.google.com/macros/s/x/dev', 'https://script.google.com/macros/s/x/exec?secret=x',
    'https://u:p@script.google.com/macros/s/x/exec']) assert.equal(bridge.validScriptUrl(url), false);
  assert.equal(bridge.validScriptUrl(env.GOOGLE_SHEETS_URL), true);
  await assert.rejects(() => bridge.callSheet({ ...env, GOOGLE_SHEETS_ENABLED: '0' }, event()));
});

test('admin diagnostics use only fixed messages and never disclose arbitrary error details', () => {
  assert.match(bridge.sheetAdminError(new Error('Script request denied')).error, /Secret/);
  assert.match(bridge.sheetAdminError(new Error('RUN_SETUP_FIRST')).error, /setup/);
  const privateError = `fetch failed ${env.GOOGLE_SHEETS_URL} ${secret}`;
  const output = JSON.stringify(bridge.sheetAdminError(new Error(privateError)));
  assert.ok(!output.includes(env.GOOGLE_SHEETS_URL) && !output.includes(secret));
  assert.deepEqual(bridge.sheetAdminError(privateError), bridge.sheetAdminError(null));
});

test('setup is non-destructive and idempotent; signed health check writes no events', async () => {
  const s = script(); s.setup();
  const first = post(s, await envelope(event()));
  assert.equal(first.recorded, true);
  s.setup();
  assert.equal(s.rows.length, 2);
  await withGoogle(s, async () => {
    const result = await bridge.callSheet({ ...env, GOOGLE_SHEETS_ENABLED: '0' }, { action: 'health', site: 'englishword' });
    assert.equal(result.ok, true); assert.equal(result.dailyLimit, 1000);
  });
  assert.equal(s.rows.length, 2);
});

test('GET, invalid signature, stale/future timestamp and invalid payload cannot write or read Sheets', async () => {
  const s = script(); s.setup();
  const before = s.sheetReads();
  assert.equal(JSON.parse(s.context.doGet().text).code, 'SIGNED_POST_REQUIRED');
  for (const changes of [{ signature: '0'.repeat(64) }, { issuedAt: 1 }, { issuedAt: Date.now() + 600000 }, { v: 2 }])
    assert.equal(post(s, await envelope(event(), changes)).ok, false);
  assert.equal(post(s, await envelope({ action: 'append', site: 'englishword', values: ['=IMPORTXML("evil")'] })).ok, false);
  assert.equal(s.sheetReads(), before);
  assert.equal(s.rows.length, 1);
});

test('replayed event is idempotent; altered event data, formulas, raw text and extra fields are refused', async () => {
  const s = script(); s.setup(); const payload = event();
  const body = await envelope(payload);
  assert.equal(post(s, body).recorded, true);
  assert.equal(post(s, body).recorded, false);
  assert.equal(post(s, await envelope({ ...payload, ipHash: '3'.repeat(64) })).code, 'EVENT_ID_CONFLICT');
  for (const change of [{ word: 'hello' }, { deviceHash: '=SUM(1,1)' }, { site: '=IMPORTXML("x")' }, { mode: 'script' }])
    assert.equal(post(s, await envelope(event('views.record', change))).ok, false);
  assert.equal(s.rows.length, 2);
});

test('clear-cookie new devices and IP changes cannot bypass the view cooldown; read never appends', async () => {
  const s = script(); s.setup();
  assert.equal(post(s, await envelope(event())).recorded, true);
  assert.equal(post(s, await envelope(event('views.record', { deviceHash: '3'.repeat(64) }))).recorded, false);
  assert.equal(post(s, await envelope(event('views.record', { ipHash: '3'.repeat(64) }))).recorded, false);
  for (let index = 0; index < 3; index++) assert.equal(post(s, await envelope({ action: 'views.read', site: 'englishword' })).views, 1);
  assert.equal(s.rows.length, 2);
});

test('global daily and total row caps cover all sites; read/health work at cap; busy lock rejects', async () => {
  const s = script({ MAX_EVENTS_PER_DAY: '1' }); s.setup();
  assert.equal(post(s, await envelope(event())).recorded, true);
  assert.equal(post(s, await envelope(event('views.record', { site: 'main', ipHash: '3'.repeat(64) }))).code, 'DAILY_WRITE_LIMIT');
  s.props.MAX_EVENTS_PER_DAY = '1000'; s.props.MAX_TOTAL_EVENTS = '1';
  assert.equal(post(s, await envelope(event('views.record', { site: 'competitions' }))).code, 'ROW_LIMIT');
  assert.equal(post(s, await envelope({ action: 'health', site: 'main' })).ok, true);
  s.setBusy(true);
  assert.equal(post(s, await envelope({ action: 'views.read', site: 'englishword' })).code, 'BUSY');
  assert.equal(s.rows.length, 2);
});

test('Google quiz telemetry independently caps both IP and device at 20', async () => {
  const s = script(); s.setup();
  for (let index = 0; index < 20; index++) assert.equal(post(s, await envelope(event('quiz.record'))).recorded, true);
  assert.equal(post(s, await envelope(event('quiz.record', { deviceHash: '3'.repeat(64) }))).recorded, false);
  assert.equal(post(s, await envelope(event('quiz.record', { ipHash: '3'.repeat(64) }))).recorded, false);
  assert.equal(s.rows.length, 21);
});

test('Google daily limit resets at Taiwan midnight; per-site baselines preserve imported totals', async () => {
  const s = script({ MAX_EVENTS_PER_DAY: '1', BASELINE_ENGLISHWORD_VIEWS: '123' }); s.setup();
  const config = s.context.pjmiConfig_();
  const first = s.context.pjmiOperate_(event(), config, Date.parse('2026-09-30T15:59:59Z'));
  assert.equal(first.views, 124);
  const next = s.context.pjmiOperate_(event('views.record', { ipHash: '4'.repeat(64), deviceHash: '5'.repeat(64) }), config, Date.parse('2026-09-30T16:00:00Z'));
  assert.equal(next.views, 125);
  assert.equal(s.rows[1][1], '2026-09-30'); assert.equal(s.rows[2][1], '2026-10-01');
});

test('tampered response and request IDs are rejected; no unverified count reaches caller', async () => {
  const s = script(); s.setup();
  await withGoogle(s, async () => assert.rejects(() => bridge.callSheet(env, { action: 'views.read', site: 'englishword' })), async response => {
    const value = await response.json(); value.payload = JSON.stringify({ ok: true, views: 999 }); return Response.json(value);
  });
  await withGoogle(s, async () => assert.rejects(() => bridge.callSheet(env, { action: 'health', site: 'englishword' })), async response => {
    const value = await response.json(); value.requestId = randomUUID(); return Response.json(value);
  });
});

test('only Google response redirect is allowed; redirect uses GET without body or secret', async () => {
  const s = script(); s.setup(); const original = globalThis.fetch;
  try {
    let calls = 0, output;
    globalThis.fetch = async (url, options) => {
      calls++;
      if (calls === 1) {
        output = s.context.doPost({ contentLength: options.body.length, postData: { contents: options.body } }).text;
        return new Response(null, { status: 302, headers: { location: 'https://script.googleusercontent.com/macros/echo?user_content_key=test' } });
      }
      assert.equal(String(url), 'https://script.googleusercontent.com/macros/echo?user_content_key=test');
      assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); assert.equal(options.headers, undefined);
      assert.equal(options.redirect, 'manual');
      return new Response(output);
    };
    assert.equal((await bridge.callSheet(env, { action: 'health', site: 'main' })).ok, true);
    for (const [status, location] of [[302, 'https://evil.test/echo'], [307, 'https://script.googleusercontent.com/macros/echo']]) {
      globalThis.fetch = async () => new Response(null, { status, headers: { location } });
      await assert.rejects(() => bridge.callSheet(env, { action: 'health', site: 'main' }));
    }
  } finally { globalThis.fetch = original; }
});

test('a second redirect is refused without fetching its destination or exposing its URL', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return new Response(null, { status: 302, headers: { location: calls === 1
        ? 'https://script.googleusercontent.com/macros/echo?user_content_key=test'
        : 'https://accounts.google.com/private-token' } });
    };
    await assert.rejects(() => bridge.callSheet(env, { action: 'health', site: 'main' }), /Unexpected response redirect/);
    assert.equal(calls, 2);
    assert.ok(!bridge.sheetAdminError(new Error('Unexpected response redirect')).error.includes('private-token'));
  } finally { globalThis.fetch = original; }
});

test('oversized chunked response is bounded even without Content-Length', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('x'.repeat(16385));
    await assert.rejects(() => bridge.callSheet(env, { action: 'health', site: 'main' }), /too large/);
  } finally { globalThis.fetch = original; }
});

test('enabled EnglishWord stats never touches D1; signed cookies, IP hashes and clear-cookie cooldown work', async () => {
  const s = script(); s.setup();
  await withGoogle(s, async requests => {
    const req = headers => new Request('https://englishword.pjmi.dpdns.org/api/stats', { headers: { 'cf-connecting-ip': '192.0.2.44', ...headers } });
    const config = { ...env, DB: { prepare() { throw new Error('D1 must not be used'); } } };
    const first = await bridge.stats({ request: req(), env: config, params: {} });
    assert.equal(first.status, 200); assert.equal((await first.json()).storage, 'google-sheets');
    assert.match(first.headers.get('set-cookie'), /HttpOnly; Secure; SameSite=Strict/);
    const cookies = first.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.equal((await bridge.stats({ request: req({ cookie: cookies }), env: config, params: {} })).status, 200);
    assert.equal((await bridge.stats({ request: req(), env: config, params: {} })).status, 200);
    assert.equal(s.rows.length, 2);
    assert.ok(requests.every(({ options }) => !options.body.includes('192.0.2.44') && !options.body.includes(secret)));
    assert.equal((await bridge.sheetViews(req({ origin: 'https://evil.test' }), env)).status, 403);
  });
});

test('Google outage never falls back to D1; disabled Google leaves D1 pathway intact', async () => {
  const original = globalThis.fetch; const log = console.error;
  console.error = () => {};
  const request = new Request('https://englishword.pjmi.dpdns.org/api/stats', { headers: { 'cf-connecting-ip': '192.0.2.1' } });
  try {
    globalThis.fetch = async () => { throw new Error('outage'); };
    const DB = { prepare() { throw new Error('D1 touched'); } };
    assert.equal((await bridge.stats({ env: { ...env, DB }, request, params: {} })).status, 503);
    const sqlite = new DatabaseSync(':memory:');
    try {
      const legacyDB = { prepare(sql) { let args = []; const statement = {
        bind(...values) { args = values; return statement; },
        async run() { return { meta: { changes: sqlite.prepare(sql).run(...args).changes } }; },
        async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      }; return statement; } };
      const response = await bridge.stats({ env: { ...env, GOOGLE_SHEETS_ENABLED: '0', DB: legacyDB }, request, params: {} });
      assert.equal(response.status, 200); assert.equal((await response.json()).views, 1);
    } finally { sqlite.close(); }
  } finally { globalThis.fetch = original; console.error = log; }
});

test('admin health route requires a session and same origin; status never discloses secrets or URL', async () => {
  const s = script(); s.setup();
  const config = { ...env, ADMIN_SESSION_SECRET: 'local-admin-session-test-secret' };
  const token = await bridge.createSessionToken(config.ADMIN_SESSION_SECRET);
  const cookie = `__Host-englishword_admin=${token}`;
  const request = (method = 'GET', headers = {}) => new Request('https://englishword.pjmi.dpdns.org/api/admin/google-sheets', {
    method, headers: { cookie, origin: 'https://englishword.pjmi.dpdns.org', 'content-type': 'application/json', ...headers },
    ...(method === 'POST' ? { body: JSON.stringify({ action: 'check' }) } : {}),
  });
  assert.equal((await bridge.adminStatus({ request: request('GET', { cookie: '' }), env: config, params: {} })).status, 401);
  const status = await bridge.adminStatus({ request: request(), env: config, params: {} });
  const raw = await status.text(); assert.ok(!raw.includes(secret) && !raw.includes(env.GOOGLE_SHEETS_URL));
  assert.equal((await bridge.adminCheck({ request: request('POST', { origin: 'https://evil.test' }), env: config, params: {} })).status, 403);
  await withGoogle(s, async () => assert.equal((await bridge.adminCheck({ request: request('POST'), env: config, params: {} })).status, 200));
  assert.equal(s.rows.length, 1);
});

test('migration freezes D1 counter without any schema or data writes', async () => {
  let reads = 0;
  const DB = { prepare(sql) {
    assert.equal(sql, 'SELECT view_count FROM site_stats WHERE stat_key = ?');
    return { bind(key) { assert.equal(key, 'homepage'); return this; },
      async all() { reads++; return { results: [{ view_count: 55 }] }; },
      run() { throw Error('No writes during migration'); } };
  } };
  const response = await bridge.stats({ request: new Request('https://englishword.pjmi.dpdns.org/api/stats'),
    env: { ...env, GOOGLE_SHEETS_ENABLED: '0', D1_STATS_READ_ONLY: '1', DB }, params: {} });
  assert.deepEqual(await response.json(), { views: 55, storage: 'd1', recording: false });
  assert.equal(reads, 1);
});

test('Google counter retains the legacy baseline and never accesses D1 after cutover', async () => {
  const s = script(); s.setup();
  await withGoogle(s, async () => {
    const response = await bridge.stats({ request: new Request('https://englishword.pjmi.dpdns.org/api/stats', {
      headers: { 'cf-connecting-ip': '192.0.2.66' },
    }), env: { ...env, GOOGLE_SHEETS_LEGACY_VIEWS: '55', D1_STATS_READ_ONLY: '1',
      DB: { prepare() { throw Error('D1 must not be called'); } } }, params: {} });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { views: 56, storage: 'google-sheets' });
  });
  assert.equal(s.rows.length, 2);
});

test('cached counters retain the legacy baseline and contain no identity cookies', async () => {
  const s = script(); s.setup();
  const originalCache = globalThis.caches;
  let saved;
  globalThis.caches = { default: {
    async match() { return saved?.clone(); },
    async put(_request, response) {
      assert.equal(response.headers.has('set-cookie'), false);
      saved = response.clone();
    },
  } };
  try {
    await withGoogle(s, async requests => {
      const configuration = { ...env, GOOGLE_SHEETS_LEGACY_VIEWS: '55' };
      const request = cookie => new Request('https://englishword.pjmi.dpdns.org/api/stats', {
        headers: { 'cf-connecting-ip': '192.0.2.66', ...(cookie ? { cookie } : {}) },
      });
      const first = await bridge.sheetViews(request(), configuration);
      assert.equal((await first.json()).views, 56);
      const cookie = first.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      const second = await bridge.sheetViews(request(cookie), configuration);
      assert.equal((await second.json()).views, 56);
      assert.equal(requests.length, 1);
    });
  } finally { globalThis.caches = originalCache; }
});

test('invalid legacy baseline fails closed before Google is called', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw Error('No Google fetch'); };
  try {
    for (const baseline of ['-1', 'NaN', '1.2', '1000000001']) {
      const response = await bridge.sheetViews(new Request('https://englishword.pjmi.dpdns.org/api/stats', {
        headers: { 'cf-connecting-ip': '192.0.2.66' },
      }), { ...env, GOOGLE_SHEETS_LEGACY_VIEWS: baseline });
      assert.equal(response.status, 503);
    }
  } finally { globalThis.fetch = original; }
});

test('disabled bridge allows signed read-only diagnostics but never records an event', async () => {
  const s = script(); s.setup();
  await withGoogle(s, async () => {
    assert.equal((await bridge.callSheet({ ...env, GOOGLE_SHEETS_ENABLED: '0' }, { action: 'views.read', site: 'englishword' })).views, 0);
    await assert.rejects(() => bridge.callSheet({ ...env, GOOGLE_SHEETS_ENABLED: '0' }, event()));
  });
  assert.equal(s.rows.length, 1);
});

test('only D1-admitted quiz starts sync; denied quiz never calls Google', async () => {
  const s = script(); s.setup();
  const sqlite = new DatabaseSync(':memory:'); sqlite.exec(quotaSchema);
  const DB = { prepare(sql) { let values = []; const statement = {
    bind(...bindings) { values = bindings; return statement; },
    async all() { return { results: sqlite.prepare(sql).all(...values) }; },
  }; return statement; } };
  const config = { ...env, DB, GOOGLE_SHEETS_LOG_QUIZZES: '1', ADMIN_SESSION_SECRET: 'only-local-session-fixture' };
  const identity = await bridge.quizIdentity(new Request('https://englishword.pjmi.dpdns.org/api/quiz/quota', { headers: { 'cf-connecting-ip': '192.0.2.66' } }), config);
  const request = () => new Request('https://englishword.pjmi.dpdns.org/api/quiz/start', { method: 'POST',
    headers: { cookie: identity.cookie.split(';')[0], 'cf-connecting-ip': '192.0.2.66', origin: 'https://englishword.pjmi.dpdns.org', 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'spelling' }) });
  try {
    await withGoogle(s, async requests => {
      for (let index = 0; index < 20; index++) {
        const tasks = []; const response = await bridge.startQuiz({ request: request(), env: config, params: {}, waitUntil: task => tasks.push(task) });
        assert.equal(response.status, 201); await Promise.all(tasks);
      }
      assert.equal((await bridge.startQuiz({ request: request(), env: config, params: {} })).status, 429);
      assert.equal(requests.length, 20); assert.equal(s.rows.length, 21);
    });
    // New identity receives an admission even if the optional telemetry is
    // down. The D1 admission remains authoritative and is charged once.
    const another = await bridge.quizIdentity(new Request('https://englishword.pjmi.dpdns.org/api/quiz/quota', { headers: { 'cf-connecting-ip': '192.0.2.77' } }), config);
    const original = globalThis.fetch; const log = console.error; let attempts = 0;
    try {
      globalThis.fetch = async () => { attempts++; throw new Error('Google unavailable'); };
      console.error = () => {};
      const response = await bridge.startQuiz({ env: config, params: {}, request: new Request('https://englishword.pjmi.dpdns.org/api/quiz/start', {
        method: 'POST', headers: { cookie: another.cookie.split(';')[0], 'cf-connecting-ip': '192.0.2.77', origin: 'https://englishword.pjmi.dpdns.org', 'content-type': 'application/json' },
        body: JSON.stringify({ mode: 'spelling' }),
      }) });
      assert.equal(response.status, 201); assert.equal((await response.json()).quota.remaining, 19);
      assert.equal(attempts, 1);
    } finally { globalThis.fetch = original; console.error = log; }
  } finally { sqlite.close(); }
});
