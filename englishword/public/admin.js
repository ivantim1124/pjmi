const adminApp = document.querySelector('#admin-app');

if (adminApp) {
  const maxUploadBytes = 2 * 1024 * 1024;
  const loginShell = document.querySelector('#login-shell');
  const loginForm = document.querySelector('#login-form');
  const loginEmail = document.querySelector('#admin-email');
  const loginPassword = document.querySelector('#admin-password');
  const loginButton = document.querySelector('#login-button');
  const loginMessage = document.querySelector('#login-message');
  const adminShell = document.querySelector('#admin-shell');
  const uploadForm = document.querySelector('#upload-form');
  const fileInput = document.querySelector('#word-file');
  const fileName = document.querySelector('#file-name');
  const uploadButton = document.querySelector('#upload-button');
  const uploadMessage = document.querySelector('#upload-message');
  const summaryList = document.querySelector('#summary-list');
  const logoutButton = document.querySelector('#logout-button');

  const setMessage = (element, text, tone = '') => {
    if (!element) return;
    element.textContent = text;
    if (tone) element.dataset.tone = tone;
    else delete element.dataset.tone;
  };

  const showLogin = () => {
    loginShell.classList.remove('is-hidden');
    adminShell.classList.add('is-hidden');
    loginEmail?.focus({ preventScroll: true });
  };

  const showAdmin = () => {
    loginShell.classList.add('is-hidden');
    adminShell.classList.remove('is-hidden');
    document.dispatchEvent(new Event('pjmi-admin-ready'));
  };

  const renderSummary = (payload) => {
    if (!summaryList) return;
    const rows = [
      { label: '單字總數', value: `${payload.total || 0} 字` },
      { label: '練習範圍', value: `${payload.ranges?.length || 0} 組` },
      ...(payload.ranges || []).map((item) => ({ label: item.name, value: `${item.count} 字` })),
    ];
    summaryList.replaceChildren(...rows.map((item) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const label = document.createElement('dt');
      label.textContent = item.label;
      const value = document.createElement('dd');
      value.textContent = item.value;
      row.append(label, value);
      return row;
    }));
  };

  const loadSummary = async () => {
    const response = await fetch('/api/admin/summary', { credentials: 'same-origin' });
    if (response.status === 401) {
      showLogin();
      return;
    }
    if (!response.ok) throw new Error('Summary unavailable');
    renderSummary(await response.json());
  };

  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    loginButton.disabled = true;
    loginButton.classList.add('button--loading');
    setMessage(loginMessage, '登入中……');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPassword.value }),
      });
      if (!response.ok) {
        loginPassword.value = '';
        if (response.status === 429) {
          const seconds = Number(response.headers.get('retry-after') || 1800);
          setMessage(loginMessage, `嘗試次數過多，請約 ${Math.max(1, Math.ceil(seconds / 60))} 分鐘後再試。`, 'error');
        } else if (response.status === 503) {
          setMessage(loginMessage, '管理登入尚未完成 Cloudflare 設定。', 'error');
        } else {
          setMessage(loginMessage, 'email 或密碼錯誤。', 'error');
        }
        return;
      }
      loginPassword.value = '';
      setMessage(loginMessage, '登入成功。', 'success');
      showAdmin();
      await loadSummary();
    } catch {
      setMessage(loginMessage, '目前無法連線，請稍後再試。', 'error');
    } finally {
      loginButton.disabled = false;
      loginButton.classList.remove('button--loading');
    }
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileName.textContent = file?.name || '尚未選擇檔案';
    if (!file) return;
    const lowerName = file.name.toLocaleLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.tsv')) {
      setMessage(uploadMessage, '只接受 .csv 或 .tsv 檔案。', 'error');
    } else if (file.size > maxUploadBytes) {
      setMessage(uploadMessage, '檔案太大，單次最多 2 MB。', 'error');
    } else {
      setMessage(uploadMessage, '檔案格式將由伺服器進一步掃描。');
    }
  });

  uploadForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) {
      setMessage(uploadMessage, '請先選擇 CSV／TSV 檔案。', 'error');
      return;
    }
    const lowerName = file.name.toLocaleLowerCase();
    if (!lowerName.endsWith('.csv') && !lowerName.endsWith('.tsv')) {
      setMessage(uploadMessage, '只接受 .csv 或 .tsv 檔案。', 'error');
      return;
    }
    if (file.size > maxUploadBytes) {
      setMessage(uploadMessage, '檔案太大，單次最多 2 MB。', 'error');
      return;
    }
    uploadButton.disabled = true;
    uploadButton.classList.add('button--loading');
    setMessage(uploadMessage, '匯入中……');
    try {
      const response = await fetch('/api/admin/import', {
        method: 'POST',
        credentials: 'same-origin',
        body: new FormData(uploadForm),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.status === 401) {
        showLogin();
        setMessage(loginMessage, '登入工作階段已結束，請重新登入。', 'error');
        return;
      }
      if (!response.ok) throw new Error(payload.error || '匯入失敗。');
      setMessage(uploadMessage, `完成：匯入 ${payload.imported} 筆，略過 ${payload.skipped} 筆。`, 'success');
      uploadForm.reset();
      fileName.textContent = '尚未選擇檔案';
      await loadSummary();
    } catch (error) {
      setMessage(uploadMessage, error instanceof Error ? error.message : '匯入失敗，請檢查表格格式。', 'error');
    } finally {
      uploadButton.disabled = false;
      uploadButton.classList.remove('button--loading');
    }
  });

  logoutButton?.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    showLogin();
    setMessage(loginMessage, '已登出。', 'success');
  });

  const checkSession = async () => {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Session unavailable');
    const payload = await response.json();
    if (payload.authenticated) {
      showAdmin();
      await loadSummary();
    } else {
      showLogin();
    }
  };

  checkSession().catch(() => showLogin());
}
