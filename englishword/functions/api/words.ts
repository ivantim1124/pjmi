import {
  json,
  normalizeWord,
  readWordCache,
  type PageFunction,
  type WordCacheScope,
  writeWordCache,
} from '../_lib';
import { compareRangeNames } from '../_range';

type RangeRow = { range_name: string; count: number };
type WordRow = {
  id: string;
  range_name: string;
  word: string;
  meaning: string;
  example: string;
  phonetic: string;
  part_of_speech: string;
  sort_order: number;
};

const publicHeaders = {
  'cache-control': 'public, max-age=10, s-maxage=30',
};

const isExamKey = (value: string) => /^\d{3}-[12]-\d+$/.test(value);
const allowedSources = new Set(['課本', '雜誌']);
const maxSearchLength = 80;
const maxSearchResults = 100;

const wordsQuery = `SELECT id, range_name, word, meaning, example, phonetic, part_of_speech, sort_order
  FROM words`;

const readFilteredWords = async (db: NonNullable<import('../_lib').Env['DB']>, exam: string, source: string) => {
  const conditions: string[] = [];
  const bindings: string[] = [];
  if (exam) {
    conditions.push('range_name LIKE ?');
    bindings.push(`${exam}-%`);
  }
  if (source) {
    conditions.push('(range_name LIKE ? OR range_name LIKE ?)');
    bindings.push(`%(${source})`, `%（${source}）`);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
  return db
    .prepare(`${wordsQuery}${where} ORDER BY range_name COLLATE NOCASE ASC, sort_order ASC, word COLLATE NOCASE ASC LIMIT 5000`)
    .bind(...bindings)
    .all<WordRow>();
};

const readSearchWords = async (db: NonNullable<import('../_lib').Env['DB']>, query: string) => {
  const pattern = `%${normalizeWord(query)}%`;
  return db
    .prepare(
      `${wordsQuery} WHERE word_normalized LIKE ? OR meaning LIKE ? OR example LIKE ? OR range_name LIKE ?
       ORDER BY range_name COLLATE NOCASE ASC, sort_order ASC, word COLLATE NOCASE ASC LIMIT ${maxSearchResults}`,
    )
    .bind(pattern, pattern, pattern, pattern)
    .all<WordRow>();
};

const toWord = (row: WordRow) => ({
  id: row.id,
  range: row.range_name,
  word: row.word,
  meaning: row.meaning,
  example: row.example,
  phonetic: row.phonetic,
  partOfSpeech: row.part_of_speech,
});

const compareWords = (left: WordRow, right: WordRow) => compareRangeNames(left.range_name, right.range_name)
  || Number(left.sort_order || 0) - Number(right.sort_order || 0)
  || left.word.localeCompare(right.word, 'en', { numeric: true, sensitivity: 'base' });

const sortWords = (rows: WordRow[]) => [...rows].sort(compareWords);

export const onRequestGet: PageFunction = async ({ env, request, waitUntil }) => {
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);
  const params = new URL(request.url).searchParams;
  const range = params.get('range')?.trim() || '';
  const exam = params.get('exam')?.trim() || '';
  const source = params.get('source')?.trim() || '';
  const query = params.get('q')?.trim() || '';
  const scope: WordCacheScope = { range, exam, source };

  if (range && (exam || source)) return json({ error: 'Choose one word scope at a time' }, 400);
  if (exam && !isExamKey(exam)) return json({ error: 'Invalid exam scope' }, 400);
  if (source && !allowedSources.has(source)) return json({ error: 'Invalid source scope' }, 400);
  if (range === '__all__' && source) return json({ error: 'Choose one word scope at a time' }, 400);
  if (query.length > maxSearchLength) return json({ error: `搜尋文字最多 ${maxSearchLength} 個字元` }, 400);
  if (query && (range || exam || source)) return json({ error: 'Search uses a standalone query' }, 400);

  try {
    const cacheScope: WordCacheScope = query
      ? { range: '', exam: '', source: '', query: normalizeWord(query) }
      : scope;
    const cached = await readWordCache(request, cacheScope);
    if (cached) return cached;

    let data: unknown;
    if (query) {
      const result = await readSearchWords(env.DB, query);
      data = { query, words: sortWords(result.results).slice(0, maxSearchResults).map(toWord) };
    } else if (!range && !exam && !source) {
      const result = await env.DB
        .prepare('SELECT range_name, COUNT(*) AS count FROM words GROUP BY range_name ORDER BY range_name COLLATE NOCASE ASC')
        .all<RangeRow>();
      data = {
        ranges: [...result.results]
          .sort((left, right) => compareRangeNames(left.range_name, right.range_name))
          .map((row) => ({ name: row.range_name, count: Number(row.count) })),
      };
    } else {
      const result = range && range !== '__all__'
        ? await env.DB.prepare(`${wordsQuery} WHERE range_name = ? ORDER BY sort_order ASC, word COLLATE NOCASE ASC LIMIT 5000`).bind(range).all<WordRow>()
        : await readFilteredWords(env.DB, exam, source);
      data = { range, words: sortWords(result.results).map(toWord) };
    }

    const response = json(data, 200, publicHeaders);
    const cacheWrite = writeWordCache(request, cacheScope, response.clone());
    if (waitUntil)
      waitUntil(cacheWrite.catch((error) => console.error('Unable to cache words', error)));
    else await cacheWrite;
    return response;
  } catch (error) {
    console.error(error);
    return json({ error: 'Unable to read words' }, 500);
  }
};
