import {
  json,
  normalizeWord,
  requireAdmin,
  requireSameOrigin,
  type D1Query,
  type PageFunction,
} from '../../_lib';

const maxImportBytes = 2 * 1024 * 1024;
const maxRows = 5000;
const maxColumns = 12;
const allowedMimeTypes = new Set([
  'application/csv',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'text/tab-separated-values',
]);
const binarySignatures = [
  [0x50, 0x4b, 0x03, 0x04], // ZIP / XLSX
  [0x4d, 0x5a], // Windows executable
  [0x25, 0x50, 0x44, 0x46], // PDF
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x52, 0x61, 0x72, 0x21], // RAR
];
const forbiddenControlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const formulaInjectionPrefix = /^\s*[=+\-@]/u;
const suspiciousMarkup = /<\s*\/?\s*(?:script|iframe|object|embed|svg|style|html|head|body|meta|link)\b|\bon(?:error|load|click)\s*=|(?:javascript|vbscript)\s*:/iu;

type ImportedWord = {
  range: string;
  word: string;
  wordNormalized: string;
  meaning: string;
  example: string;
  phonetic: string;
  partOfSpeech: string;
  sortOrder: number;
};

const normalizeHeader = (value: string) =>
  value.replace(/^\uFEFF/, '').trim().toLocaleLowerCase().replace(/[\s_-]+/g, '');

const validateUploadName = (name: string) => {
  const normalizedName = name.trim().normalize('NFC');
  if (
    !normalizedName ||
    normalizedName.length > 120 ||
    /[\\/\u0000-\u001F]/u.test(normalizedName)
  ) {
    throw new Error('檔名不符合安全格式');
  }
  const lowerName = normalizedName.toLocaleLowerCase();
  if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.tsv')) {
    throw new Error('只接受 .csv 或 .tsv 檔案');
  }
  return normalizedName;
};

const readUploadText = async (file: File) => {
  if (!file.size) throw new Error('檔案不能是空的');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hasUnsupportedBom =
    (bytes[0] === 0xff && bytes[1] === 0xfe) ||
    (bytes[0] === 0xfe && bytes[1] === 0xff) ||
    (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0x00 && bytes[3] === 0x00) ||
    (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0xfe && bytes[3] === 0xff);
  if (hasUnsupportedBom) throw new Error('只接受 UTF-8 純文字 CSV／TSV，不接受 UTF-16／UTF-32 檔案');
  if (binarySignatures.some((signature) => signature.every((byte, index) => bytes[index] === byte))) {
    throw new Error('檔案含有二進位檔案特徵，僅接受純文字 CSV／TSV');
  }

  for (const byte of bytes) {
    if (byte === 0 || (byte >= 1 && byte <= 8) || (byte >= 11 && byte <= 12) || (byte >= 14 && byte <= 31) || byte === 127) {
      throw new Error('檔案含有不允許的控制字元，已拒絕');
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('檔案必須是有效的 UTF-8 純文字');
  }
};

const headerAliases = {
  range: ['range', '範圍', '分類', 'unit', 'lesson', 'group'],
  word: ['word', '英文', '單字', 'english'],
  meaning: ['meaning', '中文', '意思', '翻譯', 'translation'],
  example: ['example', '例句', 'sentence'],
  phonetic: ['phonetic', '音標', 'pronunciation'],
  partOfSpeech: ['partofspeech', '詞性', '詞類', 'pos'],
};

const parseDelimited = (input: string, delimiter: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const checkColumnCount = () => {
    if (row.length > maxColumns) throw new Error(`單列最多 ${maxColumns} 個欄位`);
  };

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (!quoted && character === delimiter) {
      row.push(cell);
      checkColumnCount();
      cell = '';
    } else if (!quoted && character === '\n') {
      row.push(cell.replace(/\r$/, ''));
      checkColumnCount();
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (quoted) throw new Error('CSV 引號沒有關閉');
  if (cell.length || row.length) {
    row.push(cell.replace(/\r$/, ''));
    checkColumnCount();
    if (row.some((value) => value.trim())) rows.push(row);
  }
  return rows;
};

const findColumn = (headers: string[], aliases: string[]) => {
  const normalized = aliases.map(normalizeHeader);
  const matches = headers.reduce<number[]>((indexes, header, index) => {
    if (normalized.includes(normalizeHeader(header))) indexes.push(index);
    return indexes;
  }, []);
  if (matches.length > 1) throw new Error('表格欄位名稱重複，請保留每個欄位一份');
  return matches[0] ?? -1;
};

const getCell = (row: string[], index: number) => (index >= 0 ? row[index]?.trim() || '' : '');

const limited = (value: string, name: string, max: number) => {
  if (value.length > max) throw new Error(`${name} 最多 ${max} 個字元`);
  return value;
};

const scanCell = (value: string, rowNumber: number, columnNumber: number) => {
  if (forbiddenControlCharacters.test(value)) {
    throw new Error(`第 ${rowNumber} 列第 ${columnNumber} 欄含有不允許的控制字元`);
  }
  if (formulaInjectionPrefix.test(value)) {
    throw new Error(`第 ${rowNumber} 列第 ${columnNumber} 欄疑似含有試算表公式，已拒絕`);
  }
  if (suspiciousMarkup.test(value)) {
    throw new Error(`第 ${rowNumber} 列第 ${columnNumber} 欄含有疑似程式或標籤內容，已拒絕`);
  }
};

const parseImport = (input: string, fileName: string) => {
  const firstLine = input.split(/\r?\n/, 1)[0] || '';
  const isTsv = fileName.toLocaleLowerCase().endsWith('.tsv') || (!firstLine.includes(',') && firstLine.includes('\t'));
  const rows = parseDelimited(input.replace(/^\uFEFF/, ''), isTsv ? '\t' : ',');
  if (!rows.length) throw new Error('表格沒有資料');
  rows.forEach((row, rowIndex) => row.forEach((value, columnIndex) =>
    scanCell(value, rowIndex + 1, columnIndex + 1)));

  const headers = rows[0];
  const columns = {
    range: findColumn(headers, headerAliases.range),
    word: findColumn(headers, headerAliases.word),
    meaning: findColumn(headers, headerAliases.meaning),
    example: findColumn(headers, headerAliases.example),
    phonetic: findColumn(headers, headerAliases.phonetic),
    partOfSpeech: findColumn(headers, headerAliases.partOfSpeech),
  };
  if (columns.range < 0 || columns.word < 0 || columns.meaning < 0) {
    throw new Error('缺少必要欄位：range、word、meaning');
  }
  if (rows.length - 1 > maxRows) throw new Error(`單次最多匯入 ${maxRows} 筆`);

  const unique = new Map<string, ImportedWord>();
  let skipped = 0;
  let duplicates = 0;
  rows.slice(1).forEach((row, index) => {
    if (!row.some((value) => value.trim())) {
      skipped += 1;
      return;
    }
    const range = limited(getCell(row, columns.range), 'range', 80);
    const word = limited(getCell(row, columns.word), 'word', 120);
    const meaning = limited(getCell(row, columns.meaning), 'meaning', 300);
    if (!range || !word || !meaning) throw new Error(`第 ${index + 2} 列缺少 range、word 或 meaning`);
    const item: ImportedWord = {
      range,
      word,
      wordNormalized: normalizeWord(word),
      meaning,
      example: limited(getCell(row, columns.example), 'example', 500),
      phonetic: limited(getCell(row, columns.phonetic), 'phonetic', 80),
      partOfSpeech: limited(getCell(row, columns.partOfSpeech), 'part_of_speech', 40),
      sortOrder: index,
    };
    const key = `${range}\u0000${item.wordNormalized}`;
    if (unique.has(key)) duplicates += 1;
    unique.set(key, item);
  });

  if (!unique.size) throw new Error('表格沒有可匯入的單字');
  return { rows: [...unique.values()], skipped, duplicates };
};

const writeRows = async (db: NonNullable<import('../../_lib').Env['DB']>, rows: ImportedWord[]) => {
  const now = new Date().toISOString();
  const statements: D1Query[] = rows.map((item) => db
    .prepare(
      `INSERT INTO words (id, range_name, word, word_normalized, meaning, example, phonetic, part_of_speech, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(range_name, word_normalized) DO UPDATE SET
         word = excluded.word,
         meaning = excluded.meaning,
         example = excluded.example,
         phonetic = excluded.phonetic,
         part_of_speech = excluded.part_of_speech,
         sort_order = excluded.sort_order,
         updated_at = excluded.updated_at`,
    )
    .bind(
      crypto.randomUUID(),
      item.range,
      item.word,
      item.wordNormalized,
      item.meaning,
      item.example,
      item.phonetic,
      item.partOfSpeech,
      item.sortOrder,
      now,
      now,
    ));

  for (let index = 0; index < statements.length; index += 50) {
    const chunk = statements.slice(index, index + 50);
    if (db.batch) await db.batch(chunk);
    else for (const statement of chunk) await statement.run();
  }
};

export const onRequestPost: PageFunction = async ({ env, request }) => {
  const originDenied = requireSameOrigin(request);
  if (originDenied) return originDenied;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: 'D1 is not configured' }, 503);
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxImportBytes + 64 * 1024) {
    return json({ error: '檔案太大，單次最多 2 MB' }, 413);
  }
  const contentType = request.headers.get('content-type')?.toLocaleLowerCase() ?? '';
  if (!contentType.startsWith('multipart/form-data')) {
    return json({ error: '只接受 multipart/form-data 上傳' }, 415);
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) return json({ error: '請選擇 CSV 檔案' }, 400);
    const fileName = validateUploadName(file.name);
    const mimeType = file.type.trim().toLocaleLowerCase().split(';', 1)[0].trim();
    if (mimeType && !allowedMimeTypes.has(mimeType)) {
      return json({ error: '只接受 CSV／TSV 純文字檔案' }, 415);
    }
    if (file.size > maxImportBytes) return json({ error: '檔案太大，單次最多 2 MB' }, 413);
    const parsed = parseImport(await readUploadText(file), fileName);
    await writeRows(env.DB, parsed.rows);
    return json({
      imported: parsed.rows.length,
      skipped: parsed.skipped,
      duplicates: parsed.duplicates,
      ranges: [...new Set(parsed.rows.map((item) => item.range))],
    }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : '匯入失敗' }, 400);
  }
};
