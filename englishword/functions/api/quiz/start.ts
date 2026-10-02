import { json, readJsonObject, requireSameOrigin, type PageFunction } from '../../_lib';
import { admitQuiz, quizIdentity, readQuizQuota } from '../../_quiz-quota';
import { logSheetQuiz } from '../../../../integrations/google-sheets/bridge';

export const onRequestPost: PageFunction = async ({ request, env, waitUntil }) => {
  const denied = requireSameOrigin(request);
  if (denied) return denied;
  let mode = '';
  try {
    const body = await readJsonObject(request);
    if (!['spelling', 'meaningToWord', 'wordToMeaning'].includes(String(body.mode)))
      return json({ error: '請選擇有效的測驗方式。' }, 400);
    mode = String(body.mode);
  } catch {
    return json({ error: '測驗請求格式不正確。' }, 400);
  }
  try {
    const identity = await quizIdentity(request, env);
    if (!identity.valid) return json({ error: '請允許本站 Cookie，重新整理後再開始測驗。' }, 428,
      { 'set-cookie': identity.cookie });
    const now = Date.now();
    const sessionId = await admitQuiz(env.DB!, identity, now);
    const quota = await readQuizQuota(env.DB!, identity, now);
    if (!sessionId) return json({
      error: '此 IP 或裝置今天已達 20 次測驗上限，請於台灣時間明天 00:00 後再試。', quota,
    }, 429, { 'retry-after': String(Math.max(1, Math.ceil((Date.parse(quota.resetsAt) - now) / 1000))) });
    if (env.GOOGLE_SHEETS_ENABLED === '1' && env.GOOGLE_SHEETS_LOG_QUIZZES === '1') {
      // This is best-effort telemetry, never the admission authority. There is
      // no new public write route, and denied quizzes never reach Google.
      const record = logSheetQuiz(env, sessionId, identity.ipHash, identity.deviceHash, mode)
        .catch(() => console.error(JSON.stringify({ event: 'sheets_quiz_log_unavailable' })));
      if (waitUntil) waitUntil(record);
      else await record;
    }
    return json({ sessionId, quota }, 201);
  } catch (error) {
    console.error('Unable to start quiz', error);
    return json({ error: '目前無法開始測驗，請稍後再試。' }, 503);
  }
};
