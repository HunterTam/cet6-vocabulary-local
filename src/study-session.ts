import { type Card, type Mode, eligible } from "./vocabulary";
import { mirrorKeyToDurable } from "./durable-store";

const legacySessionKey = "cet6-active-session-v1";
const deckSessionsKey = "cet6-deck-sessions-v2";
const deckCursorsKey = "cet6-deck-cursors-v1";
const audioPrefsKey = "cet6-audio-prefs-v1";
const studyPrefsKey = "cet6-study-prefs-v1";
const selectedDeckKey = "cet6-selected-deck-v1";
const deckTabKey = "cet6-deck-tab-v1";

export type StudyKind = "new" | "review" | "mix" | "free";

export type SavedSession = {
  deckId: string;
  deckLabel: string;
  studyKind: StudyKind;
  mode: Mode;
  queueIds: string[];
  position: number;
  uniqueIds: string[];
  masteredIds: string[];
  wrongIds: string[];
  requeuedIds: string[];
  groupSize: number;
  shuffle: boolean;
  updatedAt: string;
};

export type AudioPrefs = {
  autoPlay: boolean;
  rate: number;
};

export type StudyPrefs = {
  groupSize: number; // 10 | 15 | 20 | 30 | 0 (0 = all)
  shuffle: boolean;
  instantKnow: boolean;
  dailyNewGoal: number;
  dailyReviewGoal: number;
};

function setMirroredItem(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    mirrorKeyToDurable(key, value);
  } catch {}
}

export function readSelectedDeckId(fallback = "day-1"): string {
  try {
    const val = localStorage.getItem(selectedDeckKey);
    return val && val.trim() ? val.trim() : fallback;
  } catch {
    return fallback;
  }
}

export function saveSelectedDeckId(deckId: string) {
  setMirroredItem(selectedDeckKey, deckId);
}

export function readDeckTab(): "book" | "reading" | "smart" {
  try {
    const val = localStorage.getItem(deckTabKey);
    return val === "reading" || val === "smart" ? val : "book";
  } catch {
    return "book";
  }
}

export function saveDeckTab(tab: "book" | "reading" | "smart") {
  setMirroredItem(deckTabKey, tab);
}

export function readAudioPrefs(): AudioPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(audioPrefsKey) || "{}") as Partial<AudioPrefs>;
    return {
      autoPlay: typeof raw.autoPlay === "boolean" ? raw.autoPlay : true,
      rate: typeof raw.rate === "number" && raw.rate >= 0.6 && raw.rate <= 1.3 ? raw.rate : 0.9,
    };
  } catch {
    return { autoPlay: true, rate: 0.9 };
  }
}

export function saveAudioPrefs(prefs: AudioPrefs) {
  setMirroredItem(audioPrefsKey, JSON.stringify(prefs));
}

export function readStudyPrefs(): StudyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(studyPrefsKey) || "{}") as Partial<StudyPrefs>;
    return {
      groupSize: typeof raw.groupSize === "number" ? raw.groupSize : 20,
      shuffle: Boolean(raw.shuffle),
      instantKnow: Boolean(raw.instantKnow),
      dailyNewGoal: typeof raw.dailyNewGoal === "number" && raw.dailyNewGoal >= 5 ? raw.dailyNewGoal : 20,
      dailyReviewGoal: typeof raw.dailyReviewGoal === "number" && raw.dailyReviewGoal >= 10 ? raw.dailyReviewGoal : 40,
    };
  } catch {
    return { groupSize: 20, shuffle: false, instantKnow: false, dailyNewGoal: 20, dailyReviewGoal: 40 };
  }
}

export function saveStudyPrefs(prefs: StudyPrefs) {
  setMirroredItem(studyPrefsKey, JSON.stringify(prefs));
}

function normalizeSession(parsed: Partial<SavedSession> | null | undefined): SavedSession | null {
  if (
    !parsed ||
    typeof parsed.deckId !== "string" ||
    typeof parsed.deckLabel !== "string" ||
    !["new", "review", "mix", "free"].includes(parsed.studyKind || "") ||
    !["spelling", "recognize", "recall"].includes(parsed.mode || "") ||
    !Array.isArray(parsed.queueIds) ||
    !parsed.queueIds.length ||
    typeof parsed.position !== "number" ||
    parsed.position <= 0 ||
    parsed.position >= parsed.queueIds.length
  ) {
    return null;
  }
  return {
    deckId: parsed.deckId,
    deckLabel: parsed.deckLabel,
    studyKind: parsed.studyKind as StudyKind,
    mode: parsed.mode as Mode,
    queueIds: parsed.queueIds,
    position: parsed.position,
    uniqueIds: Array.isArray(parsed.uniqueIds) ? parsed.uniqueIds : [...new Set(parsed.queueIds)],
    masteredIds: Array.isArray(parsed.masteredIds) ? parsed.masteredIds : [],
    wrongIds: Array.isArray(parsed.wrongIds) ? parsed.wrongIds : [],
    requeuedIds: Array.isArray(parsed.requeuedIds) ? parsed.requeuedIds : [],
    groupSize: typeof parsed.groupSize === "number" ? parsed.groupSize : 20,
    shuffle: Boolean(parsed.shuffle),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function sessionSlotKey(deckId: string, studyKind: StudyKind): string {
  return `${deckId}:${studyKind}`;
}

export function readAllSavedSessions(): Record<string, SavedSession> {
  const result: Record<string, SavedSession> = {};
  try {
    const raw = localStorage.getItem(deckSessionsKey);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, Partial<SavedSession>>;
      for (const [k, v] of Object.entries(map || {})) {
        const clean = normalizeSession(v);
        if (clean) result[k] = clean;
      }
    }
    // Remove obsolete pre-v2 legacy session slot so old mixed (1/79) checkpoints never confuse users
    localStorage.removeItem(legacySessionKey);
  } catch {}
  return result;
}

export function readSavedSession(deckId?: string, studyKind?: StudyKind): SavedSession | null {
  const all = readAllSavedSessions();
  if (deckId && studyKind) {
    return all[sessionSlotKey(deckId, studyKind)] ?? null;
  }
  const candidates = Object.values(all).filter(s => !deckId || s.deckId === deckId);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

export function writeSavedSession(session: SavedSession | null, clearSlot?: { deckId: string; studyKind: StudyKind }) {
  try {
    const all = readAllSavedSessions();
    if (!session || session.position <= 0 || session.position >= session.queueIds.length) {
      const slot = clearSlot
        ? sessionSlotKey(clearSlot.deckId, clearSlot.studyKind)
        : session
          ? sessionSlotKey(session.deckId, session.studyKind)
          : "";
      if (slot) delete all[slot];
    } else {
      const stamp = { ...session, updatedAt: new Date().toISOString() };
      all[sessionSlotKey(stamp.deckId, stamp.studyKind)] = stamp;
    }
    setMirroredItem(deckSessionsKey, JSON.stringify(all));
  } catch {}
}

export function clearSavedSessionSlot(deckId: string, studyKind: StudyKind) {
  writeSavedSession(null, { deckId, studyKind });
}

function readCursors(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(deckCursorsKey) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeCursor(deckKey: string, nextOffset: number) {
  const map = readCursors();
  map[deckKey] = nextOffset;
  setMirroredItem(deckCursorsKey, JSON.stringify(map));
}

function fisherYates<T>(list: T[]): T[] {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Splits any card pool cleanly into the 3 classic vocab-app buckets:
 * 1. unlearned (新词): NEVER reviewed before — strictly continues from where you left off!
 * 2. dueReview (今日待复习): previously learned AND due <= today (sorted by urgency).
 * 3. solid (已掌握/未到期): previously learned AND due > today.
 */
export function partitionPool(pool: Card[], today: string) {
  const unlearned: Card[] = [];
  const dueReview: Card[] = [];
  const solid: Card[] = [];

  for (const card of pool) {
    if (!card.entry.reviewed) {
      unlearned.push(card);
    } else if (!card.entry.due || card.entry.due <= today) {
      dueReview.push(card);
    } else {
      solid.push(card);
    }
  }

  // Sort due reviews by forgetting urgency: recently failed -> overdue earliest -> lowest stage
  dueReview.sort((a, b) =>
    Number(b.entry.reviewLog?.at(-1)?.passed === false) - Number(a.entry.reviewLog?.at(-1)?.passed === false)
    || Number(Boolean(b.entry.fields.previousSpelling)) - Number(Boolean(a.entry.fields.previousSpelling))
    || (a.entry.due || "0000").localeCompare(b.entry.due || "0000")
    || a.entry.stage - b.entry.stage,
  );

  return { unlearned, dueReview, solid };
}

/**
 * Builds a structured study batch modelled on mainstream vocabulary apps (不背单词 / 墨墨 / 扇贝):
 * - "new": ONLY unlearned words (`!reviewed`), strictly continuing from the remaining unlearned words.
 * - "review": ONLY previously learned words due today (`reviewed && due <= today`), urgency-first.
 * - "mix": Balanced interleaved batch of due review words + fresh new words.
 * - "free": Cursor-rotated free practice across the whole deck when new & due are both cleared.
 */
export function buildStudySession(params: {
  deckId: string;
  deckLabel: string;
  studyKind?: StudyKind;
  pool: Card[];
  mode: Mode;
  groupSize: number;
  shuffle: boolean;
  today: string;
  forceAll?: boolean;
}): SavedSession | null {
  const { deckId, deckLabel, pool, mode, groupSize, shuffle, today, forceAll } = params;
  const playable = pool.filter(card => eligible(card, mode));
  if (!playable.length) return null;

  const { unlearned, dueReview } = partitionPool(playable, today);
  const requestedKind: StudyKind =
    params.studyKind ??
    (forceAll ? "free" : unlearned.length > 0 ? "new" : dueReview.length > 0 ? "review" : "free");

  const effectiveSize = groupSize > 0 ? groupSize : playable.length;
  let chosen: Card[] = [];
  let resolvedKind: StudyKind = requestedKind;

  if (requestedKind === "new") {
    if (!unlearned.length) return null;
    const base = shuffle ? fisherYates(unlearned) : unlearned;
    chosen = base.slice(0, effectiveSize);
  } else if (requestedKind === "review") {
    if (!dueReview.length) return null;
    const base = shuffle ? fisherYates(dueReview) : dueReview;
    chosen = base.slice(0, effectiveSize);
  } else if (requestedKind === "mix") {
    if (!unlearned.length && !dueReview.length) {
      resolvedKind = "free";
    } else {
      const targetNew = unlearned.length && dueReview.length
        ? Math.max(1, Math.round(effectiveSize * 0.45))
        : unlearned.length
          ? effectiveSize
          : 0;
      const newPick = (shuffle ? fisherYates(unlearned) : unlearned).slice(0, targetNew);
      const reviewQuota = Math.max(0, effectiveSize - newPick.length);
      const revPick = (shuffle ? fisherYates(dueReview) : dueReview).slice(0, reviewQuota);
      const extraNew = newPick.length + revPick.length < effectiveSize
        ? (shuffle ? fisherYates(unlearned) : unlearned).slice(newPick.length, effectiveSize - revPick.length)
        : [];
      const allNew = [...newPick, ...extraNew];
      // Interleave review and new cards naturally
      const merged: Card[] = [];
      const maxLen = Math.max(allNew.length, revPick.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < revPick.length) merged.push(revPick[i]);
        if (i < allNew.length) merged.push(allNew[i]);
      }
      chosen = merged;
    }
  }

  if (resolvedKind === "free") {
    const cursorKey = `${deckId}:${mode}`;
    const total = playable.length;
    const savedOffset = readCursors()[cursorKey] ?? 0;
    const startIdx = savedOffset >= total ? 0 : savedOffset;
    const rotated = [...playable.slice(startIdx), ...playable.slice(0, startIdx)];
    const slice = rotated.slice(0, Math.min(effectiveSize, total));
    writeCursor(cursorKey, (startIdx + slice.length) % total);
    chosen = shuffle ? fisherYates(slice) : slice;
  }

  if (!chosen.length) return null;

  const queueIds = chosen.map(card => card.entry.id);
  const session: SavedSession = {
    deckId,
    deckLabel,
    studyKind: resolvedKind,
    mode,
    queueIds,
    position: 0,
    uniqueIds: [...queueIds],
    masteredIds: [],
    wrongIds: [],
    requeuedIds: [],
    groupSize,
    shuffle,
    updatedAt: new Date().toISOString(),
  };
  writeSavedSession(session);
  return session;
}

/**
 * Counts how many words were FIRST learned today vs reviewed as old words today.
 */
export function countTodayActivity(cards: Card[], today: string): { newToday: number; reviewedToday: number; totalToday: number } {
  let newToday = 0;
  let reviewedToday = 0;
  for (const card of cards) {
    const entry = card.entry;
    const log = entry.reviewLog ?? [];
    const touchedToday = entry.reviewed === today || log.some(item => {
      const ms = Date.parse(item.at);
      return Number.isFinite(ms) && new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)) === today;
    });
    if (!touchedToday) continue;
    const firstLog = log[0];
    const firstDate = firstLog && Number.isFinite(Date.parse(firstLog.at))
      ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(firstLog.at))
      : entry.reviewed;
    if (firstDate === today) newToday++;
    else reviewedToday++;
  }
  return { newToday, reviewedToday, totalToday: newToday + reviewedToday };
}

/**
 * Cleans English terms/phrases so Web Speech API pronounces them naturally (e.g. strips "+ 名词", expands "sb."/"sth.").
 */
export function cleanTermForSpeech(raw: string): string {
  return raw
    .split(/[↔≠→]/)[0]
    .split("/")[0]
    .replace(/\+\s*[\u4e00-\u9fa5]+/g, "")
    .replace(/\.{2,}|…/g, "")
    .replace(/\bsb\./gi, "somebody")
    .replace(/\bsth\./gi, "something")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractEnglishExample(example?: string): string {
  if (!example) return "";
  const lines = example
    .split(/\r?\n/)
    .map(line => line.replace(/^(?:例|题)[｜|]\s*/, "").trim())
    .filter(Boolean);
  const englishLine = lines.find(line => /[a-zA-Z]{3,}/.test(line) && !/^(?:译|记)[｜|]/.test(line));
  return englishLine || "";
}

let lastSpokenKey = "";
let lastSpokenAt = 0;

function pickEnglishVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  const voices = synth.getVoices();
  if (!voices.length) return null;
  const preferred = [
    /Samantha/i,
    /Google US English/i,
    /Microsoft Aria/i,
    /Microsoft Jenny/i,
    /Daniel/i,
    /Karen/i,
    /Alex/i,
  ];
  for (const pattern of preferred) {
    const match = voices.find(v => pattern.test(v.name) && /^en/i.test(v.lang));
    if (match) return match;
  }
  return voices.find(v => /^en-US/i.test(v.lang)) ?? voices.find(v => /^en/i.test(v.lang)) ?? null;
}

export function stopSpeaking() {
  if (typeof window !== "undefined") {
    try { window.speechSynthesis?.cancel(); } catch {}
  }
}

export function speakEnglish(
  text: string,
  options?: {
    rate?: number;
    dedupeKey?: string;
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (message: string) => void;
  },
): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
    options?.onError?.("当前浏览器不支持语音朗读。");
    return false;
  }
  const spoken = cleanTermForSpeech(text);
  if (!spoken) return false;

  const now = Date.now();
  if (options?.dedupeKey && options.dedupeKey === lastSpokenKey && now - lastSpokenAt < 450) {
    return true;
  }
  lastSpokenKey = options?.dedupeKey || spoken;
  lastSpokenAt = now;

  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(spoken);
    utterance.lang = "en-US";
    utterance.rate = options?.rate ?? 0.9;
    const voice = pickEnglishVoice(synth);
    if (voice) utterance.voice = voice;
    utterance.onstart = () => options?.onStart?.();
    utterance.onend = () => options?.onEnd?.();
    utterance.onerror = event => {
      options?.onEnd?.();
      if (event.error !== "canceled" && event.error !== "interrupted") {
        options?.onError?.("当前浏览器无法自动播放发音，请轻点喇叭手动朗读。");
      }
    };
    synth.speak(utterance);
    return true;
  } catch {
    options?.onError?.("当前浏览器无法播放发音。");
    return false;
  }
}

export type DiffToken = { char: string; status: "ok" | "wrong" | "missing" };

export function spellingDiff(expectedRaw: string, actualRaw: string): DiffToken[] {
  const expected = expectedRaw.split("/")[0].trim().toLowerCase();
  const actual = actualRaw.trim().toLowerCase();
  const n = expected.length;
  const m = actual.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = expected[i] === actual[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const tokens: DiffToken[] = [];
  let i = 0, j = 0;
  while (i < n) {
    if (j < m && expected[i] === actual[j]) {
      tokens.push({ char: expectedRaw.split("/")[0].trim()[i], status: "ok" });
      i++;
      j++;
    } else if (j < m && dp[i][j + 1] >= dp[i + 1][j]) {
      j++;
    } else {
      tokens.push({ char: expectedRaw.split("/")[0].trim()[i], status: "missing" });
      i++;
    }
  }
  return tokens;
}
