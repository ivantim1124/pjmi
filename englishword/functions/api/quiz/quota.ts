import { json, type PageFunction } from '../../_lib';
import { quizIdentity, readQuizQuota } from '../../_quiz-quota';

export const onRequestGet: PageFunction = async ({ request, env }) => {
  try {
    const identity = await quizIdentity(request, env);
    const quota = await readQuizQuota(env.DB!, identity);
    return json({ quota }, 200, identity.cookie ? { 'set-cookie': identity.cookie } : {});
  } catch (error) {
    console.error('Unable to read quiz quota', error);
    return json({ error: '目前無法確認測驗次數，請稍後再試。' }, 503);
  }
};
