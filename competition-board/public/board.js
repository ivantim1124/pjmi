const grid = document.querySelector('#competition-grid');
const preview = JSON.parse(grid?.dataset.preview || '[]');
let competitions = [];
let activeFilter = 'all';

const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  "'": '&#39;',
  '"': '&quot;',
})[character] || character);

const statusLabel = (status) => ({
  upcoming: '即將開始',
  completed: '已完成',
  archived: '紀錄保存',
})[status];

const render = () => {
  if (!grid) return;
  const filtered = activeFilter === 'all' ? competitions : competitions.filter((item) => item.status === activeFilter);
  grid.innerHTML = filtered.length
    ? filtered.map((item, index) => `
      <article class="competition-card ${item.featured ? 'competition-card--featured' : ''}">
        <div class="competition-card-top">
          <span class="card-index">${String(index + 1).padStart(2, '0')}</span>
          <span class="status-pill status-pill--${escapeHtml(item.status)}">${escapeHtml(statusLabel(item.status))}</span>
        </div>
        <p class="card-category">${escapeHtml(item.category || '比賽')}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <dl class="card-details">
          <div><dt>日期</dt><dd>${escapeHtml(item.eventDate || '日期待補')}</dd></div>
          <div><dt>地點</dt><dd>${escapeHtml(item.location || '地點待補')}</dd></div>
        </dl>
        ${item.link ? `<a class="card-link" href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer">活動連結 <span aria-hidden="true">↗</span></a>` : ''}
      </article>
    `).join('')
    : '<div class="board-empty"><strong>尚無公開比賽</strong></div>';
};

const load = async () => {
  try {
    const response = await fetch('/api/competitions', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('API unavailable');
    competitions = await response.json();
  } catch {
    competitions = preview;
  }
  render();
};

document.querySelectorAll('[data-filter]').forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter || 'all';
    document.querySelectorAll('[data-filter]').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    render();
  });
});

load();
