import { readCookie, sign, constantTimeEqual, type D1Database, type Env } from './_lib';

export const dailyQuizLimit = 20;
const deviceCookieName = '__Host-englishword_device';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dayMs = 86_400_000;
const taipeiOffsetMs = 8 * 60 * 60 * 1000;

export const quizDay = (now = Date.now()) => {
  const localTime = now + taipeiOffsetMs;
  return {
    day: new Date(localTime).toISOString().slice(0, 10),
    resetsAt: new Date((Math.floor(localTime / dayMs) + 1) * dayMs - taipeiOffsetMs).toISOString(),
  };
};

export const quizIdentity = async (request: Request, env: Env) => {
  const secret = env.ADMIN_SESSION_SECRET;
  const ip = request.headers.get('cf-connecting-ip')?.trim();
  if (!secret || !env.DB || !ip) throw new Error('Quiz protection is not configured');
  const token = readCookie(request, deviceCookieName);
  const [deviceId, signature, extra] = token.split('.');
  const valid = Boolean(deviceId && uuidPattern.test(deviceId) && signature && !extra
    && await constantTimeEqual(signature, await sign(`englishword-device-v1:${deviceId}`, secret)));
  const id = valid ? deviceId : crypto.randomUUID();
  const cookie = valid ? '' : `${deviceCookieName}=${id}.${await sign(`englishword-device-v1:${id}`, secret)}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict; Priority=High`;
  const [ipHash, deviceHash] = await Promise.all([
    sign(`englishword-quiz-ip-v1:${ip}`, secret),
    sign(`englishword-quiz-device-v1:${id}`, secret),
  ]);
  return { ipHash, deviceHash, cookie, valid };
};

export type QuizIdentity = Awaited<ReturnType<typeof quizIdentity>>;

export const readQuizQuota = async (db: D1Database, identity: QuizIdentity, now = Date.now()) => {
  const { day, resetsAt } = quizDay(now);
  const result = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM quiz_starts WHERE day = ?1 AND ip_hash = ?2) AS ip_used,
    (SELECT COUNT(*) FROM quiz_starts WHERE day = ?1 AND device_hash = ?3) AS device_used`)
    .bind(day, identity.ipHash, identity.deviceHash)
    .all<{ ip_used: number; device_used: number }>();
  const row = result.results[0];
  const used = Math.max(Number(row.ip_used), Number(row.device_used));
  return { day, limit: dailyQuizLimit, used, remaining: Math.max(0, dailyQuizLimit - used), resetsAt };
};

export const admitQuiz = async (db: D1Database, identity: QuizIdentity, now = Date.now()) => {
  const sessionId = crypto.randomUUID();
  // The two checks and insertion share one SQL statement. Concurrent requests
  // cannot both consume the final place, and rejecting one identity charges neither.
  const result = await db.prepare(`INSERT INTO quiz_starts (session_id, day, ip_hash, device_hash)
    SELECT ?1, ?2, ?3, ?4
    WHERE (SELECT COUNT(*) FROM quiz_starts WHERE day = ?2 AND ip_hash = ?3) < ?5
      AND (SELECT COUNT(*) FROM quiz_starts WHERE day = ?2 AND device_hash = ?4) < ?5
    RETURNING session_id`)
    .bind(sessionId, quizDay(now).day, identity.ipHash, identity.deviceHash, dailyQuizLimit)
    .all<{ session_id: string }>();
  return result.results[0]?.session_id ?? null;
};
