import { parseRangeName, compareRangeNames, questionPresentation } from './practice-utils.js?v=20260930-r1-hints';

const app = document.querySelector('#englishword-app');

if (app) {
  const previewWords = JSON.parse(app.dataset.preview || '[]');
  const setupPanel = document.querySelector('#setup-panel');
  const setupForm = document.querySelector('#setup-form');
  const rangeSelect = document.querySelector('#range-select');
  const rangeHelper = document.querySelector('#range-helper');
  const examSelect = document.querySelector('#exam-select');
  const examSourceSelect = document.querySelector('#exam-source-select');
  const examHelper = document.querySelector('#exam-helper');
  const sourceSelect = document.querySelector('#source-select');
  const sourceHelper = document.querySelector('#source-helper');
  const scopeHelper = document.querySelector('#scope-helper');
  const scopeButtons = [...document.querySelectorAll('[data-scope]')];
  const scopeFields = {
    single: document.querySelector('#single-scope-fields'),
    exam: document.querySelector('#exam-scope-fields'),
    source: document.querySelector('#source-scope-fields'),
    custom: document.querySelector('#custom-scope-fields'),
  };
  const rangeChecklist = document.querySelector('#range-checklist');
  const customHelper = document.querySelector('#custom-helper');
  const selectAllRanges = document.querySelector('#select-all-ranges');
  const clearRanges = document.querySelector('#clear-ranges');
  const countSelect = document.querySelector('#count-select');
  const previewButton = document.querySelector('#preview-button');
  const startButton = document.querySelector('#start-button');
  const setupMessage = document.querySelector('#setup-message');
  const pageViewCount = document.querySelector('#page-view-count');
  const quotaDisplay = document.querySelector('#quiz-quota');
  const retryMessage = document.querySelector('#retry-message');
  const inventoryList = document.querySelector('#inventory-list');
  const searchForm = document.querySelector('#search-form');
  const searchInput = document.querySelector('#search-input');
  const searchButton = document.querySelector('#search-button');
  const clearSearchButton = document.querySelector('#clear-search-button');
  const searchCount = document.querySelector('#search-count');
  const searchMessage = document.querySelector('#search-message');
  const searchResults = document.querySelector('#search-results');
  const searchEmptyState = document.querySelector('#search-empty-state');
  const previewPanel = document.querySelector('#preview-panel');
  const previewContext = document.querySelector('#preview-context');
  const previewCount = document.querySelector('#preview-count');
  const previewMessage = document.querySelector('#preview-message');
  const previewList = document.querySelector('#preview-list');
  const previewEmptyState = document.querySelector('#preview-empty-state');
  const closePreviewButton = document.querySelector('#close-preview-button');
  const practicePanel = document.querySelector('#practice-panel');
  const practiceContext = document.querySelector('#practice-context');
  const practiceTitle = document.querySelector('#practice-title');
  const questionMode = document.querySelector('#question-mode');
  const progressBar = document.querySelector('#progress-bar');
  const promptLabel = document.querySelector('#prompt-label');
  const promptValue = document.querySelector('#prompt-value');
  const promptDetail = document.querySelector('#prompt-detail');
  const questionSource = document.querySelector('#question-source');
  const questionHint = document.querySelector('#question-hint');
  const questionLetterCount = document.querySelector('#question-letter-count');
  const answerArea = document.querySelector('#answer-area');
  const feedback = document.querySelector('#feedback');
  const nextButton = document.querySelector('#next-button');
  const quitButton = document.querySelector('#quit-button');
  const resultPanel = document.querySelector('#result-panel');
  const resultNote = document.querySelector('#result-note');
  const resultTotal = document.querySelector('#result-total');
  const resultCorrect = document.querySelector('#result-correct');
  const resultRate = document.querySelector('#result-rate');
  const wrongCount = document.querySelector('#wrong-count');
  const wrongList = document.querySelector('#wrong-list');
  const noWrongState = document.querySelector('#no-wrong-state');
  const retryWrongButton = document.querySelector('#retry-wrong-button');
  const newPracticeButton = document.querySelector('#new-practice-button');
  const modeButtons = [...document.querySelectorAll('[data-mode]')];

  const modeLabels = {
    spelling: '拼字',
    meaningToWord: '中選英',
    wordToMeaning: '英選中',
  };

  let words = [];
  let libraryWords = [];
  let ranges = [];
  let rangeMetadata = new Map();
  let examGroups = [];
  let sourceGroups = [];
  let selectedScope = 'single';
  let selectedRange = '__all__';
  let selectedExamKey = '';
  let selectedExamSource = '__all__';
  let selectedSource = '';
  let selectedCustomRanges = new Set();
  let dataState = 'loading';
  let countBeforeCollection = '10';
  let selectedMode = 'spelling';
  let questions = [];
  let currentIndex = 0;
  let answers = [];
  let wrongWords = [];
  let lastSetup = { label: '', count: '10' };
  let previewLoading = false;
  let dictionaryRedirectTimer = null;
  let quizQuota = null;
  let quotaResetTimer = null;
  let sessionStarting = false;
  let setupSubmitting = false;
  let quotaRequestVersion = 0;

  const shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[target]] = [copy[target], copy[index]];
    }
    return copy;
  };

  const normalizeAnswer = (value) => value.trim().toLocaleLowerCase().replace(/\s+/g, ' ');

  const setMessage = (element, text, tone = '') => {
    if (!element) return;
    element.textContent = text;
    if (tone) element.dataset.tone = tone;
    else delete element.dataset.tone;
  };

  const setDataStatus = (text, state = '') => {
    if (state) dataState = state;
  };

  const escapeCountLabel = (count) => `${count} 字`;
  const isRecognizedSource = (source) => source === '課本' || source === '雜誌';

  const sourceOrder = new Map([
    ['課本', 0],
    ['雜誌', 1],
  ]);

  const compareRangeItems = (left, right) => compareRangeNames(left.name, right.name);
  const compareWords = (left, right) => compareRangeNames(left.range, right.range)
    || String(left.word).localeCompare(String(right.word), 'en', { numeric: true, sensitivity: 'base' });

  const getSourceFromRange = (name) => {
    const meta = rangeMetadata.get(name);
    if (meta?.source) return meta.source;
    const match = name.match(/[(（]([^)）]+)[)）]$/);
    return match?.[1]?.trim() || '';
  };

  const rebuildGroupingIndexes = () => {
    ranges = [...ranges].sort(compareRangeItems);
    rangeMetadata = new Map(ranges.map((item) => [item.name, parseRangeName(item.name)]));
    const examMap = new Map();
    const sourceMap = new Map();

    ranges.forEach((item) => {
      const meta = rangeMetadata.get(item.name);
      const source = getSourceFromRange(item.name);
      if (source && isRecognizedSource(source)) {
        const sourceGroup = sourceMap.get(source) || { name: source, count: 0, rangeCount: 0 };
        sourceGroup.count += item.count;
        sourceGroup.rangeCount += 1;
        sourceMap.set(source, sourceGroup);
      }
      if (!meta) return;
      const group = examMap.get(meta.examKey) || {
        key: meta.examKey,
        schoolYear: meta.schoolYear,
        semester: meta.semester,
        exam: meta.exam,
        count: 0,
        rangeCount: 0,
        sourceCounts: new Map(),
      };
      group.count += item.count;
      group.rangeCount += 1;
      if (isRecognizedSource(meta.source)) group.sourceCounts.set(meta.source, (group.sourceCounts.get(meta.source) || 0) + item.count);
      examMap.set(meta.examKey, group);
    });

    const compareGroups = (left, right) => left.schoolYear - right.schoolYear
      || left.semester - right.semester
      || left.exam - right.exam;
    examGroups = [...examMap.values()].sort(compareGroups);
    sourceGroups = [...sourceMap.values()].sort((left, right) => (sourceOrder.get(left.name) ?? 99)
      - (sourceOrder.get(right.name) ?? 99)
      || left.name.localeCompare(right.name, 'zh-Hant'));
    selectedCustomRanges = new Set([...selectedCustomRanges].filter((name) => ranges.some((item) => item.name === name)));
  };

  const formatExamGroup = (group) => `${group.schoolYear}學年度／第${group.semester}學期／第${group.exam}次段考`;
  const formatFolderName = (key) => key;

  const getRangeFolders = () => {
    const folderMap = new Map();
    ranges.forEach((item) => {
      const meta = rangeMetadata.get(item.name);
      const key = meta?.examKey || '其他範圍';
      const folder = folderMap.get(key) || { key, items: [], wordCount: 0 };
      folder.items.push(item);
      folder.wordCount += item.count;
      folderMap.set(key, folder);
    });
    return [...folderMap.values()];
  };

  const formatSelectedCount = (selectedNames) => selectedNames.reduce((sum, name) => {
    const range = ranges.find((item) => item.name === name);
    return sum + (range?.count || 0);
  }, 0);

  const hasCurrentSelection = () => selectedScope === 'single'
    ? Boolean(rangeSelect?.value)
    : selectedScope === 'exam'
      ? Boolean(examSelect?.value)
      : selectedScope === 'source'
        ? Boolean(sourceSelect?.value)
        : selectedCustomRanges.size > 0;

  const updateStartAvailability = () => {
    const canStart = Boolean(ranges.length && hasCurrentSelection());
    const quotaUnavailable = !quizQuota || quizQuota.remaining === 0;
    if (startButton) startButton.disabled = !canStart || previewLoading || setupSubmitting || sessionStarting || quotaUnavailable;
    if (retryWrongButton) retryWrongButton.disabled = !wrongWords.length || sessionStarting || quotaUnavailable;
    if (previewButton) previewButton.disabled = !canStart || previewLoading;
  };

  const renderQuizQuota = (quota) => {
    if (!quota || quota.limit !== 20 || !Number.isInteger(quota.remaining)
      || quota.remaining < 0 || quota.remaining > 20 || !Number.isFinite(Date.parse(quota.resetsAt)))
      throw new Error('無法確認今日測驗額度，請重新整理後再試。');
    quizQuota = quota;
    if (quotaDisplay) quotaDisplay.textContent = quota.remaining
      ? `今日還可測驗 ${quota.remaining}／${quota.limit} 次`
      : '今日測驗已達 20 次上限；明天 00:00 重置';
    window.clearTimeout(quotaResetTimer);
    quotaResetTimer = window.setTimeout(() => { void loadQuizQuota(); },
      Math.max(1000, Date.parse(quota.resetsAt) - Date.now() + 1000));
    updateStartAvailability();
  };

  const loadQuizQuota = async () => {
    const version = ++quotaRequestVersion;
    try {
      const response = await fetch('/api/quiz/quota', { credentials: 'same-origin', cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || '無法確認測驗額度。');
      if (version !== quotaRequestVersion) return;
      renderQuizQuota(data.quota);
    } catch {
      if (version !== quotaRequestVersion) return;
      quizQuota = null;
      if (quotaDisplay) quotaDisplay.textContent = '測驗次數暫時無法確認，請重新整理後再試';
      updateStartAvailability();
    }
  };

  const invalidatePreview = () => {
    previewPanel?.classList.add('is-hidden');
    setMessage(previewMessage, '');
  };

  const renderPreview = (selectedWords, selectionLabel) => {
    if (!previewPanel || !previewList) return;
    previewPanel.classList.remove('is-hidden');
    previewContext.textContent = `目前選取：${selectionLabel}`;
    previewCount.textContent = escapeCountLabel(selectedWords.length);
    previewList.replaceChildren(...selectedWords.map((word) => {
      const card = document.createElement('article');
      card.className = 'preview-card';

      const head = document.createElement('div');
      head.className = 'preview-card__head';
      const english = document.createElement('strong');
      english.className = 'preview-card__word';
      english.textContent = word.word;
      const meta = document.createElement('span');
      meta.className = 'preview-card__meta';
      meta.textContent = [word.partOfSpeech, word.phonetic].filter(Boolean).join(' · ');
      head.append(english, meta);

      const meaning = document.createElement('p');
      meaning.className = 'preview-card__meaning';
      meaning.textContent = word.meaning || '尚未提供中文解釋';
      card.append(head, meaning);

      if (word.example) {
        const example = document.createElement('p');
        example.className = 'preview-card__example';
        example.textContent = word.example;
        card.append(example);
      }
      return card;
    }));
    previewEmptyState?.classList.toggle('is-hidden', selectedWords.length > 0);
    setMessage(previewMessage, selectedWords.length ? '可以先查看單字，再選擇題型開始練習。' : '目前沒有可預習的單字。', selectedWords.length ? '' : 'error');
    previewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const getSelectedSession = async () => {
    let selectedWords;
    let selectionLabel;
    if (dataState === 'preview') {
      if (selectedScope === 'single') {
        selectedWords = getLocalWords({ range: selectedRange });
        selectionLabel = selectedRange === '__all__' ? '全部範圍' : selectedRange;
      } else if (selectedScope === 'exam') {
        selectedWords = getLocalWords({ exam: selectedExamKey, source: selectedExamSource });
        const group = examGroups.find((item) => item.key === selectedExamKey);
        selectionLabel = `${group ? formatExamGroup(group) : selectedExamKey}${selectedExamSource !== '__all__' ? `／${selectedExamSource}` : ''}`;
      } else if (selectedScope === 'source') {
        selectedWords = getLocalWords({ source: selectedSource });
        selectionLabel = `全部${selectedSource}`;
      } else {
        selectedWords = getLocalWords({ selectedRanges: selectedCustomRanges });
        selectionLabel = `自訂組合（${selectedCustomRanges.size} 組）`;
      }
    } else if (selectedScope === 'single') {
      selectedWords = await fetchWords({ range: selectedRange });
      selectionLabel = selectedRange === '__all__' ? '全部範圍' : selectedRange;
    } else if (selectedScope === 'exam') {
      selectedWords = await fetchWords({ exam: selectedExamKey, source: selectedExamSource });
      const group = examGroups.find((item) => item.key === selectedExamKey);
      selectionLabel = `${group ? formatExamGroup(group) : selectedExamKey}${selectedExamSource !== '__all__' ? `／${selectedExamSource}` : ''}`;
    } else if (selectedScope === 'source') {
      selectedWords = await fetchWords({ source: selectedSource });
      selectionLabel = `全部${selectedSource}`;
    } else {
      const allWords = await fetchWords({ range: '__all__' });
      selectedWords = allWords.filter((word) => selectedCustomRanges.has(word.range));
      selectionLabel = `自訂組合（${selectedCustomRanges.size} 組）`;
    }
    return { words: selectedWords, label: selectionLabel };
  };

  const renderInventory = () => {
    if (!inventoryList) return;
    if (!ranges.length) {
      inventoryList.innerHTML = '<div class="empty-state"><strong>還沒有單字資料</strong><p>請由管理者登入後上傳 CSV，這裡就會出現可練習的範圍。</p></div>';
      return;
    }
    inventoryList.replaceChildren(...getRangeFolders().map((folder, folderIndex) => {
      const section = document.createElement('section');
      section.className = 'inventory-folder';
      const isExpanded = folderIndex === 0;
      const bodyId = `inventory-folder-${folderIndex}`;

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'inventory-folder__head';
      header.setAttribute('aria-expanded', String(isExpanded));
      header.setAttribute('aria-controls', bodyId);
      const folderName = document.createElement('strong');
      folderName.className = 'inventory-folder__name';
      folderName.textContent = formatFolderName(folder.key);
      const folderCount = document.createElement('span');
      folderCount.className = 'inventory-folder__count';
      folderCount.textContent = `${folder.items.length} 組／${folder.wordCount} 字`;
      header.append(folderName, folderCount);

      const body = document.createElement('div');
      body.className = 'inventory-folder__body';
      body.id = bodyId;
      if (!isExpanded) body.classList.add('is-hidden');
      header.addEventListener('click', () => {
        const expanded = header.getAttribute('aria-expanded') === 'true';
        header.setAttribute('aria-expanded', String(!expanded));
        body.classList.toggle('is-hidden', expanded);
      });
      const sourceNames = ['課本', '雜誌'];
      const sourceSections = sourceNames.map((source) => {
        const items = folder.items.filter((item) => getSourceFromRange(item.name) === source);
        if (!items.length) return null;
        const sourceSection = document.createElement('section');
        sourceSection.className = 'inventory-source';
        const sourceTitle = document.createElement('h3');
        sourceTitle.className = 'inventory-source__title';
        sourceTitle.textContent = source;
        const rows = items.map((item) => {
          const row = document.createElement('div');
          row.className = 'inventory-row';
          const name = document.createElement('span');
          name.className = 'inventory-row__name';
          name.textContent = item.name;
          const count = document.createElement('span');
          count.className = 'inventory-row__count';
          count.textContent = escapeCountLabel(item.count);
          row.append(name, count);
          return row;
        });
        sourceSection.append(sourceTitle, ...rows);
        return sourceSection;
      }).filter(Boolean);
      const otherItems = folder.items.filter((item) => !sourceNames.includes(getSourceFromRange(item.name)));
      if (otherItems.length) {
        const otherSection = document.createElement('section');
        otherSection.className = 'inventory-source';
        const otherTitle = document.createElement('h3');
        otherTitle.className = 'inventory-source__title';
        otherTitle.textContent = '其他';
        otherSection.append(otherTitle, ...otherItems.map((item) => {
          const row = document.createElement('div');
          row.className = 'inventory-row';
          const name = document.createElement('span');
          name.className = 'inventory-row__name';
          name.textContent = item.name;
          const count = document.createElement('span');
          count.className = 'inventory-row__count';
          count.textContent = escapeCountLabel(item.count);
          row.append(name, count);
          return row;
        }));
        sourceSections.push(otherSection);
      }
      body.append(...sourceSections);
      section.append(header, body);
      return section;
    }));
  };

  const renderRangeSelect = () => {
    if (!rangeSelect) return;
    rangeSelect.replaceChildren();
    if (!ranges.length) {
      const emptyOption = new Option('尚無可用範圍', '');
      emptyOption.disabled = true;
      emptyOption.selected = true;
      rangeSelect.append(emptyOption);
      if (rangeHelper) rangeHelper.textContent = '請先由管理者上傳單字表。';
      updateStartAvailability();
      return;
    }
    rangeSelect.append(new Option('全部範圍', '__all__'));
    getRangeFolders().forEach((folder) => {
      ['課本', '雜誌'].forEach((source) => {
        const items = folder.items.filter((item) => getSourceFromRange(item.name) === source);
        if (!items.length) return;
        const group = document.createElement('optgroup');
        group.label = `資料夾 ${formatFolderName(folder.key)}／${source}`;
        items.forEach((item) => group.append(new Option(`${item.name}（${item.count} 字）`, item.name)));
        rangeSelect.append(group);
      });
      const otherItems = folder.items.filter((item) => !['課本', '雜誌'].includes(getSourceFromRange(item.name)));
      if (otherItems.length) {
        const group = document.createElement('optgroup');
        group.label = `資料夾 ${formatFolderName(folder.key)}／其他`;
        otherItems.forEach((item) => group.append(new Option(`${item.name}（${item.count} 字）`, item.name)));
        rangeSelect.append(group);
      }
    });
    rangeSelect.value = ranges.some((item) => item.name === selectedRange) || selectedRange === '__all__' ? selectedRange : '__all__';
    selectedRange = rangeSelect.value || '__all__';
    if (rangeHelper) rangeHelper.textContent = `${ranges.reduce((sum, item) => sum + item.count, 0)} 個單字可供練習。`;
    updateStartAvailability();
  };

  const renderExamSourceSelect = () => {
    if (!examSourceSelect) return;
    examSourceSelect.replaceChildren();
    const group = examGroups.find((item) => item.key === selectedExamKey);
    if (!group) {
      examSourceSelect.append(new Option('尚無來源', '__all__'));
      examSourceSelect.disabled = true;
      return;
    }
    examSourceSelect.disabled = false;
    examSourceSelect.append(new Option(`全部來源（${group.count} 字）`, '__all__'));
    [...group.sourceCounts.entries()]
      .sort(([left], [right]) => (sourceOrder.get(left) ?? 99) - (sourceOrder.get(right) ?? 99)
        || left.localeCompare(right, 'zh-Hant'))
      .forEach(([source, count]) => examSourceSelect.append(new Option(`${source}（${count} 字）`, source)));
    if (![...examSourceSelect.options].some((option) => option.value === selectedExamSource)) selectedExamSource = '__all__';
    examSourceSelect.value = selectedExamSource;
  };

  const renderExamSelect = () => {
    if (!examSelect) return;
    examSelect.replaceChildren();
    if (!examGroups.length) {
      const emptyOption = new Option('尚無可辨識的段考編號', '');
      emptyOption.disabled = true;
      emptyOption.selected = true;
      examSelect.append(emptyOption);
      examSelect.disabled = true;
      if (examHelper) examHelper.textContent = '請使用「學年度-學期-段考-課次(課本或雜誌)」格式命名範圍。';
      renderExamSourceSelect();
      updateStartAvailability();
      return;
    }
    examSelect.disabled = false;
    examGroups.forEach((group) => {
      examSelect.append(new Option(`${formatExamGroup(group)}（${group.rangeCount} 組，${group.count} 字）`, group.key));
    });
    if (!examGroups.some((group) => group.key === selectedExamKey)) selectedExamKey = examGroups[0].key;
    examSelect.value = selectedExamKey;
    renderExamSourceSelect();
    if (examHelper) {
      const group = examGroups.find((item) => item.key === selectedExamKey);
      examHelper.textContent = group
        ? `${formatExamGroup(group)}（資料夾 ${group.key}）共 ${group.rangeCount} 組、${group.count} 個單字。組合模式預設練習全部單字，也可以在下方調整題數。`
        : '依編號前三段自動合併同一場段考的所有課次。';
    }
    updateStartAvailability();
  };

  const renderSourceSelect = () => {
    if (!sourceSelect) return;
    sourceSelect.replaceChildren();
    if (!sourceGroups.length) {
      const emptyOption = new Option('尚無可辨識的來源', '');
      emptyOption.disabled = true;
      emptyOption.selected = true;
      sourceSelect.append(emptyOption);
      sourceSelect.disabled = true;
      if (sourceHelper) sourceHelper.textContent = '範圍名稱最後請加上「(課本)」或「(雜誌)」。';
      updateStartAvailability();
      return;
    }
    sourceSelect.disabled = false;
    sourceGroups.forEach((group) => sourceSelect.append(new Option(`${group.name}（${group.rangeCount} 組，${group.count} 字）`, group.name)));
    if (!sourceGroups.some((group) => group.name === selectedSource)) selectedSource = sourceGroups[0].name;
    sourceSelect.value = selectedSource;
    if (sourceHelper) sourceHelper.textContent = '會合併所有段考與課次中，同一個括號來源的單字。';
    updateStartAvailability();
  };

  const createRangeCheck = (item) => {
    const label = document.createElement('label');
    label.className = 'range-check';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = item.name;
    checkbox.checked = selectedCustomRanges.has(item.name);
    checkbox.setAttribute('aria-label', `選擇 ${item.name}`);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedCustomRanges.add(item.name);
      else selectedCustomRanges.delete(item.name);
      renderCustomHelper();
      updateStartAvailability();
    });
    const name = document.createElement('span');
    name.className = 'range-check__name';
    name.textContent = item.name;
    const count = document.createElement('span');
    count.className = 'range-check__count';
    count.textContent = escapeCountLabel(item.count);
    label.append(checkbox, name, count);
    return label;
  };

  const renderCustomRanges = () => {
    if (!rangeChecklist) return;
    rangeChecklist.replaceChildren();
    if (!ranges.length) {
      rangeChecklist.innerHTML = '<div class="empty-state"><strong>尚無可選課次</strong><p>請先由管理者上傳單字表。</p></div>';
      if (customHelper) customHelper.textContent = '可跨學年度、段考與課本／雜誌自由組合。';
      updateStartAvailability();
      return;
    }
    getRangeFolders().forEach((folder, folderIndex) => {
      const details = document.createElement('section');
      details.className = 'range-check-folder';
      const isExpanded = folderIndex === 0;
      const bodyId = `range-check-folder-${folderIndex}`;
      const summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'range-check-folder__head';
      summary.setAttribute('aria-expanded', String(isExpanded));
      summary.setAttribute('aria-controls', bodyId);
      const name = document.createElement('strong');
      name.textContent = formatFolderName(folder.key);
      const count = document.createElement('span');
      count.textContent = `${folder.items.length} 組`;
      summary.append(name, count);
      const body = document.createElement('div');
      body.className = 'range-check-folder__body';
      body.id = bodyId;
      if (!isExpanded) body.classList.add('is-hidden');
      summary.addEventListener('click', () => {
        const expanded = summary.getAttribute('aria-expanded') === 'true';
        summary.setAttribute('aria-expanded', String(!expanded));
        body.classList.toggle('is-hidden', expanded);
      });
      ['課本', '雜誌'].forEach((source) => {
        const items = folder.items.filter((item) => getSourceFromRange(item.name) === source);
        if (!items.length) return;
        const sourceSection = document.createElement('section');
        sourceSection.className = 'range-check-source';
        const sourceTitle = document.createElement('h3');
        sourceTitle.textContent = source;
        sourceSection.append(sourceTitle, ...items.map(createRangeCheck));
        body.append(sourceSection);
      });
      details.append(summary, body);
      rangeChecklist.append(details);
    });
    renderCustomHelper();
    updateStartAvailability();
  };

  const renderCustomHelper = () => {
    if (!customHelper) return;
    if (!selectedCustomRanges.size) {
      customHelper.textContent = '可跨學年度、段考與課本／雜誌自由組合。';
      return;
    }
    customHelper.textContent = `已選 ${selectedCustomRanges.size} 組課次，共 ${formatSelectedCount([...selectedCustomRanges])} 個單字。`;
  };

  const renderScopeFields = () => {
    Object.entries(scopeFields).forEach(([scope, element]) => element?.classList.toggle('is-hidden', scope !== selectedScope));
    scopeButtons.forEach((button) => {
      const selected = button.dataset.scope === selectedScope;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const helperText = {
      single: '單篇：選擇一個課次，或直接練習全部範圍。',
      exam: '段考：依編號前三段合併同一場段考，可再篩選課本或雜誌。',
      source: '課本／雜誌：跨所有段考與課次，單獨練習同一個來源。',
      custom: '自訂組合：自由勾選任意課次，跨學年度、段考與來源都可以。',
    };
    if (scopeHelper) scopeHelper.textContent = helperText[selectedScope];
    updateStartAvailability();
  };

  const usePreview = () => {
    libraryWords = previewWords;
    words = libraryWords;
    const grouped = new Map();
    words.forEach((word) => grouped.set(word.range, (grouped.get(word.range) || 0) + 1));
    ranges = [...grouped.entries()].map(([name, count]) => ({ name, count }));
    rebuildGroupingIndexes();
    setDataStatus('預覽資料／尚未連線到 D1', 'preview');
  };

  const loadInventory = async () => {
    try {
      const response = await fetch('/api/words', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Words API unavailable');
      const payload = await response.json();
      ranges = Array.isArray(payload.ranges) ? payload.ranges : [];
      libraryWords = [];
      words = [];
      rebuildGroupingIndexes();
      setDataStatus(ranges.length ? 'D1 資料／可開始練習' : 'D1 資料／等待上傳', ranges.length ? 'ready' : 'empty');
    } catch {
      usePreview();
    }
    renderRangeSelect();
    renderExamSelect();
    renderSourceSelect();
    renderCustomRanges();
    renderInventory();
  };

  const fetchWords = async ({ range = '', exam = '', source = '' } = {}) => {
    const params = new URLSearchParams();
    if (range) params.set('range', range);
    if (exam) params.set('exam', exam);
    if (source && source !== '__all__') params.set('source', source);
    const query = params.toString() ? `?${params.toString()}` : '';
    const response = await fetch(`/api/words${query}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to load words');
    const payload = await response.json();
    return Array.isArray(payload.words) ? payload.words : [];
  };

  const getLocalWords = ({ range = '__all__', exam = '', source = '', selectedRanges = null } = {}) => libraryWords.filter((word) => {
    if (selectedRanges && !selectedRanges.has(word.range)) return false;
    if (!selectedRanges && range !== '__all__' && word.range !== range) return false;
    const meta = rangeMetadata.get(word.range);
    if (exam && meta?.examKey !== exam) return false;
    if (source && source !== '__all__' && getSourceFromRange(word.range) !== source) return false;
    return true;
  });

  const getLocalSearchWords = (query) => {
    const needle = normalizeAnswer(query);
    return libraryWords.filter((word) => [word.word, word.meaning, word.example, word.range]
      .some((value) => normalizeAnswer(String(value || '')).includes(needle)))
      .sort(compareWords)
      .slice(0, 100);
  };

  const fetchSearchWords = async (query) => {
    if (dataState === 'preview') return getLocalSearchWords(query);
    const response = await fetch(`/api/words?q=${encodeURIComponent(query)}`, { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Unable to search words');
    const payload = await response.json();
    return Array.isArray(payload.words) ? payload.words : [];
  };

  const cambridgeUrl = (query) => `https://dictionary.cambridge.org/dictionary/english/${encodeURIComponent(query.trim())}`;
  const isEnglishDictionaryQuery = (query) => /^[A-Za-z][A-Za-z'’ -]*$/u.test(query.trim());

  const cancelDictionaryRedirect = () => {
    if (dictionaryRedirectTimer === null) return;
    window.clearTimeout(dictionaryRedirectTimer);
    dictionaryRedirectTimer = null;
  };

  const resetSearchResults = () => {
    cancelDictionaryRedirect();
    searchResults?.replaceChildren();
    searchEmptyState?.classList.add('is-hidden');
    if (searchCount) searchCount.textContent = '尚未搜尋';
  };

  const renderSearchResults = (resultWords, query) => {
    if (!searchResults) return;
    const renderResultRow = (word) => {
      const row = document.createElement('article');
      row.className = 'search-result';

      const main = document.createElement('div');
      main.className = 'search-result__main';
      const head = document.createElement('div');
      head.className = 'search-result__head';
      const english = document.createElement('strong');
      english.className = 'search-result__word';
      english.textContent = word.word;
      const meta = document.createElement('span');
      meta.className = 'search-result__meta';
      meta.textContent = [word.partOfSpeech, word.phonetic].filter(Boolean).join(' · ');
      head.append(english, meta);

      const meaning = document.createElement('p');
      meaning.className = 'search-result__meaning';
      meaning.textContent = word.meaning || '尚未提供中文解釋';
      const range = document.createElement('p');
      range.className = 'search-result__range';
      range.textContent = `範圍：${word.range}`;
      main.append(head, meaning, range);

      const actions = document.createElement('div');
      actions.className = 'search-result__actions';
      const selectRangeButton = document.createElement('button');
      selectRangeButton.className = 'button button--quiet';
      selectRangeButton.type = 'button';
      selectRangeButton.textContent = '選此課次';
      selectRangeButton.setAttribute('aria-label', `選取 ${word.range} 進行練習`);
      selectRangeButton.addEventListener('click', () => {
        setScopeMode('single');
        selectedRange = word.range;
        if (rangeSelect) rangeSelect.value = word.range;
        invalidatePreview();
        updateStartAvailability();
        setMessage(setupMessage, `已選取 ${word.range}，可以預習或開始練習。`);
        setupPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      actions.append(selectRangeButton);
      row.append(main, actions);
      return row;
    };
    const orderedResults = [...resultWords].sort(compareWords);
    const resultGroups = new Map();
    orderedResults.forEach((word) => {
      const source = getSourceFromRange(word.range) || '其他';
      const group = resultGroups.get(source) || [];
      group.push(word);
      resultGroups.set(source, group);
    });
    if (resultGroups.size > 1) {
      const orderedSources = [...resultGroups.keys()].sort((left, right) => (sourceOrder.get(left) ?? 99)
        - (sourceOrder.get(right) ?? 99)
        || left.localeCompare(right, 'zh-Hant'));
      searchResults.replaceChildren(...orderedSources.map((source) => {
        const group = document.createElement('section');
        group.className = 'search-result-group';
        const heading = document.createElement('h3');
        heading.className = 'search-result-group__title';
        heading.textContent = source;
        group.append(heading, ...resultGroups.get(source).map(renderResultRow));
        return group;
      }));
    } else {
      searchResults.replaceChildren(...orderedResults.map(renderResultRow));
    }
    searchEmptyState?.classList.toggle('is-hidden', resultWords.length > 0);
    if (!resultWords.length && searchEmptyState) {
      const title = document.createElement('strong');
      title.textContent = '站內找不到這個單字。';
      const note = document.createElement('p');
      note.textContent = isEnglishDictionaryQuery(query)
        ? '即將開啟 Cambridge Dictionary 搜尋。若沒有自動跳轉，也可以按下方連結。'
        : '可以改用英文單字搜尋，或按下方連結前往 Cambridge Dictionary。';
      const link = document.createElement('a');
      link.className = 'button button--quiet dictionary-fallback';
      link.href = cambridgeUrl(query);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = '前往 Cambridge Dictionary';
      searchEmptyState.replaceChildren(title, note, link);
      cancelDictionaryRedirect();
      if (isEnglishDictionaryQuery(query)) {
        dictionaryRedirectTimer = window.setTimeout(() => {
          dictionaryRedirectTimer = null;
          window.location.assign(cambridgeUrl(query));
        }, 180);
      }
    }
    if (searchCount) searchCount.textContent = `${resultWords.length}${resultWords.length >= 100 ? '+' : ''} 筆結果`;
    setMessage(
      searchMessage,
      resultWords.length
        ? `找到 ${resultWords.length}${resultWords.length >= 100 ? ' 筆以上' : ''} 個包含「${query}」的結果。`
        : isEnglishDictionaryQuery(query) ? `站內沒有「${query}」，正在開啟 Cambridge Dictionary。` : `找不到「${query}」相關單字。`,
      resultWords.length ? '' : 'error',
    );
  };

  const loadPageViewCount = async () => {
    if (!pageViewCount) return;
    try {
      const response = await fetch('/api/stats', { credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) throw new Error('Page view API unavailable');
      const payload = await response.json();
      const views = Number(payload.views);
      pageViewCount.textContent = Number.isFinite(views)
        ? `瀏覽次數：${views.toLocaleString('zh-Hant-TW')}`
        : '瀏覽次數：—';
    } catch {
      pageViewCount.textContent = '瀏覽次數：暫不可用';
    }
  };

  const hideFeedback = () => {
    if (!feedback) return;
    feedback.classList.add('is-hidden');
    feedback.textContent = '';
    delete feedback.dataset.tone;
  };

  const renderFeedback = (isCorrect, expected, answer) => {
    if (!feedback) return;
    feedback.classList.remove('is-hidden');
    feedback.dataset.tone = isCorrect ? 'correct' : 'wrong';
    if (isCorrect) {
      feedback.textContent = '答對了。繼續保持這個節奏。';
    } else {
      feedback.textContent = `正確答案是「${expected}」。你填的是「${answer || '未作答'}」。`;
    }
  };

  const questionOptions = (question, answerKey) => {
    const unique = new Map();
    words.forEach((word) => unique.set(word[answerKey], word));
    const distractors = shuffle([...unique.values()].filter((word) => word.id !== question.id)).slice(0, 3);
    return shuffle([question, ...distractors]);
  };

  const createSpellingAnswer = (question) => {
    const form = document.createElement('form');
    form.className = 'answer-form';
    form.setAttribute('aria-label', '輸入英文答案');
    const field = document.createElement('label');
    field.className = 'field';
    const label = document.createElement('span');
    label.textContent = '英文拼字';
    const input = document.createElement('input');
    input.className = 'input';
    input.type = 'text';
    input.autocomplete = 'off';
    input.autocapitalize = 'none';
    input.spellcheck = false;
    input.required = true;
    input.maxLength = 120;
    input.placeholder = '輸入英文單字';
    input.setAttribute('aria-label', '輸入英文單字');
    const helper = document.createElement('span');
    helper.className = 'field__helper';
    helper.textContent = '按 Enter 送出答案。';
    field.append(label, input, helper);
    const submit = document.createElement('button');
    submit.className = 'button button--dark';
    submit.type = 'submit';
    submit.innerHTML = '確認答案 <span aria-hidden="true">→</span>';
    form.append(field, submit);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      gradeQuestion(input.value, question.word, input, submit);
    });
    answerArea?.append(form);
    input.focus({ preventScroll: true });
  };

  const createChoiceAnswer = (question, key, prompt) => {
    const list = document.createElement('div');
    list.className = 'choice-list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', prompt);
    questionOptions(question, key).forEach((option) => {
      const button = document.createElement('button');
      button.className = 'choice-button';
      button.type = 'button';
      button.textContent = option[key];
      button.title = option[key];
      button.dataset.optionId = option.id;
      button.addEventListener('click', () => {
        gradeQuestion(option[key], question[key], null, null, option.id);
      });
      list.append(button);
    });
    answerArea?.append(list);
  };

  const renderQuestion = () => {
    const question = questions[currentIndex];
    if (!question || !answerArea) return;
    practiceTitle.textContent = `第 ${currentIndex + 1} 題／共 ${questions.length} 題`;
    questionMode.textContent = modeLabels[selectedMode];
    progressBar.style.width = `${Math.round((currentIndex / questions.length) * 100)}%`;
    promptDetail.textContent = question.partOfSpeech || question.phonetic ? [question.partOfSpeech, question.phonetic].filter(Boolean).join(' · ') : '';
    const presentation = questionPresentation(question);
    questionSource.textContent = presentation.source;
    questionHint.textContent = presentation.mask;
    questionHint.setAttribute('aria-label', `首尾字母提示：${presentation.mask}`);
    questionLetterCount.textContent = presentation.countLabel;
    answerArea.replaceChildren();
    nextButton.classList.add('is-hidden');
    hideFeedback();

    if (selectedMode === 'spelling') {
      promptLabel.textContent = '看中文，輸入英文';
      promptValue.textContent = question.meaning;
      createSpellingAnswer(question);
    } else if (selectedMode === 'meaningToWord') {
      promptLabel.textContent = '看中文，選出英文';
      promptValue.textContent = question.meaning;
      createChoiceAnswer(question, 'word', '選擇正確英文');
    } else {
      promptLabel.textContent = '看英文，選出中文';
      promptValue.textContent = question.word;
      createChoiceAnswer(question, 'meaning', '選擇正確中文');
    }
  };

  const gradeQuestion = (answer, expected, input, submit, selectedId) => {
    if (answers[currentIndex]) return;
    const question = questions[currentIndex];
    const normalizedAnswer = normalizeAnswer(answer);
    const normalizedExpected = normalizeAnswer(expected);
    const isCorrect = selectedId ? selectedId === question.id : normalizedAnswer === normalizedExpected;
    answers[currentIndex] = { question, answer, expected, isCorrect };
    if (!isCorrect && !wrongWords.some((word) => word.id === question.id)) wrongWords.push(question);
    if (input) {
      input.disabled = true;
      input.setAttribute('aria-invalid', String(!isCorrect));
    }
    if (submit) submit.disabled = true;
    document.querySelectorAll('.choice-button').forEach((button) => {
      button.disabled = true;
      if (button.dataset.optionId === question.id) button.classList.add('is-correct');
      if (button.dataset.optionId === selectedId && !isCorrect) button.classList.add('is-wrong');
    });
    renderFeedback(isCorrect, expected, answer);
    nextButton.classList.remove('is-hidden');
    nextButton.textContent = currentIndex === questions.length - 1 ? '查看結果 →' : '下一題 →';
    progressBar.style.width = `${Math.round(((currentIndex + 1) / questions.length) * 100)}%`;
    nextButton.focus({ preventScroll: true });
  };

  const startSession = async (sessionWords, rangeLabel, countLabel) => {
    if (sessionStarting) return false;
    if (!sessionWords.length) {
      setMessage(setupMessage, '這個範圍目前沒有單字，請先上傳資料。', 'error');
      return false;
    }
    sessionStarting = true;
    updateStartAvailability();
    try {
      const response = await fetch('/api/quiz/start', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mode: selectedMode }),
      });
      const data = await response.json();
      if (data.quota) {
        quotaRequestVersion += 1;
        renderQuizQuota(data.quota);
      }
      if (!response.ok || !data.sessionId) throw new Error(data.error || '目前無法開始測驗，請稍後再試。');
      words = sessionWords;
      lastSetup = { label: rangeLabel, count: countLabel };
      questions = shuffle(sessionWords).slice(0, countLabel === 'all' ? sessionWords.length : Number(countLabel));
      currentIndex = 0;
      answers = [];
      wrongWords = [];
      practiceContext.textContent = `PRACTICE / ${rangeLabel === '__all__' ? 'ALL RANGES' : rangeLabel.toUpperCase()}`;
      setupPanel.classList.add('is-hidden');
      previewPanel?.classList.add('is-hidden');
      resultPanel.classList.add('is-hidden');
      practicePanel.classList.remove('is-hidden');
      renderQuestion();
      practicePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return true;
    } finally {
      sessionStarting = false;
      updateStartAvailability();
    }
  };

  const endSession = () => {
    practicePanel.classList.add('is-hidden');
    resultPanel.classList.remove('is-hidden');
    const total = answers.length;
    const correct = answers.filter((answer) => answer.isCorrect).length;
    resultTotal.textContent = String(total);
    resultCorrect.textContent = String(correct);
    resultRate.textContent = total ? `${Math.round((correct / total) * 100)}%` : '—';
    wrongCount.textContent = `${wrongWords.length} 題`;
    resultNote.textContent = wrongWords.length ? '錯題已整理在下方，可以只重練這些單字。' : '這次沒有錯題，可以換個範圍或題型繼續。';
    updateStartAvailability();
    wrongList.replaceChildren(...wrongWords.map((word) => {
      const row = document.createElement('li');
      row.className = 'wrong-row';
      const english = document.createElement('span');
      english.className = 'wrong-row__word';
      english.textContent = word.word;
      const chinese = document.createElement('span');
      chinese.className = 'wrong-row__meaning';
      chinese.append(document.createTextNode(word.meaning));
      if (word.example) {
        chinese.append(document.createElement('br'));
        const exampleLabel = document.createElement('strong');
        exampleLabel.textContent = '例句：';
        chinese.append(exampleLabel, document.createTextNode(word.example));
      }
      row.append(english, chinese);
      return row;
    }));
    noWrongState.classList.toggle('is-hidden', wrongWords.length > 0);
    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  modeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedMode = button.dataset.mode;
      modeButtons.forEach((item) => {
        const selected = item === button;
        item.classList.toggle('is-selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      });
    });
  });

  const setScopeMode = (scope) => {
    if (!scopeFields[scope] || scope === selectedScope) return;
    if (selectedScope === 'single' && scope !== 'single') {
      countBeforeCollection = countSelect?.value || '10';
      if (countSelect) countSelect.value = 'all';
    } else if (scope === 'single' && selectedScope !== 'single' && countSelect?.value === 'all') {
      countSelect.value = countBeforeCollection;
    }
    selectedScope = scope;
    invalidatePreview();
    renderScopeFields();
  };

  scopeButtons.forEach((button) => {
    button.addEventListener('click', () => setScopeMode(button.dataset.scope));
  });

  rangeSelect?.addEventListener('change', () => {
    selectedRange = rangeSelect.value || '__all__';
    invalidatePreview();
    updateStartAvailability();
  });

  examSelect?.addEventListener('change', () => {
    selectedExamKey = examSelect.value;
    selectedExamSource = '__all__';
    invalidatePreview();
    renderExamSourceSelect();
    const group = examGroups.find((item) => item.key === selectedExamKey);
    if (examHelper) examHelper.textContent = group
      ? `${formatExamGroup(group)}共 ${group.rangeCount} 組、${group.count} 個單字。組合模式預設練習全部單字，也可以在下方調整題數。`
      : '依編號前三段自動合併同一場段考的所有課次。';
    updateStartAvailability();
  });

  examSourceSelect?.addEventListener('change', () => {
    selectedExamSource = examSourceSelect.value || '__all__';
    invalidatePreview();
    updateStartAvailability();
  });

  sourceSelect?.addEventListener('change', () => {
    selectedSource = sourceSelect.value;
    invalidatePreview();
    updateStartAvailability();
  });

  selectAllRanges?.addEventListener('click', () => {
    selectedCustomRanges = new Set(ranges.map((item) => item.name));
    invalidatePreview();
    renderCustomRanges();
  });

  clearRanges?.addEventListener('click', () => {
    selectedCustomRanges.clear();
    invalidatePreview();
    renderCustomRanges();
  });

  searchForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = searchInput?.value.trim() || '';
    if (!query) {
      resetSearchResults();
      setMessage(searchMessage, '請輸入英文、中文或課次名稱。', 'error');
      searchInput?.focus({ preventScroll: true });
      return;
    }
    searchButton.disabled = true;
    searchButton.classList.add('button--loading');
    clearSearchButton?.classList.remove('is-hidden');
    setMessage(searchMessage, '正在搜尋單字……');
    try {
      const resultWords = await fetchSearchWords(query);
      renderSearchResults(resultWords, query);
    } catch {
      resetSearchResults();
      setMessage(searchMessage, '目前無法搜尋單字，請稍後再試。', 'error');
    } finally {
      searchButton.disabled = false;
      searchButton.classList.remove('button--loading');
    }
  });

  clearSearchButton?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    clearSearchButton.classList.add('is-hidden');
    resetSearchResults();
    setMessage(searchMessage, '');
    searchInput?.focus({ preventScroll: true });
  });

  previewButton?.addEventListener('click', async () => {
    if (previewButton.disabled) return;
    previewLoading = true;
    previewButton.classList.add('button--loading');
    setMessage(previewMessage, '正在整理單字……');
    try {
      const { words: selectedWords, label: selectionLabel } = await getSelectedSession();
      renderPreview(selectedWords, selectionLabel);
    } catch {
      setMessage(previewMessage, '目前無法讀取單字，請稍後再試。', 'error');
    } finally {
      previewLoading = false;
      previewButton.classList.remove('button--loading');
      updateStartAvailability();
    }
  });

  closePreviewButton?.addEventListener('click', () => {
    previewPanel?.classList.add('is-hidden');
    setMessage(previewMessage, '');
    previewButton?.focus({ preventScroll: true });
  });

  setupForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (setupSubmitting || sessionStarting || !quizQuota || quizQuota.remaining === 0) return;
    setupSubmitting = true;
    const count = countSelect.value || '10';
    startButton.disabled = true;
    startButton.classList.add('button--loading');
    setMessage(setupMessage, '正在準備題目……');
    try {
      const { words: selectedWords, label: selectionLabel } = await getSelectedSession();
      if (await startSession(selectedWords, selectionLabel, count)) setMessage(setupMessage, '');
    } catch (error) {
      setMessage(setupMessage, error.message || '目前無法開始測驗，請稍後再試。', 'error');
    } finally {
      setupSubmitting = false;
      startButton.classList.remove('button--loading');
      updateStartAvailability();
    }
  });

  nextButton?.addEventListener('click', () => {
    if (!answers[currentIndex]) return;
    if (currentIndex === questions.length - 1) endSession();
    else {
      currentIndex += 1;
      renderQuestion();
    }
  });

  quitButton?.addEventListener('click', () => {
    practicePanel.classList.add('is-hidden');
    setupPanel.classList.remove('is-hidden');
    setMessage(setupMessage, '已離開這次練習。');
    setupPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  retryWrongButton?.addEventListener('click', async () => {
    if (!wrongWords.length || sessionStarting || !quizQuota || quizQuota.remaining === 0) return;
    setMessage(retryMessage, '正在確認測驗額度……');
    try {
      await startSession(wrongWords, lastSetup.label, String(wrongWords.length));
      setMessage(retryMessage, '');
    } catch (error) {
      setMessage(retryMessage, error.message || '目前無法開始測驗，請稍後再試。', 'error');
    }
  });

  newPracticeButton?.addEventListener('click', () => {
    resultPanel.classList.add('is-hidden');
    setupPanel.classList.remove('is-hidden');
    setMessage(setupMessage, '已回到練習設定。');
    setupPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  void loadInventory();
  void loadPageViewCount();
  void loadQuizQuota();
  window.addEventListener('focus', () => { if (!sessionStarting && !setupSubmitting) void loadQuizQuota(); });
}
