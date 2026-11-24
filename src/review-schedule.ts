import { dateKey, nextDate, type Entry } from "./data";

export const reviewIntervals = [1, 2, 4, 7, 15, 30, 60] as const;
const dayMs = 86400000;

export function nextReview(entry: Entry, passed: boolean, now = new Date()) {
  const today = dateKey(now);
  const advance = passed && (!entry.due || entry.due <= today);
  const stage = passed
    ? Math.min(advance ? (entry.reviewed ? entry.stage + 1 : 0) : entry.stage, reviewIntervals.length - 1)
    : 0;
  const due = passed && !advance ? entry.due : nextDate(reviewIntervals[stage], now);
  const reviewLog = [
    ...(entry.reviewLog ?? []),
    {at:now.toISOString(), passed, stage, due},
  ].slice(-60);
  return {stage, due, reviewed:today, reviewLog};
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / dayMs);
}

// Illustrative exponential model. The scheduled interval is the point at
// which the model reaches 60%; observed accuracy is tracked separately.
export function exampleRetention(elapsedDays: number, intervalDays: number) {
  return Math.pow(0.6, Math.max(0,elapsedDays) / Math.max(1,intervalDays));
}
