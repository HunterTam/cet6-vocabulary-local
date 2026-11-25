import { dateKey, firstAnswer, type Entry } from "./data";
import { bookExamples1To3 } from "./book-examples-1-3";
import { readingExamples } from "./reading-examples";

export type Mode = "spelling" | "recognize" | "recall";
export type Card = { entry: Entry; term: string; meaning: string; pronunciation: string; example: string; category: string; source: string };

export function vocabulary(entries: Entry[]): Card[] {
  return entries.flatMap(entry => {
    if (entry.kind !== "note") return [];
    const fields = entry.fields;
    const category = fields.category === "词汇" ? "单词" : fields.category || "单词";
    if (["解题规律", "可迁移规律"].includes(category) || !fields.title) return [];
    const [first = "", ...rest] = (fields.body || "").split("\n");
    const rawPron = /^\/[^/]+\/$/.test(first.trim()) ? first.trim() : "";
    const lookupKey = fields.title.trim().toLowerCase();
    const bookDetail = bookExamples1To3[lookupKey];
    const readDetail = readingExamples[lookupKey];
    const pronunciation = rawPron || (bookDetail ? bookDetail[0] : "");
    const fallbackExample = bookDetail
      ? `${bookDetail[1]}\n${bookDetail[2]}`
      : readDetail
        ? `${readDetail[0]}\n${readDetail[1]}`
        : "";
    return [{
      entry, term: fields.title, category, pronunciation,
      meaning: (rawPron ? rest.join("\n") : fields.body || "").trim(),
      example: (fields.example || "").trim() || fallbackExample,
      source: fields.origin || (entry.source?.key.startsWith("drive:") ? "阅读积累库" : "阅读分析"),
    }];
  });
}

export function eligible(card: Card, mode: Mode) {
  if (mode === "recognize") return Boolean(card.meaning);
  if (card.category === "关键句" || card.category === "同义改写") return false;
  return /^[a-z][a-z'’ .-]*(?:\s*\/\s*[a-z][a-z'’ .-]*)*$/i.test(card.term) && (mode === "spelling" || Boolean(card.meaning));
}

export function spellingMatches(term: string, input: string) {
  const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[‘’]/g, "'")
    .replace(/[‐‑–—]/g, "-").replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
  return term.split("/").some(answer => normalize(answer) === normalize(input));
}

export function practiceGroups(entries: Entry[]) {
  const articles = new Map(entries.filter(entry => entry.kind === "article").map(entry => [entry.id, entry.fields]));
  const groups = new Map<string, {name: string; date: string; correct: number; total: number; missing: number}>();
  for (const entry of entries) {
    if (entry.kind !== "question" || !entry.fields.article) continue;
    const article = articles.get(entry.fields.article);
    if (!article) continue;
    const date = entry.history.find(item => item.fields.practiceDate)?.fields.practiceDate || entry.fields.practiceDate || article.practiceDate || "";
    const key = entry.fields.article + "/" + date;
    const group = groups.get(key) ?? {name: article.title, date, correct: 0, total: 0, missing: 0};
    const answer = firstAnswer(entry);
    if (/^[ABCD]$/.test(answer || "") && /^[ABCD]$/.test(entry.fields.correct || "")) {
      group.total++;
      if (answer === entry.fields.correct) group.correct++;
    } else group.missing++;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a,b) => (a.date || "9999").localeCompare(b.date || "9999") || a.name.localeCompare(b.name));
}

export function readingRules(entries: Entry[]): Entry[] {
  return entries.filter(entry => entry.kind === "note" && ["解题规律", "可迁移规律"].includes(entry.fields.category || "") && entry.fields.title);
}

export function readingQuestionsForGroup(entries: Entry[], groupName: string, groupDate: string): Entry[] {
  const articles = new Map(entries.filter(entry => entry.kind === "article").map(entry => [entry.id, entry.fields]));
  return entries
    .filter(entry => {
      if (entry.kind !== "question" || !entry.fields.article) return false;
      const article = articles.get(entry.fields.article);
      if (!article || article.title !== groupName) return false;
      const date = entry.history.find(item => item.fields.practiceDate)?.fields.practiceDate || entry.fields.practiceDate || article.practiceDate || "";
      return date === groupDate;
    })
    .sort((a, b) => Number(a.fields.n || 0) - Number(b.fields.n || 0));
}

export function studyStreakDays(entries: Entry[], today = dateKey()): number {
  const activeDates = new Set<string>();
  for (const entry of entries) {
    if (entry.reviewed) activeDates.add(entry.reviewed);
    for (const log of entry.reviewLog ?? []) {
      const parsed = Date.parse(log.at);
      if (Number.isFinite(parsed)) activeDates.add(dateKey(new Date(parsed)));
    }
  }
  if (!activeDates.size) return 0;
  const shiftDay = (isoDate: string, delta: number) => {
    const ms = Date.parse(`${isoDate}T12:00:00+08:00`);
    return dateKey(new Date(ms + delta * 86400000));
  };
  let cursor = activeDates.has(today) ? today : shiftDay(today, -1);
  if (!activeDates.has(cursor)) return 0;
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak++;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}
