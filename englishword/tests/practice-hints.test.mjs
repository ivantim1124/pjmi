import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { parseRangeName, compareRangeNames, spellingHint, questionPresentation } from '../public/practice-utils.js';

test('professional shows exactly ten blanks, endpoints and 12 letters', () => {
  const hint = spellingHint('professional');
  assert.equal(hint.mask, 'p__________l');
  assert.equal(hint.letterCount, 12);
  assert.equal(hint.countLabel, '12 個字母');
});

test('phrases preserve punctuation and whitespace; blanks match hidden letters', () => {
  for (const word of ['cost an arm and a leg', 'give...a hand', "roll up one's sleeves", 'part-time', 'coral reef']) {
    const hint = spellingHint(word);
    assert.equal(hint.letterCount, word.match(/[A-Za-z]/g).length);
    assert.equal(hint.mask.replace(/[A-Za-z_]/g, ''), word.replace(/[A-Za-z]/g, ''));
    assert.equal(hint.mask.length, word.length);
    assert.match(hint.countLabel, /個單字/);
  }
  assert.equal(spellingHint('coral reef').mask, 'c___l r__f');
  assert.equal(spellingHint('give...a hand').mask, 'g__e...a h__d');
  assert.equal(spellingHint('cost an arm and a leg').letterCount, 16);
});

test('short words never create negative blank counts', () => {
  assert.equal(spellingHint('a').mask, 'a');
  assert.equal(spellingHint('an').mask, 'an');
  assert.equal(spellingHint('cat').mask, 'c_t');
  assert.equal(spellingHint('').letterCount, 0);
});

test('R1 belongs to the same exam and textbook source, not the other folder', () => {
  const range = parseRangeName('115-1-1-R1(課本)');
  assert.equal(range.examKey, '115-1-1');
  assert.equal(range.source, '課本');
  assert.equal(range.lessonLabel, 'R1');
  assert.equal(range.isReview, true);
  assert.equal(parseRangeName('115-1-1-r2（雜誌）').lesson, 2);
  assert.equal(parseRangeName('115-1-1-Rx(課本)'), null);
});

test('numeric lessons sort before review lessons; sources never interleave', () => {
  const ranges = ['115-1-1-R10(課本)', '115-1-1-1(雜誌)', '115-1-1-10(課本)', '115-1-1-R2(課本)', '115-1-1-R1(課本)', '115-1-1-2(課本)'];
  assert.deepEqual(ranges.sort(compareRangeNames), ['115-1-1-2(課本)', '115-1-1-10(課本)', '115-1-1-R1(課本)', '115-1-1-R2(課本)', '115-1-1-R10(課本)', '115-1-1-1(雜誌)']);
});

test('API and browser use the same R1 grouping and sorting implementation', async () => {
  const result = await build({ entryPoints: ['englishword/functions/_range.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  const api = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  assert.deepEqual(api.parseRangeName('115-1-1-R1(課本)'), parseRangeName('115-1-1-R1(課本)'));
  assert.equal(api.compareRangeNames('115-1-1-3(課本)', '115-1-1-R1(課本)'), compareRangeNames('115-1-1-3(課本)', '115-1-1-R1(課本)'));
});

test('actual question renderer displays per-word source and hints in all modes and scopes', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const renderer = app.slice(app.indexOf('  const renderQuestion = () => {'), app.indexOf('  const gradeQuestion = '));
  assert.ok(renderer.length > 0);
  const element = () => ({ textContent: '', style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, replaceChildren() {} });
  const modes = ['spelling', 'meaningToWord', 'wordToMeaning'];
  for (const mode of modes) {
    for (const scope of ['single', 'exam', 'source', 'custom', 'retry']) {
      const context = { questions: [{ word: 'professional', meaning: '專業的', range: '115-1-1-R1(課本)' }, { word: 'coral reef', meaning: '珊瑚礁', range: '115-1-1-8(雜誌)' }],
        currentIndex: 0, selectedMode: mode, selectedScope: scope, modeLabels: Object.fromEntries(modes.map(mode => [mode, mode])),
        questionPresentation, practiceTitle: element(), questionMode: element(), progressBar: element(), promptDetail: element(),
        questionSource: element(), questionHint: element(), questionLetterCount: element(), answerArea: element(), nextButton: element(),
        promptLabel: element(), promptValue: element(), hideFeedback() {}, createSpellingAnswer() {}, createChoiceAnswer() {} };
      runInNewContext(`${renderer}\nrenderQuestion();`, context);
      assert.equal(context.questionSource.textContent, '來源：115-1-1-R1(課本)');
      assert.equal(context.questionHint.textContent, 'p__________l');
      assert.equal(context.questionLetterCount.textContent, '12 個字母');
      context.currentIndex = 1;
      runInNewContext('renderQuestion();', context);
      assert.equal(context.questionSource.textContent, '來源：115-1-1-8(雜誌)');
      assert.equal(context.questionHint.textContent, 'c___l r__f');
      assert.match(context.questionLetterCount.textContent, /9 個字母/);
    }
  }
});

test('R1 SQL import has 21 entries, matches CSV, is idempotent and preserves existing data', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(await readFile(new URL('../schema.sql', import.meta.url), 'utf8'));
    const sql = await readFile(new URL('../migrations/20260930_textbook_r1.sql', import.meta.url), 'utf8');
    db.exec(sql);
    db.exec("UPDATE words SET meaning = '管理員編輯保留' WHERE word = 'artificial';");
    db.exec(sql);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM words').get().count, 21);
    assert.equal(db.prepare("SELECT meaning FROM words WHERE word = 'artificial'").get().meaning, '管理員編輯保留');
    const csv = await readFile(new URL('../115-1-1/115-1-1-R1(課本).csv', import.meta.url), 'utf8');
    const csvRows = csv.trim().split('\n').slice(1).map(line => line.slice(1, -1).split('","'));
    const rows = db.prepare('SELECT range_name, word, part_of_speech FROM words ORDER BY sort_order').all();
    assert.equal(csvRows.length, 21);
    for (let index = 0; index < rows.length; index++) {
      assert.equal(rows[index].range_name, csvRows[index][0]);
      assert.equal(rows[index].word, csvRows[index][1]);
      assert.equal(rows[index].part_of_speech, csvRows[index][5]);
    }
  } finally { db.close(); }
});
