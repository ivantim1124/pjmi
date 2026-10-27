import type { D1Database } from './_lib';

let seatingSchemaPromise: Promise<void> | undefined;

export const ensureSeatingSchema = (db: D1Database) => {
  if (!seatingSchemaPromise) {
    seatingSchemaPromise = (async () => {
      await db
        .prepare(
          `CREATE TABLE IF NOT EXISTS seating_students (
            seat_number TEXT PRIMARY KEY,
            name TEXT NOT NULL
          )`,
        )
        .run();
    })().catch((error) => {
      seatingSchemaPromise = undefined;
      throw error;
    });
  }
  return seatingSchemaPromise;
};

export const normalizeSeatNumber = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const normalized = String(value).normalize('NFKC').trim();
  if (!/^\d{1,3}$/.test(normalized)) return '';
  const number = Number(normalized);
  return number >= 1 && number <= 200 ? String(number) : '';
};

export const normalizeStudentName = (value: unknown) => {
  if (typeof value !== 'string') return '';
  const name = value.normalize('NFKC').trim();
  if (!name || name.length > 40 || /[\r\n\u0000-\u001f\u007f]/.test(name))
    return '';
  return name;
};

export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) =>
    ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] ?? character,
  );
