import {
  json,
  readJsonObject,
  requireAdmin,
  requireSameOrigin,
  type PageFunction,
} from '../../../_lib';
import {
  ensureSeatingSchema,
  escapeHtml,
  normalizeSeatNumber,
} from '../../../_seating';

type StudentRow = { seat_number: string; name: string };
type Assignment = { seatNumber: string; row: number; column: number };

export const onRequestPost: PageFunction = async ({ env, request }) => {
  const sameOriginDenied = requireSameOrigin(request);
  if (sameOriginDenied) return sameOriginDenied;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: '名單資料庫尚未設定。' }, 503);

  try {
    const body = await readJsonObject(request);
    const rows = Number(body.rows);
    const columns = Number(body.columns);
    if (
      !Number.isInteger(rows) ||
      !Number.isInteger(columns) ||
      rows < 1 ||
      columns < 1 ||
      rows > 20 ||
      columns > 12 ||
      rows * columns > 200
    )
      return json({ error: '座位表尺寸不正確。' }, 400);
    if (!Array.isArray(body.assignments) || body.assignments.length < 1 || body.assignments.length > 200)
      return json({ error: '請先完成至少一個座位安排。' }, 400);

    const assignments: Assignment[] = [];
    const seenNumbers = new Set<string>();
    const seenPositions = new Set<string>();
    for (const value of body.assignments) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return json({ error: '座位資料格式不正確。' }, 400);
      const assignment = value as Record<string, unknown>;
      const seatNumber = normalizeSeatNumber(assignment.seatNumber);
      const row = Number(assignment.row);
      const column = Number(assignment.column);
      if (
        !seatNumber ||
        !Number.isInteger(row) ||
        !Number.isInteger(column) ||
        row < 1 ||
        row > rows ||
        column < 1 ||
        column > columns
      )
        return json({ error: '座位資料超出表格範圍。' }, 400);
      const position = `${row}:${column}`;
      if (seenNumbers.has(seatNumber) || seenPositions.has(position))
        return json({ error: '名條有重複座號或座位。' }, 400);
      seenNumbers.add(seatNumber);
      seenPositions.add(position);
      assignments.push({ seatNumber, row, column });
    }

    await ensureSeatingSchema(env.DB);
    const result = await env.DB
      .prepare(
        'SELECT seat_number, name FROM seating_students',
      )
      .all<StudentRow>();
    const bySeatNumber = new Map(
      result.results.map((student) => [student.seat_number, student.name]),
    );
    if (bySeatNumber.size !== assignments.length)
      return json({ error: '名單已更新，請重新安排座位後再列印。' }, 409);

    const labels = assignments
      .map((assignment) => {
        const name = bySeatNumber.get(assignment.seatNumber) ?? '';
        return `<article class="name-label"><span class="label-place">第 ${assignment.row} 排・第 ${assignment.column} 列</span><strong>${escapeHtml(name)}</strong><span class="label-seat">座號 ${escapeHtml(assignment.seatNumber)}</span></article>`;
      })
      .join('');
    const html = `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; form-action 'none'; style-src 'self'; img-src 'none'">
    <title>PJMI 座位名條</title>
    <link rel="stylesheet" href="/seating-labels.css">
  </head>
  <body>
    <header class="print-toolbar"><div><strong>PJMI／座位名條</strong><span>${assignments.length} 張名條</span></div><button id="print-labels" type="button">列印名條</button></header>
    <main class="label-grid">${labels}</main>
  </body>
</html>`;

    return new Response(html, {
      headers: {
        'cache-control': 'no-store, max-age=0',
        'content-type': 'text/html; charset=utf-8',
        'x-robots-tag': 'noindex, nofollow, noarchive',
      },
    });
  } catch (error) {
    console.error('Seating label generation failed');
    return json({ error: '名條產生失敗，請重新整理後再試。' }, 400);
  }
};
