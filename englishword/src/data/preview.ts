export type PreviewWord = {
  id: string;
  range: string;
  word: string;
  meaning: string;
  example: string;
  phonetic: string;
  partOfSpeech: string;
};

export const previewWords: PreviewWord[] = [
  {
    id: 'preview-adapt',
    range: '預覽資料',
    word: 'adapt',
    meaning: '適應；調整',
    example: 'We need to adapt to the new schedule.',
    phonetic: 'əˈdæpt',
    partOfSpeech: 'verb',
  },
  {
    id: 'preview-curious',
    range: '預覽資料',
    word: 'curious',
    meaning: '好奇的',
    example: 'She is curious about how it works.',
    phonetic: 'ˈkjʊəriəs',
    partOfSpeech: 'adjective',
  },
  {
    id: 'preview-precise',
    range: '預覽資料',
    word: 'precise',
    meaning: '精確的',
    example: 'Please give a precise answer.',
    phonetic: 'prɪˈsaɪs',
    partOfSpeech: 'adjective',
  },
  {
    id: 'preview-recall',
    range: '預覽資料',
    word: 'recall',
    meaning: '回想；記起',
    example: 'Can you recall the key idea?',
    phonetic: 'rɪˈkɔːl',
    partOfSpeech: 'verb',
  },
  {
    id: 'preview-revise',
    range: '預覽資料',
    word: 'revise',
    meaning: '複習；修訂',
    example: 'I revise my notes every Friday.',
    phonetic: 'rɪˈvaɪz',
    partOfSpeech: 'verb',
  },
  {
    id: 'preview-steady',
    range: '預覽資料',
    word: 'steady',
    meaning: '穩定的；持續的',
    example: 'A steady routine makes practice easier.',
    phonetic: 'ˈstedi',
    partOfSpeech: 'adjective',
  },
];
