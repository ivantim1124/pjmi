/* PJMI Google Apps Script gateway. Paste into Code.gs; settings belong in
 * Project Settings > Script Properties, never in the website JavaScript.
 * Only fixed, signed metric operations are accepted. There is no arbitrary
 * append/update/delete API and no unauthenticated read API.
 */
const PJMI_SITES = ['main', 'competitions', 'englishword'];
const PJMI_HEADER = ['received_at', 'day_taipei', 'site', 'event', 'event_id', 'ip_hash', 'device_hash', 'mode'];
const PJMI_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PJMI_HASH = /^[0-9a-f]{64}$/;

function pjmiConfig_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(props.SPREADSHEET_ID || '')
    || !/^[0-9a-f]{64}$/i.test(props.BRIDGE_SECRET || '')) throw new Error('CONFIGURATION_REQUIRED');
  function number(name, fallback, max) {
    const value = props[name] === undefined ? fallback : Number(props[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error('INVALID_LIMIT');
    return value;
  }
  const baselines = {};
  PJMI_SITES.forEach(function(site) {
    const value = Number(props['BASELINE_' + site.toUpperCase() + '_VIEWS'] || 0);
    if (!Number.isSafeInteger(value) || value < 0 || value > 1000000000) throw new Error('INVALID_BASELINE');
    baselines[site] = value;
  });
  return {
    spreadsheetId: props.SPREADSHEET_ID, secret: props.BRIDGE_SECRET,
    dailyLimit: number('MAX_EVENTS_PER_DAY', 1000, 2000),
    rowLimit: number('MAX_TOTAL_EVENTS', 10000, 20000), baselines: baselines,
  };
}

function pjmiHmac_(value, secret) {
  return Utilities.computeHmacSha256Signature(value, secret, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}
function pjmiEqual_(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== 64 || right.length !== 64) return false;
  let difference = 0;
  for (let i = 0; i < 64; i++) difference |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return difference === 0;
}
function pjmiOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
function pjmiSignedOutput_(requestId, value, secret) {
  const payload = JSON.stringify(value);
  return pjmiOutput_({ v: 1, requestId: requestId, payload: payload,
    signature: pjmiHmac_('response-v1\n' + requestId + '\n' + payload, secret) });
}
function doGet() {
  // Opening /exec in a browser is deliberately not a health test.
  return pjmiOutput_({ ok: false, code: 'SIGNED_POST_REQUIRED' });
}

function pjmiPayload_(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || PJMI_SITES.indexOf(payload.site) === -1) throw new Error('INVALID_PAYLOAD');
  const read = payload.action === 'health' || payload.action === 'views.read';
  const view = payload.action === 'views.record';
  const quiz = payload.action === 'quiz.record';
  if (!read && !view && !quiz) throw new Error('ACTION_DENIED');
  const allowed = read ? ['action', 'site'] : ['action', 'site', 'eventId', 'ipHash', 'deviceHash', 'mode'];
  if (Object.keys(payload).some(function(key) { return allowed.indexOf(key) === -1; })) throw new Error('INVALID_FIELDS');
  if (!read && (!PJMI_UUID.test(payload.eventId || '') || !PJMI_HASH.test(payload.ipHash || '')
    || !PJMI_HASH.test(payload.deviceHash || ''))) throw new Error('INVALID_IDENTITY');
  if (view && payload.mode !== undefined) throw new Error('INVALID_FIELDS');
  if (quiz && (payload.site !== 'englishword' || ['spelling', 'meaningToWord', 'wordToMeaning'].indexOf(payload.mode) === -1))
    throw new Error('INVALID_QUIZ');
  return payload;
}

function pjmiEvents_(config) {
  const sheet = SpreadsheetApp.openById(config.spreadsheetId).getSheetByName('Events');
  if (!sheet) throw new Error('RUN_SETUP_FIRST');
  const header = sheet.getRange(1, 1, 1, PJMI_HEADER.length).getValues()[0];
  if (JSON.stringify(header) !== JSON.stringify(PJMI_HEADER)) throw new Error('INVALID_HEADER');
  const count = sheet.getLastRow() - 1;
  if (count > config.rowLimit) throw new Error('ROW_LIMIT');
  const rows = count ? sheet.getRange(2, 1, count, PJMI_HEADER.length).getValues() : [];
  if (count && sheet.getRange(2, 1, count, PJMI_HEADER.length).getFormulas()
    .some(function(row) { return row.some(function(value) { return value !== ''; }); })) throw new Error('INVALID_LEDGER');
  // Manual edits or formulas in the security ledger must fail closed.
  rows.forEach(function(row) {
    if (typeof row[0] !== 'number' || !Number.isSafeInteger(row[0])
      || !/^\d{4}-\d{2}-\d{2}$/.test(row[1]) || PJMI_SITES.indexOf(row[2]) === -1
      || ['view', 'quiz'].indexOf(row[3]) === -1 || !PJMI_UUID.test(row[4])
      || !PJMI_HASH.test(row[5]) || !PJMI_HASH.test(row[6])
      || (row[3] === 'view' && row[7] !== '')
      || (row[3] === 'quiz' && (row[2] !== 'englishword' || ['spelling', 'meaningToWord', 'wordToMeaning'].indexOf(row[7]) === -1)))
      throw new Error('INVALID_LEDGER');
  });
  return { sheet: sheet, rows: rows };
}

function pjmiOperate_(payload, config, now) {
  const ledger = pjmiEvents_(config);
  const rows = ledger.rows;
  function views() {
    return config.baselines[payload.site] + rows.filter(function(row) { return row[2] === payload.site && row[3] === 'view'; }).length;
  }
  if (payload.action === 'health') return { ok: true, dailyLimit: config.dailyLimit, rowLimit: config.rowLimit };
  if (payload.action === 'views.read') return { ok: true, views: views() };
  const event = payload.action === 'views.record' ? 'view' : 'quiz';
  const duplicate = rows.find(function(row) { return row[4] === payload.eventId; });
  if (duplicate) {
    if (duplicate[2] !== payload.site || duplicate[3] !== event || duplicate[5] !== payload.ipHash
      || duplicate[6] !== payload.deviceHash || duplicate[7] !== (payload.mode || '')) throw new Error('EVENT_ID_CONFLICT');
    return { ok: true, recorded: false, views: views() };
  }
  const day = Utilities.formatDate(new Date(now), 'Asia/Taipei', 'yyyy-MM-dd');
  const today = rows.filter(function(row) { return row[1] === day; });
  const matching = today.filter(function(row) { return row[2] === payload.site && row[3] === event; });
  const ipRows = matching.filter(function(row) { return row[5] === payload.ipHash; });
  const deviceRows = matching.filter(function(row) { return row[6] === payload.deviceHash; });
  if (ipRows.length >= 20 || deviceRows.length >= 20
    || (event === 'view' && matching.some(function(row) {
      return (row[5] === payload.ipHash || row[6] === payload.deviceHash) && now - row[0] < 30 * 60 * 1000;
    }))) return { ok: true, recorded: false, views: views() };
  if (today.length >= config.dailyLimit) return { ok: false, code: 'DAILY_WRITE_LIMIT' };
  if (rows.length >= config.rowLimit) return { ok: false, code: 'ROW_LIMIT' };
  // All inputs are enums, validated identifiers, digests or numbers. User text
  // and spreadsheet formulas never reach this single-row commit.
  // Preserve the YYYY-MM-DD ledger key as text, not a Sheets Date value.
  ledger.sheet.getRange(rows.length + 2, 2, 1, 1).setNumberFormat('@');
  ledger.sheet.getRange(rows.length + 2, 1, 1, PJMI_HEADER.length).setValues([[
    now, day, payload.site, event, payload.eventId, payload.ipHash, payload.deviceHash, payload.mode || '',
  ]]);
  SpreadsheetApp.flush();
  return { ok: true, recorded: true, views: views() + (event === 'view' ? 1 : 0) };
}

function doPost(e) {
  let config;
  let envelope;
  let authenticated = false;
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || raw.length > 8192 || e.contentLength > 16384) throw new Error('INVALID_REQUEST');
    envelope = JSON.parse(raw);
    if (!envelope || envelope.v !== 1 || !PJMI_UUID.test(envelope.requestId || '')
      || !Number.isSafeInteger(envelope.issuedAt) || Math.abs(Date.now() - envelope.issuedAt) > 5 * 60 * 1000
      || typeof envelope.payload !== 'string' || envelope.payload.length > 4096
      || !PJMI_HASH.test(envelope.signature || '')) throw new Error('INVALID_REQUEST');
    config = pjmiConfig_();
    const expected = pjmiHmac_('v1\n' + envelope.requestId + '\n' + envelope.issuedAt + '\n' + envelope.payload, config.secret);
    if (!pjmiEqual_(expected, envelope.signature)) throw new Error('AUTHENTICATION_FAILED');
    authenticated = true;
    const payload = pjmiPayload_(JSON.parse(envelope.payload));
    lock = LockService.getScriptLock();
    if (!lock.tryLock(500)) throw new Error('BUSY');
    return pjmiSignedOutput_(envelope.requestId, pjmiOperate_(payload, config, Date.now()), config.secret);
  } catch (error) {
    // Do not disclose configuration, spreadsheet IDs, stack traces or secrets.
    const safeCodes = ['BUSY', 'RUN_SETUP_FIRST', 'ROW_LIMIT', 'INVALID_HEADER', 'INVALID_LEDGER',
      'INVALID_PAYLOAD', 'ACTION_DENIED', 'INVALID_FIELDS', 'INVALID_IDENTITY', 'INVALID_QUIZ', 'EVENT_ID_CONFLICT'];
    const code = authenticated && safeCodes.indexOf(error.message) !== -1 ? error.message : 'UNAVAILABLE';
    return authenticated ? pjmiSignedOutput_(envelope.requestId, { ok: false, code: code }, config.secret)
      : pjmiOutput_({ ok: false, code: 'REQUEST_DENIED' });
  } finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}

// Run once as the owner. Idempotent and preserves existing tabs/records.
function setup() {
  const config = pjmiConfig_();
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const book = SpreadsheetApp.openById(config.spreadsheetId);
    let events = book.getSheetByName('Events');
    if (!events) events = book.insertSheet('Events');
    if (events.getLastRow() === 0) events.getRange(1, 1, 1, PJMI_HEADER.length).setValues([PJMI_HEADER]);
    if (JSON.stringify(events.getRange(1, 1, 1, PJMI_HEADER.length).getValues()[0]) !== JSON.stringify(PJMI_HEADER))
      throw new Error('Events 已存在但欄位不同，請改用一份專用試算表。');
    events.setFrozenRows(1);
    if (events.getMaxRows() < config.rowLimit + 1) events.insertRowsAfter(events.getMaxRows(), config.rowLimit + 1 - events.getMaxRows());
    events.getRange(1, 1, 1, PJMI_HEADER.length).setFontWeight('bold').setBackground('#e7f0ed');
    events.setColumnWidths(1, 4, 145);
    events.setColumnWidths(5, 3, 300);
    events.setColumnWidth(8, 160);
    SpreadsheetApp.flush();
    return '設定完成；請部署為網頁應用程式。';
  } finally { lock.releaseLock(); }
}
