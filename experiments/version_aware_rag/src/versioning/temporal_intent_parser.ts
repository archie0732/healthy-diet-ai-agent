import { TemporalIntent } from '../retrieval/types';

export function parseTemporalIntent(question: string): TemporalIntent {
  const qLower = question.toLowerCase();

  // Find four-digit years in question (e.g. 2010, 2015, 2020, 2025)
  const yearMatches = question.match(/\b(19\d{2}|20\d{2})\b/g);
  const years = yearMatches ? Array.from(new Set(yearMatches.map(y => parseInt(y, 10)))).sort((a, b) => a - b) : [];

  // Check comparison cues
  const isComparison =
    years.length >= 2 ||
    /\b(compared to|versus|vs|difference between|change from|changes between)\b/i.test(qLower);

  if (isComparison && years.length >= 2) {
    return { type: 'comparison', years };
  }

  // Check explicit historical cues or explicit target year
  const isHistoricalCue = /\b(what was|historical|previous|earlier|former|originally|past|prior|in \d{4})\b/i.test(qLower);

  if (years.length === 1) {
    const year = years[0];
    if (isHistoricalCue || year < 2024) {
      return { type: 'historical', targetYear: year };
    }
  }

  if (isHistoricalCue && years.length > 0) {
    return { type: 'historical', targetYear: years[0] };
  }

  // Check current cues
  const isCurrentCue = /\b(current|latest|present|today|now|2025|2026)\b/i.test(qLower);
  if (isCurrentCue && years.length <= 1) {
    return { type: 'current' };
  }

  if (years.length === 1 && years[0] >= 2024) {
    return { type: 'current' };
  }

  return { type: 'unspecified' };
}
