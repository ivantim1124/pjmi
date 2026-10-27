import {
  json,
  readJsonObject,
  requireAdmin,
  requireSameOrigin,
  type PageFunction,
} from '../../../_lib';
import {
  ensureSeatingSchema,
  normalizeSeatNumber,
  normalizeStudentName,
} from '../../../_seating';

type StudentRow = { seat_number: string; name: string };

export const onRequestGet: PageFunction = async ({ env, request }) => {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: '名單資料庫尚未設定。' }, 503);

  try {
    await ensureSeatingSchema(env.DB);
    const result = await env.DB
      .prepare(
        'SELECT seat_number, name FROM seating_students ORDER BY CAST(seat_number AS INTEGER), seat_number',
      )
      .all<StudentRow>();
    return json({
      students: result.results.map((row) => ({
        seatNumber: row.seat_number,
        name: row.name,
      })),
    });
  } catch (error) {
    console.error('Seating roster read failed');
    return json({ error: '目前無法讀取名單。' }, 503);
  }
};

export const onRequestPut: PageFunction = async ({ env, request }) => {
  const sameOriginDenied = requireSameOrigin(request);
  if (sameOriginDenied) return sameOriginDenied;
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  if (!env.DB) return json({ error: '名單資料庫尚未設定。' }, 503);

  try {
    const body = await readJsonObject(request, 48 * 1024);
    if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 200)
      return json({ error: '名單需有 1 到 200 位學生。' }, 400);

    const students: Array<{ seatNumber: string; name: string }> = [];
    const seenNumbers = new Set<string>();
    for (const value of body.students) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        return json({ error: '名單格式不正確。' }, 400);
      const student = value as Record<string, unknown>;
      const seatNumber = normalizeSeatNumber(student.seatNumber);
      const name = normalizeStudentName(student.name);
      if (!seatNumber || !name)
        return json({ error: '每筆資料都需要 1 到 200 的座號及姓名。' }, 400);
      if (seenNumbers.has(seatNumber))
        return json({ error: `座號 ${seatNumber} 重複，請先修正 CSV。` }, 400);
      seenNumbers.add(seatNumber);
      students.push({ seatNumber, name });
    }

    await ensureSeatingSchema(env.DB);
    if (!env.DB.batch)
      return json({ error: '名單資料庫目前不支援安全匯入。' }, 503);
    const statements = [env.DB.prepare('DELETE FROM seating_students')];
    for (const student of students) {
      statements.push(
        env.DB
          .prepare(
            'INSERT INTO seating_students (seat_number, name) VALUES (?, ?)',
          )
          .bind(student.seatNumber, student.name),
      );
    }
    await env.DB.batch(statements);
    return json({ ok: true, count: students.length });
  } catch (error) {
    console.error('Seating roster import failed');
    return json({ error: 'CSV 匯入失敗，原名單已保留。' }, 400);
  }
};
