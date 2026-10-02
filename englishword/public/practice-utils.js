/** Parse regular lessons and review lessons such as R1 into the same exam folder. */
export const parseRangeName = (name) => {
  const match = String(name).match(/^(\d{3})-([12])-(\d+)-(R?\d+)[(（]([^)）]+)[)）]$/i);
  if (!match || !match[5].trim()) return null;
  const lessonLabel = match[4].toUpperCase();
  const isReview = lessonLabel.startsWith('R');
  return {
    schoolYear: Number(match[1]), semester: Number(match[2]), exam: Number(match[3]),
    lesson: Number(isReview ? lessonLabel.slice(1) : lessonLabel),
    lessonLabel, isReview, source: match[5].trim(),
    examKey: `${match[1]}-${match[2]}-${match[3]}`,
  };
};

const sourceOrder = new Map([['課本', 0], ['雜誌', 1]]);
const compareText = (left, right) => String(left).localeCompare(String(right), 'zh-Hant', { numeric: true, sensitivity: 'base' });

export const compareRangeNames = (leftName, rightName) => {
  const left = parseRangeName(leftName);
  const right = parseRangeName(rightName);
  if (!left || !right) {
    if (left && !right) return -1;
    if (!left && right) return 1;
    return compareText(leftName, rightName);
  }
  return left.schoolYear - right.schoolYear
    || left.semester - right.semester
    || left.exam - right.exam
    || (sourceOrder.get(left.source) ?? 99) - (sourceOrder.get(right.source) ?? 99)
    || compareText(left.source, right.source)
    || Number(left.isReview) - Number(right.isReview)
    || left.lesson - right.lesson;
};

/** Each underscore represents one hidden letter; spaces and punctuation stay visible. */
export const spellingHint = (value) => {
  const lengths = [];
  const mask = String(value || '').replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, (token) => {
    const chars = [...token];
    const letters = chars.map((char, index) => /[A-Za-z]/.test(char) ? index : -1).filter(index => index >= 0);
    lengths.push(letters.length);
    const first = letters[0];
    const last = letters.at(-1);
    return chars.map((char, index) => /[A-Za-z]/.test(char) && index !== first && index !== last ? '_' : char).join('');
  });
  const letterCount = lengths.reduce((sum, length) => sum + length, 0);
  const countLabel = lengths.length > 1
    ? `共 ${letterCount} 個字母 · ${lengths.length} 個單字（${lengths.join('＋')}）`
    : `${letterCount} 個字母`;
  return { mask, letterCount, wordLengths: lengths, countLabel };
};

/** Source is taken from the current word, never from the overall selected scope. */
export const questionPresentation = (question) => ({
  source: `來源：${String(question.range || '').trim() || '未標示來源'}`,
  ...spellingHint(question.word),
});
