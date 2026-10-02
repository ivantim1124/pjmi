export type ParsedRangeName = {
  schoolYear: number;
  semester: number;
  exam: number;
  lesson: number;
  lessonLabel: string;
  isReview: boolean;
  source: string;
  examKey: string;
};

// Keep API ordering and browser folder grouping on the same implementation.
export { parseRangeName, compareRangeNames } from '../public/practice-utils.js';
