/** Same-origin, one-shot telemetry. No retry loop, tracking IDs or Google URL in the browser. */
export async function loadViewCount(target: HTMLElement, fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetcher('/api/stats', {
      credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) throw new Error('Statistics unavailable');
    const data = await response.json();
    if (!Number.isSafeInteger(data.views) || data.views < 0) throw new Error('Invalid count');
    target.textContent = `瀏覽次數：${data.views.toLocaleString('zh-Hant-TW')}`;
  } catch {
    // Do not replace an outage with a misleading zero or fall back to D1.
    target.textContent = '瀏覽統計暫時無法取得';
  } finally { clearTimeout(timeout); }
}

export function initViewCounters(doc: Document = document) {
  const targets = [...doc.querySelectorAll<HTMLElement>('[data-pjmi-view-count]')];
  if (!targets.length) return;
  const load = () => {
    if (doc.visibilityState === 'hidden') return;
    doc.removeEventListener('visibilitychange', load);
    // One request even when several copies of the counter appear on a page.
    const primary = targets[0];
    if (primary.dataset.loaded) return;
    primary.dataset.loaded = '1';
    void loadViewCount(primary).then(() => {
      for (const target of targets.slice(1)) target.textContent = primary.textContent;
    });
  };
  if (doc.visibilityState === 'hidden') doc.addEventListener('visibilitychange', load);
  else load();
}
