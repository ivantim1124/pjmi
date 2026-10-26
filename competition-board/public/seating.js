const $ = (selector) => document.querySelector(selector);
const MAX_SEATS = 200;
const PLAN_KEY = 'pjmi-seating-plan-v1';

const grid = $('#seat-grid');
const rosterCount = $('#roster-count');
const rosterLocked = $('#roster-locked');
const rosterContent = $('#roster-content');
const rosterList = $('#roster-list');
const rosterMessage = $('#roster-message');
const csvPreview = $('#csv-preview');
const rosterFile = $('#roster-file');
const importButton = $('#import-roster');
const rowInput = $('#row-count');
const columnInput = $('#column-count');
const arrangementCount = $('#arrangement-count');
const assignmentNote = $('#assignment-note');
const studentSelect = $('#seat-student');
const studentName = $('#seat-student-name');
const selectedSeatLabel = $('#selected-seat-label');
const randomizeButton = $('#randomize-seats');
const labelsButton = $('#get-labels');
const printChartButton = $('#print-chart');
const clearSelectedButton = $('#clear-seat');
const passwordDialog = $('#password-dialog');
const passwordForm = $('#password-form');
const passwordInput = $('#password-input');
const passwordTitle = $('#password-title');
const passwordDescription = $('#password-description');
const passwordMessage = $('#password-message');

let rows = 6;
let columns = 6;
let assignments = Array(36).fill(null);
let selectedIndex = null;
let roster = [];
let rosterLoaded = false;
let authenticated = false;
let pendingRoster = [];
let loginMode = 'roster';

const setStatus = (element, message, kind = '') => {
  if (!element) return;
  element.textContent = message;
  element.classList.remove('message-error', 'message-success');
  if (kind) element.classList.add(kind);
};

const rosterByNumber = () => new Map(roster.map((student) => [student.seatNumber, student]));

const savePlan = () => {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify({ rows, columns, assignments }));
  } catch {
    setStatus(assignmentNote, '瀏覽器無法儲存目前座位表；關閉或重新整理頁面後，未儲存的調整會消失。', 'message-error');
  }
};

const loadPlan = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(PLAN_KEY) || 'null');
    if (!stored || !Number.isInteger(stored.rows) || !Number.isInteger(stored.columns)) return;
    if (stored.rows < 1 || stored.rows > 20 || stored.columns < 1 || stored.columns > 12 || stored.rows * stored.columns > MAX_SEATS) return;
    rows = stored.rows;
    columns = stored.columns;
    rowInput.value = String(rows);
    columnInput.value = String(columns);
    assignments = Array(rows * columns).fill(null);
    const seen = new Set();
    if (Array.isArray(stored.assignments)) {
      stored.assignments.slice(0, assignments.length).forEach((value, index) => {
        const seatNumber = normalizeSeatNumber(value);
        if (seatNumber && !seen.has(seatNumber)) {
          assignments[index] = seatNumber;
          seen.add(seatNumber);
        }
      });
    }
  } catch {
    try { localStorage.removeItem(PLAN_KEY); } catch { /* Storage is unavailable. */ }
  }
};

const normalizeSeatNumber = (value) => {
  const text = String(value ?? '').normalize('NFKC').trim();
  if (!/^\d{1,3}$/.test(text)) return '';
  const number = Number(text);
  return number >= 1 && number <= 200 ? String(number) : '';
};

const normalizeName = (value) => {
  const name = String(value ?? '').normalize('NFKC').trim();
  if (!name || name.length > 40 || /[\r\n\u0000-\u001f\u007f]/.test(name)) return '';
  return name;
};

const renderRoster = () => {
  rosterCount.textContent = rosterLoaded ? `${roster.length} 位學生` : '尚未載入';
  rosterList.replaceChildren();
  if (!rosterLoaded) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = '登入後載入名單';
    row.append(cell);
    rosterList.append(row);
    return;
  }
  if (!roster.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 2;
    cell.textContent = '目前名單是空的，請匯入 CSV。';
    row.append(cell);
    rosterList.append(row);
    return;
  }
  roster.forEach((student) => {
    const row = document.createElement('tr');
    const numberCell = document.createElement('td');
    const nameCell = document.createElement('td');
    numberCell.textContent = student.seatNumber;
    nameCell.textContent = student.name;
    row.append(numberCell, nameCell);
    rosterList.append(row);
  });
};

const renderStudentSelect = () => {
  studentSelect.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = rosterLoaded ? '選擇座號' : '請先登入並載入名單';
  studentSelect.append(placeholder);
  roster.forEach((student) => {
    const option = document.createElement('option');
    option.value = student.seatNumber;
    option.textContent = `${student.seatNumber} 號　${student.name}`;
    studentSelect.append(option);
  });
  const assigned = selectedIndex === null ? '' : assignments[selectedIndex] || '';
  studentSelect.value = assigned;
  studentSelect.disabled = !rosterLoaded || selectedIndex === null || roster.length === 0;
  if (assigned) {
    const student = rosterByNumber().get(assigned);
    studentName.textContent = student ? `姓名：${student.name}` : '此座號已不在目前名單中。';
  } else {
    studentName.textContent = selectedIndex === null
      ? '點擊座位後選擇座號，姓名會自動帶入。'
      : '此座位尚未安排學生。';
  }
  clearSelectedButton.disabled = selectedIndex === null || !assignments[selectedIndex];
  randomizeButton.disabled = !rosterLoaded || roster.length === 0;
  labelsButton.disabled = !rosterLoaded || !assignments.some((number) => number && rosterByNumber().has(number));
  printChartButton.disabled = !rosterLoaded || !assignments.some((number) => number && rosterByNumber().has(number));
};

const renderSeats = () => {
  const students = rosterByNumber();
  const visibleAssignments = rosterLoaded
    ? assignments
    : Array(assignments.length).fill(null);
  const placed = visibleAssignments.filter((number) => number && students.has(number)).length;
  arrangementCount.textContent = rosterLoaded
    ? `${placed} / ${rows * columns} 位`
    : `登入後載入名單`;
  grid.className = `seat-grid seat-grid--cols-${columns}`;
  grid.replaceChildren();

  visibleAssignments.forEach((seatNumber, index) => {
    const rowNumber = Math.floor(index / columns) + 1;
    const columnNumber = (index % columns) + 1;
    const student = seatNumber ? students.get(seatNumber) : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `seat-cell${student ? ' is-occupied' : ''}${selectedIndex === index ? ' is-selected' : ''}`;
    button.dataset.index = String(index);
    button.setAttribute('aria-label', student
      ? `第 ${rowNumber} 排第 ${columnNumber} 列，${student.seatNumber} 號 ${student.name}`
      : `第 ${rowNumber} 排第 ${columnNumber} 列，空座位`);
    const position = document.createElement('span');
    position.className = 'seat-position';
    position.textContent = `${String(rowNumber).padStart(2, '0')} / ${String(columnNumber).padStart(2, '0')}`;
    const number = document.createElement('strong');
    number.className = 'seat-number';
    number.textContent = student ? `${student.seatNumber} 號` : '＋';
    const name = document.createElement('span');
    name.className = 'seat-name';
    name.textContent = student ? student.name : '空座位';
    button.append(position, number, name);
    button.addEventListener('click', () => selectSeat(index));
    grid.append(button);
  });

  if (selectedIndex === null) selectedSeatLabel.textContent = '尚未選擇座位';
  else selectedSeatLabel.textContent = `第 ${Math.floor(selectedIndex / columns) + 1} 排・第 ${(selectedIndex % columns) + 1} 列`;
  renderStudentSelect();
};

const renderAccess = () => {
  rosterLocked.classList.toggle('is-hidden', authenticated && rosterLoaded);
  rosterContent.classList.toggle('is-hidden', !authenticated || !rosterLoaded);
  renderRoster();
};

const selectSeat = (index) => {
  if (!rosterLoaded) {
    setStatus(assignmentNote, '請先登入並載入名單，再指定座號。');
    openLogin('roster');
    return;
  }
  selectedIndex = index;
  renderSeats();
  studentSelect.focus();
};

const revalidateAssignments = () => {
  const validNumbers = new Set(roster.map((student) => student.seatNumber));
  let removed = 0;
  const seen = new Set();
  assignments = assignments.map((number) => {
    if (!number) return null;
    if (!validNumbers.has(number) || seen.has(number)) {
      removed += 1;
      return null;
    }
    seen.add(number);
    return number;
  });
  savePlan();
  if (removed) setStatus(assignmentNote, `名單更新後已清除 ${removed} 個無效或重複座號。`, 'message-error');
};

const loadRoster = async () => {
  try {
    const response = await fetch('/api/admin/seating/roster', { credentials: 'same-origin' });
    if (response.status === 401 || response.status === 403) {
      authenticated = false;
      rosterLoaded = false;
      roster = [];
      renderAccess();
      renderSeats();
      return false;
    }
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || '目前無法讀取後台名單。');
    roster = Array.isArray(body.students)
      ? body.students.map((student) => ({
        seatNumber: normalizeSeatNumber(student.seatNumber),
        name: normalizeName(student.name),
      })).filter((student) => student.seatNumber && student.name)
      : [];
    rosterLoaded = true;
    authenticated = true;
    revalidateAssignments();
    renderAccess();
    renderSeats();
    setStatus(assignmentNote, roster.length
      ? '點擊座位指定座號；已指定的座位會在隨機安排時保留。'
      : '後台尚無名單，請先匯入 CSV。');
    return true;
  } catch (error) {
    authenticated = false;
    rosterLoaded = false;
    roster = [];
    renderAccess();
    renderSeats();
    setStatus(assignmentNote, error instanceof Error ? error.message : '讀取名單失敗。', 'message-error');
    return false;
  }
};

const checkSession = async () => {
  try {
    const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
    if (!response.ok) return false;
    const body = await response.json();
    return Boolean(body.authenticated);
  } catch {
    return false;
  }
};

const openLogin = (mode) => {
  loginMode = mode;
  passwordInput.value = '';
  setStatus(passwordMessage, '');
  if (mode === 'labels') {
    passwordTitle.textContent = '驗證後取得名條';
    passwordDescription.textContent = '每次產生名條都需要重新輸入管理密碼。';
  } else {
    passwordTitle.textContent = '管理者登入';
    passwordDescription.textContent = '輸入管理密碼以載入受保護的班級名單。';
  }
  if (!passwordDialog.open) passwordDialog.showModal();
  passwordInput.focus();
};

const parseDelimited = (text, delimiter) => {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === delimiter) {
      record.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      record.push(field);
      if (record.some((cell) => cell.trim())) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV 有未結束的雙引號。');
  record.push(field);
  if (record.some((cell) => cell.trim())) records.push(record);
  return records;
};

const parseRosterFile = (text) => {
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = firstLine.includes('\t') && !firstLine.includes(',') ? '\t' : ',';
  const records = parseDelimited(text, delimiter);
  if (!records.length) throw new Error('CSV 沒有可匯入的資料。');

  const header = records[0].map((cell) => cell.trim().replace(/^\uFEFF/, ''));
  const seatHeader = header.findIndex((cell) => ['座號', '座位號', 'seat', 'seat number'].includes(cell.toLowerCase()));
  const nameHeader = header.findIndex((cell) => ['姓名', '名字', 'name'].includes(cell.toLowerCase()));
  let dataRows = records;
  let seatColumn = 0;
  let nameColumn = -1;

  if (seatHeader >= 0 && nameHeader >= 0) {
    dataRows = records.slice(1);
    seatColumn = seatHeader;
    nameColumn = nameHeader;
  } else if (header.some((cell) => ['班級', '學號', '姓名', '座號'].includes(cell))) {
    throw new Error('CSV 標題需包含「座號」和「姓名」。');
  }

  const students = [];
  const seen = new Set();
  dataRows.forEach((record, index) => {
    let rawSeat;
    let rawName;
    if (nameColumn >= 0) {
      rawSeat = record[seatColumn];
      rawName = record[nameColumn];
    } else if (record.length === 2) {
      [rawSeat, rawName] = record;
    } else if (record.length === 3) {
      rawSeat = normalizeSeatNumber(record[0]) ? record[0] : record[1];
      rawName = record[2];
    } else if (record.length >= 4) {
      rawSeat = record[1];
      rawName = record[record.length - 1];
    } else {
      throw new Error(`第 ${index + 1} 筆資料欄位不足。`);
    }
    const seatNumber = normalizeSeatNumber(rawSeat);
    const name = normalizeName(rawName);
    if (!seatNumber || !name) throw new Error(`第 ${index + 1} 筆資料的座號或姓名不正確。`);
    if (seen.has(seatNumber)) throw new Error(`座號 ${seatNumber} 重複，請先修正 CSV。`);
    seen.add(seatNumber);
    students.push({ seatNumber, name });
  });

  if (!students.length) throw new Error('CSV 需要至少一筆學生資料。');
  if (students.length > 200) throw new Error('一次最多匯入 200 位學生。');
  return students;
};

const decodeRosterFile = async (file) => {
  const bytes = await file.arrayBuffer();
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('big5').decode(bytes);
  }
};

const showCsvPreview = () => {
  csvPreview.replaceChildren();
  if (!pendingRoster.length) {
    csvPreview.classList.add('is-hidden');
    return;
  }
  const heading = document.createElement('strong');
  heading.textContent = `準備匯入 ${pendingRoster.length} 位學生`;
  const sample = document.createElement('span');
  sample.textContent = `預覽：${pendingRoster.slice(0, 5).map((student) => `${student.seatNumber} 號 ${student.name}`).join('、')}${pendingRoster.length > 5 ? '…' : ''}`;
  csvPreview.append(heading, sample);
  csvPreview.classList.remove('is-hidden');
};

const changeLayout = (nextRows, nextColumns) => {
  if (!Number.isInteger(nextRows) || !Number.isInteger(nextColumns) || nextRows < 1 || nextColumns < 1 || nextRows > 20 || nextColumns > 12 || nextRows * nextColumns > MAX_SEATS) {
    setStatus(assignmentNote, '座位表尺寸需為 1–20 排、每排 1–12 個，總數不可超過 200。', 'message-error');
    return false;
  }
  const nextAssignments = Array(nextRows * nextColumns).fill(null);
  let removed = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const value = assignments[row * columns + column];
      if (!value) continue;
      if (row < nextRows && column < nextColumns) nextAssignments[row * nextColumns + column] = value;
      else removed += 1;
    }
  }
  if (removed && !window.confirm(`縮小座位表會移除 ${removed} 個已安排座位，確定更新嗎？`)) {
    rowInput.value = String(rows);
    columnInput.value = String(columns);
    return false;
  }
  rows = nextRows;
  columns = nextColumns;
  assignments = nextAssignments;
  selectedIndex = null;
  rowInput.value = String(rows);
  columnInput.value = String(columns);
  savePlan();
  renderSeats();
  setStatus(assignmentNote, removed ? `座位表已更新，移除 ${removed} 個超出範圍的安排。` : '座位表尺寸已更新。');
  return true;
};

const shuffle = (values) => {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const randomize = () => {
  if (!rosterLoaded || roster.length === 0) {
    openLogin('roster');
    return;
  }
  const placed = new Set(assignments.filter(Boolean));
  const remaining = roster.map((student) => student.seatNumber).filter((number) => !placed.has(number));
  const emptyIndexes = assignments.map((number, index) => number ? -1 : index).filter((index) => index >= 0);
  if (remaining.length > emptyIndexes.length) {
    setStatus(assignmentNote, `尚有 ${remaining.length} 位未安排，但只剩 ${emptyIndexes.length} 個空位；請增加座位數或先清空部分指定座位。`, 'message-error');
    return;
  }
  if (!remaining.length) {
    setStatus(assignmentNote, '名單中的學生都已安排完成。');
    return;
  }
  shuffle(remaining).forEach((number, index) => {
    assignments[emptyIndexes[index]] = number;
  });
  savePlan();
  renderSeats();
  setStatus(assignmentNote, `已將 ${remaining.length} 位學生隨機安排；原本指定的座位已保留。`);
};

const createLabels = async (printWindow) => {
  const assignmentsToPrint = assignments.flatMap((seatNumber, index) => seatNumber && rosterByNumber().has(seatNumber)
    ? [{ seatNumber, row: Math.floor(index / columns) + 1, column: (index % columns) + 1 }]
    : []);
  if (!assignmentsToPrint.length) {
    printWindow?.close();
    setStatus(assignmentNote, '請先安排學生座位，再取得名條。', 'message-error');
    return;
  }
  try {
    const response = await fetch('/api/admin/seating/labels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ rows, columns, assignments: assignmentsToPrint }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || (response.status === 401 ? '登入已失效，請重新驗證密碼。' : '目前無法產生名條。'));
    }
    const html = await response.text();
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    const printButton = printWindow.document.querySelector('#print-labels');
    printButton?.addEventListener('click', () => printWindow.print());
    printWindow.focus();
    setStatus(assignmentNote, '名條已開啟；請在新分頁按「列印名條」。');
  } catch (error) {
    printWindow?.close();
    setStatus(assignmentNote, error instanceof Error ? error.message : '目前無法產生名條。', 'message-error');
  }
};

loadPlan();
renderAccess();
renderSeats();

checkSession().then((valid) => {
  authenticated = valid;
  if (valid) loadRoster();
});

$('#roster-login').addEventListener('click', async () => {
  if (await checkSession()) {
    authenticated = true;
    await loadRoster();
    return;
  }
  openLogin('roster');
});

$('#roster-logout').addEventListener('click', async () => {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    authenticated = false;
    rosterLoaded = false;
    roster = [];
    pendingRoster = [];
    assignments = Array(rows * columns).fill(null);
    selectedIndex = null;
    try { localStorage.removeItem(PLAN_KEY); } catch { /* Storage is unavailable. */ }
    renderAccess();
    renderSeats();
    setStatus(assignmentNote, '已登出並清除這台瀏覽器中的座位安排。');
  }
});

$('#cancel-password').addEventListener('click', () => passwordDialog.close());
passwordDialog.addEventListener('click', (event) => {
  if (event.target === passwordDialog) passwordDialog.close();
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const mode = loginMode;
  const password = passwordInput.value;
  const printWindow = mode === 'labels' ? window.open('', '_blank') : null;
  if (mode === 'labels' && !printWindow) {
    setStatus(passwordMessage, '瀏覽器封鎖了新分頁，請允許此網站開啟彈出視窗後再試。', 'message-error');
    return;
  }
  if (printWindow) printWindow.opener = null;
  setStatus(passwordMessage, '正在驗證……');
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ password }),
    });
    if (!response.ok) {
      printWindow?.close();
      passwordInput.value = '';
      if (response.status === 429) {
        const seconds = Number(response.headers.get('retry-after') || 1800);
        throw new Error(`嘗試次數過多，請約 ${Math.max(1, Math.ceil(seconds / 60))} 分鐘後再試。`);
      }
      if (response.status === 503) throw new Error('管理登入防護尚未設定完成。');
      throw new Error('密碼錯誤。');
    }
    authenticated = true;
    passwordInput.value = '';
    passwordDialog.close();
    if (mode === 'labels') {
      await createLabels(printWindow);
    } else {
      await loadRoster();
    }
  } catch (error) {
    printWindow?.close();
    setStatus(passwordMessage, error instanceof Error ? error.message : '目前無法連線，請稍後再試。', 'message-error');
  }
});

rosterFile.addEventListener('change', async () => {
  pendingRoster = [];
  importButton.disabled = true;
  setStatus(rosterMessage, '');
  const file = rosterFile.files?.[0];
  if (!file) {
    showCsvPreview();
    return;
  }
  try {
    pendingRoster = parseRosterFile(await decodeRosterFile(file));
    showCsvPreview();
    importButton.disabled = false;
    setStatus(rosterMessage, '請確認預覽後匯入。');
  } catch (error) {
    showCsvPreview();
    setStatus(rosterMessage, error instanceof Error ? error.message : 'CSV 讀取失敗。', 'message-error');
  }
});

importButton.addEventListener('click', async () => {
  if (!pendingRoster.length || !authenticated) return;
  if (!window.confirm('匯入會完整取代後台目前名單。只有座號與姓名會送到後台；班級欄、六碼學號及其他欄位不會儲存。確定繼續嗎？')) return;
  importButton.disabled = true;
  setStatus(rosterMessage, '正在安全匯入名單……');
  try {
    const response = await fetch('/api/admin/seating/roster', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ students: pendingRoster }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'CSV 匯入失敗。');
    roster = pendingRoster.slice();
    rosterLoaded = true;
    pendingRoster = [];
    rosterFile.value = '';
    showCsvPreview();
    revalidateAssignments();
    renderAccess();
    renderSeats();
    setStatus(rosterMessage, `已匯入 ${body.count} 位學生；學號與班級資料未儲存。`, 'message-success');
    setStatus(assignmentNote, '點擊座位指定座號，或隨機安排未指定的學生。');
  } catch (error) {
    setStatus(rosterMessage, error instanceof Error ? error.message : 'CSV 匯入失敗。', 'message-error');
  } finally {
    importButton.disabled = pendingRoster.length === 0;
  }
});

$('#layout-form').addEventListener('submit', (event) => {
  event.preventDefault();
  changeLayout(Number(rowInput.value), Number(columnInput.value));
});

document.querySelectorAll('[data-layout]').forEach((button) => {
  button.addEventListener('click', () => {
    const [presetRows, presetColumns] = button.dataset.layout.split('x').map(Number);
    changeLayout(presetRows, presetColumns);
  });
});

studentSelect.addEventListener('change', () => {
  if (selectedIndex === null) return;
  const nextSeatNumber = normalizeSeatNumber(studentSelect.value);
  const previousSeatNumber = assignments[selectedIndex];
  const previousIndex = nextSeatNumber ? assignments.indexOf(nextSeatNumber) : -1;
  if (previousIndex >= 0 && previousIndex !== selectedIndex) assignments[previousIndex] = previousSeatNumber || null;
  assignments[selectedIndex] = nextSeatNumber || null;
  savePlan();
  renderSeats();
  setStatus(assignmentNote, nextSeatNumber ? '座位已更新；如選到已安排的座號，兩位學生已交換位置。' : '座位已清空。');
});

clearSelectedButton.addEventListener('click', () => {
  if (selectedIndex === null) return;
  assignments[selectedIndex] = null;
  savePlan();
  renderSeats();
  setStatus(assignmentNote, '已清除此座位。');
});

randomizeButton.addEventListener('click', randomize);

$('#clear-seats').addEventListener('click', () => {
  if (!assignments.some(Boolean)) return;
  if (!window.confirm('確定清空目前所有座位安排？')) return;
  assignments = Array(rows * columns).fill(null);
  selectedIndex = null;
  savePlan();
  renderSeats();
  setStatus(assignmentNote, '所有座位已清空。');
});

labelsButton.addEventListener('click', () => {
  if (!assignments.some(Boolean)) return;
  openLogin('labels');
});

printChartButton.addEventListener('click', () => {
  if (!rosterLoaded || !assignments.some(Boolean)) return;
  window.print();
});
