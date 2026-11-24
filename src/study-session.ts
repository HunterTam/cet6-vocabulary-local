import { type Card, type Mode, eligible } from "./vocabulary";

const activeSessionKey = "cet6-active-session-v1";
const deckCursorsKey = "cet6-deck-cursors-v1";
const audioPrefsKey = "cet6-audio-prefs-v1";
const studyPrefsKey = "cet6-study-prefs-v1";

export type SavedSession = {
  deckId: string;
  deckLabel: string;
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
  groupSize: number; // 10 | 20 | 30 | 0 (0 = all)
  shuffle: boolean;
  instantKnow: boolean;
};

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
  try {
    localStorage.setItem(audioPrefsKey, JSON.stringify(prefs));
  } catch {}
}

export function readStudyPrefs(): StudyPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(studyPrefsKey) || "{}") as Partial<StudyPrefs>;
    return {
      groupSize: typeof raw.groupSize === "number" ? raw.groupSize : 20,
      shuffle: Boolean(raw.shuffle),
      instantKnow: Boolean(raw.instantKnow),
    };
  } catch {
    return { groupSize: 20, shuffle: false, instantKnow: false };
  }
}

export function saveStudyPrefs(prefs: StudyPrefs) {
  try {
    localStorage.setItem(studyPrefsKey, JSON.stringify(prefs));
  } catch {}
}

export function readSavedSession(): SavedSession | null {
  try {
    const raw = localStorage.getItem(activeSessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (
      !parsed ||
      typeof parsed.deckId !== "string" ||
      typeof parsed.deckLabel !== "string" ||
      !["spelling", "recognize", "recall"].includes(parsed.mode || "") ||
      !Array.isArray(parsed.queueIds) ||
      !parsed.queueIds.length ||
      typeof parsed.position !== "number" ||
      parsed.position < 0 ||
      parsed.position >= parsed.queueIds.length
    ) {
      return null;
    }
    return {
      deckId: parsed.deckId,
      deckLabel: parsed.deckLabel,
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
  } catch {
    return null;
  }
}

export function writeSavedSession(session: SavedSession | null) {
  try {
    if (!session || session.position >= session.queueIds.length) {
      localStorage.removeItem(activeSessionKey);
    } else {
      localStorage.setItem(activeSessionKey, JSON.stringify({ ...session, updatedAt: new Date().toISOString() }));
    }
  } catch {}
}

function readCursors(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(deckCursorsKey) || "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function writeCursor(deckKey: string, nextOffset: number) {
  try {
    const map = readCursors();
    map[deckKey] = nextOffset;
    localStorage.setItem(deckCursorsKey, JSON.stringify(map));
  } catch {}
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
 * Builds a manageable study batch without repeating from #1 every time.
 * - Prioritizes failed / due-today / unreviewed cards first.
 * - If all cards in this deck are already reviewed for today (free review), rotates cleanly via a saved per-deck cursor.
 */
export function buildStudySession(params: {
  deckId: string;
  deckLabel: string;
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

  const sorted = [...playable].sort((a, b) =>
    Number(b.entry.reviewLog?.at(-1)?.passed === false) - Number(a.entry.reviewLog?.at(-1)?.passed === false)
    || Number(Boolean(b.entry.fields.previousSpelling)) - Number(Boolean(a.entry.fields.previousSpelling))
    || Number(Boolean(b.entry.due && b.entry.due <= today)) - Number(Boolean(a.entry.due && a.entry.due <= today))
    || Number(!b.entry.reviewed) - Number(!a.entry.reviewed)
    || (a.entry.due || "9999").localeCompare(b.entry.due || "9999"),
  );

  const dueCards = sorted.filter(card => !card.entry.due || card.entry.due <= today);
  const effectiveSize = groupSize > 0 ? groupSize : sorted.length;

  let chosen: Card[];
  if (!forceAll && dueCards.length > 0) {
    // Rotate through due cards if user starts a fresh group without finishing previous ones
    const base = shuffle ? fisherYates(dueCards) : dueCards;
    chosen = base.slice(0, effectiveSize);
  } else {
    // Free-review mode: advance a persistent cursor so clicking "开始背诵" continues to the NEXT batch instead of restarting from #1
    const cursorKey = `${deckId}:${mode}`;
    const total = sorted.length;
    const savedOffset = readCursors()[cursorKey] ?? 0;
    const startIdx = savedOffset >= total ? 0 : savedOffset;
    const rotated = [...sorted.slice(startIdx), ...sorted.slice(0, startIdx)];
    const slice = rotated.slice(0, Math.min(effectiveSize, total));
    writeCursor(cursorKey, (startIdx + slice.length) % total);
    chosen = shuffle ? fisherYates(slice) : slice;
  }

  const queueIds = chosen.map(card => card.entry.id);
  const session: SavedSession = {
    deckId,
    deckLabel,
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

/**
 * Simple character alignment diff to visually show which letters were misspelled or missed.
 */
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
