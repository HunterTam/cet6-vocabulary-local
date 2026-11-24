"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AudioLines, BookOpen, CalendarClock, ChartNoAxesCombined, Check, ChevronRight, Clock3, Cloud, CloudOff, ExternalLink, Eye, Flame, Headphones, Layers3, LibraryBig, PencilLine, Play, Plus, RefreshCw, Search, Shuffle, Sparkles, Star, Upload, Volume2, VolumeX, Waves, X } from "lucide-react";
import { dateKey, firstAnswer, type Entry } from "./data";
import { eligible, practiceGroups, readingQuestionsForGroup, readingRules, studyStreakDays, vocabulary, type Card, type Mode } from "./vocabulary";
import { dailyBatches } from "./daily-vocabulary";
import { readingDocUrl, type ParsedImportCard } from "./reading-vocabulary";
import { ReviewCurve } from "./review-curve";
import { importGptNotes, importRecords, listRecords, mergeDriveFeed, mergeReadingDriveDoc, saveRecord } from "./local-store";
import { clearGistConfig, githubTokenCreateUrl, readGistConfig, syncWithGist, type GistConfig } from "./cloud-sync";
import { ListeningReview } from "./listening-review";
import { FlashcardStudio } from "./flashcard-studio";
import { GptImportModal } from "./gpt-import-modal";
import {
  buildStudySession,
  readAudioPrefs,
  readSavedSession,
  readStudyPrefs,
  saveAudioPrefs,
  saveStudyPrefs,
  speakEnglish,
  stopSpeaking,
  writeSavedSession,
  type AudioPrefs,
  type SavedSession,
  type StudyPrefs,
} from "./study-session";
import heroArt from "./images/model-0.webp?inline";
import spellingArt from "./images/model-1.webp?inline";
import recognizeArt from "./images/model-2.webp?inline";
import recallArt from "./images/model-3.webp?inline";
import "./vocabulary.css";

const modeArt: Record<Mode, string> = {
  recognize: recognizeArt,
  spelling: spellingArt,
  recall: recallArt,
};
const batchUnlockKey = "cet6-unlocked-batch-v1";
const examDateKey = "cet6-exam-date-v1";
const defaultExamDate = "2026-12-12";
const examPresets = [
  {label:"2026年12月笔试", date:"2026-12-12"},
  {label:"2027年6月笔试", date:"2027-06-12"},
] as const;

const modes = [
  {id:"recognize", title:"看词识义", badge:"推荐", detail:"自动播音，先想意思再翻卡，不认识自动重练。", icon:Eye},
  {id:"spelling", title:"听音拼写", badge:"强记忆", detail:"听发音写出完整英文，拼错逐字母标红。", icon:AudioLines},
  {id:"recall", title:"看义写词", badge:"考前冲刺", detail:"看中文释义回忆英文，训练主动提取。", icon:PencilLine},
] as const;

const groupSizeOptions = [
  {value:10, label:"10 词"},
  {value:20, label:"20 词"},
  {value:30, label:"30 词"},
  {value:0, label:"全部"},
] as const;

const tabs = [
  {id:"review", label:"单词复盘", icon:BookOpen},
  {id:"listening", label:"听力复盘", icon:Headphones},
  {id:"library", label:"词句积累", icon:LibraryBig},
  {id:"curve", label:"复习曲线", icon:Waves},
  {id:"trend", label:"阅读趋势", icon:ChartNoAxesCombined},
] as const;

type View = (typeof tabs)[number]["id"];
type DeckDef = {
  id: string;
  section: "smart" | "reading" | "book";
  title: string;
  subtitle: string;
  tone: "purple" | "mint" | "orange" | "blue";
  cards: Card[];
  dayNum?: number;
};
const categories = ["单词","固定搭配","熟词生义","同义改写","关键句"];
const sources = ["阅读积累库","阅读分析","词书复习","英语对话","手动积累"];
const blank = {title:"", body:"", example:"", category:"单词"};

function safeUrl(value?: string) {
  try { const url = new URL(value || ""); return /^https?:$/.test(url.protocol) ? url.href : ""; }
  catch { return ""; }
}

function readUnlockedDay() {
  try {
    const raw = Number(localStorage.getItem(batchUnlockKey) || 2);
    return Number.isInteger(raw) && raw >= 1 ? raw : 2;
  } catch {
    return 2;
  }
}

function readExamDate() {
  try {
    const raw = localStorage.getItem(examDateKey) || "";
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : defaultExamDate;
  } catch {
    return defaultExamDate;
  }
}

function formatShortDate(iso: string) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${parts[1]}.${parts[2]}` : iso;
}

function formatCnDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${y} 年 ${Number(m)} 月 ${Number(d)} 日` : iso;
}

export default function VocabularyDesk() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const [driveBusy, setDriveBusy] = useState(false);
  const driveEnabled = ["http://127.0.0.1:5173","http://127.0.0.1:4173"].includes(window.location.origin);
  const [gistConfig, setGistConfig] = useState<GistConfig | null>(readGistConfig);
  const [gistToken, setGistToken] = useState("");
  const [gistIdInput, setGistIdInput] = useState("");
  const [gistBusy, setGistBusy] = useState(false);
  const [gistMessage, setGistMessage] = useState("");
  const [gistError, setGistError] = useState("");
  const gistTimerRef = useRef<number | undefined>(undefined);
  const [view, setView] = useState<View>("review");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [batch, setBatch] = useState("");
  const [unlockedPref, setUnlockedPref] = useState<number>(readUnlockedDay);
  const [examDate, setExamDate] = useState<string>(readExamDate);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const countdownRef = useRef<HTMLDivElement>(null);
  const [selectedDeckId, setSelectedDeckId] = useState("today-mix");
  const [selectedMode, setSelectedMode] = useState<Mode>("recognize");
  const [audioPrefs, setAudioPrefs] = useState<AudioPrefs>(readAudioPrefs);
  const [studyPrefs, setStudyPrefs] = useState<StudyPrefs>(readStudyPrefs);
  const [activeSession, setActiveSession] = useState<SavedSession | null>(null);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(readSavedSession);
  const [gptModalOpen, setGptModalOpen] = useState(false);
  const [peekCardId, setPeekCardId] = useState("");
  const [limit, setLimit] = useState(40);
  const [curveCard, setCurveCard] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<typeof blank>();
  const [editing, setEditing] = useState<Entry>();
  const [notice, setNotice] = useState("");

  async function load() {
    setError("");
    try {
      setEntries(await listRecords());
      setReady(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "词库暂时无法加载。");
    }
  }

  async function syncDrive() {
    if (!driveEnabled) return;
    setDriveBusy(true);
    try {
      const fetchDoc = async (url: string) => {
        const reply = await fetch(url,{method:"POST",cache:"no-store",signal:AbortSignal.timeout(35000)});
        const text = await reply.text();
        if (!reply.ok) throw new Error(text);
        return text;
      };
      const [vocabRes, readingRes] = await Promise.allSettled([
        fetchDoc("/api/drive-sync"),
        fetchDoc("/api/drive-reading-sync"),
      ]);
      let changed = 0;
      let okCount = 0;
      let firstError = "";
      if (vocabRes.status === "fulfilled") {
        changed += await mergeDriveFeed(vocabRes.value);
        okCount++;
      } else {
        firstError = vocabRes.reason instanceof Error ? vocabRes.reason.message : "词汇同步失败";
      }
      if (readingRes.status === "fulfilled") {
        changed += await mergeReadingDriveDoc(readingRes.value);
        okCount++;
      } else if (!firstError) {
        firstError = readingRes.reason instanceof Error ? readingRes.reason.message : "阅读积累同步失败";
      }
      if (!okCount) throw new Error(firstError || "Google Drive 同步失败。");
      setEntries(await listRecords());
      if (okCount === 2) {
        setDriveMessage(changed ? `已同步 ${changed} 条词汇与阅读积累数据。` : "已检查 Google Drive，词书与阅读积累库已是最新。");
      } else {
        setDriveMessage(changed ? `已同步 ${changed} 条数据（部分文档待重试）。` : `部分同步完成：${firstError}`);
      }
    } catch (failure) {
      setDriveMessage(failure instanceof Error && failure.message.length<160 ? failure.message : "Google Drive 同步失败。");
    } finally {
      setDriveBusy(false);
    }
  }

  function formatSyncClock(iso?: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", month: "2-digit", day: "2-digit" }).format(d);
  }

  async function runGistSync(override?: { token: string; gistId?: string }, silent = false) {
    const activeCfg = override ?? gistConfig;
    if (!activeCfg?.token) return;
    setGistBusy(true);
    if (!silent) setGistError("");
    try {
      const res = await syncWithGist(activeCfg, { examDate, unlockedDay: unlockedPref });
      const nextCfg: GistConfig = { token: activeCfg.token.trim(), gistId: res.gistId, lastSyncAt: res.lastSyncAt };
      setGistConfig(nextCfg);
      setGistToken("");
      setGistIdInput("");
      if (res.examDate && res.examDate !== examDate) updateExamDate(res.examDate);
      if (res.unlockedDay && res.unlockedDay > unlockedPref) {
        setUnlockedPref(res.unlockedDay);
        try { localStorage.setItem(batchUnlockKey, String(res.unlockedDay)); } catch {}
      }
      setEntries(await listRecords());
      setGistMessage(
        res.created
          ? `已创建私有同步 Gist，上传 ${res.totalSynced} 条进度。`
          : res.pulled
            ? `双向同步完成：拉取 ${res.pulled} 条新进度（云端共 ${res.totalSynced} 条）。`
            : `双向同步完成：本机与云端已是最新（共 ${res.totalSynced} 条）。`,
      );
      setGistError("");
    } catch (failure) {
      const msg = failure instanceof Error ? failure.message : "GitHub Gist 同步失败。";
      setGistError(msg);
    } finally {
      setGistBusy(false);
    }
  }

  function scheduleGistSync() {
    if (!readGistConfig()?.token) return;
    if (gistTimerRef.current) window.clearTimeout(gistTimerRef.current);
    gistTimerRef.current = window.setTimeout(() => {
      const cfg = readGistConfig();
      if (cfg) void runGistSync(cfg, true);
    }, 2200);
  }

  function disconnectGist() {
    clearGistConfig();
    setGistConfig(null);
    setGistMessage("已断开 GitHub Gist 云同步（本机数据与云端 Gist 均保留）。");
    setGistError("");
  }

  useEffect(() => {
    void load();
    const savedGist = readGistConfig();
    if (savedGist) void runGistSync(savedGist, true);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const latest = readGistConfig();
      if (!latest) return;
      const last = latest.lastSyncAt ? Date.parse(latest.lastSyncAt) : 0;
      if (!last || Date.now() - last > 60_000) void runGistSync(latest, true);
    };
    document.addEventListener("visibilitychange", onVisible);
    let timer: number | undefined;
    if (driveEnabled) {
      void syncDrive();
      timer = window.setInterval(()=>void syncDrive(),10*60*1000);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      if (timer) window.clearInterval(timer);
      if (gistTimerRef.current) window.clearTimeout(gistTimerRef.current);
    };
  }, [driveEnabled]);

  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!countdownOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (countdownRef.current && !countdownRef.current.contains(event.target as Node)) {
        setCountdownOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setCountdownOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [countdownOpen]);

  function updateExamDate(next: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(next)) return;
    setExamDate(next);
    try { localStorage.setItem(examDateKey, next); } catch {}
  }

  const cards = useMemo(() => vocabulary(entries), [entries]);
  const batches = useMemo(() => {
    const groups = new Map<string,{day:string; first:number; last:number; count:number; learned:number}>();
    for (const card of cards) {
      const {batch:day,page} = card.entry.fields;
      if (!/^\d+$/.test(day || "") || !/^\d+$/.test(page || "")) continue;
      const bookPage = Number(page);
      const group = groups.get(day) ?? {day,first:bookPage,last:bookPage,count:0,learned:0};
      group.first = Math.min(group.first,bookPage);
      group.last = Math.max(group.last,bookPage);
      group.count++;
      if (card.entry.reviewed) group.learned++;
      groups.set(day,group);
    }
    return [...groups.values()].sort((a,b)=>Number(a.day)-Number(b.day));
  },[cards]);

  const visibleBatches = ready ? batches : dailyBatches.map(b => ({...b, learned:0}));
  const maxLearnedDay = useMemo(() => {
    let maxDay = 2;
    for (const card of cards) {
      if (card.entry.reviewed && /^\d+$/.test(card.entry.fields.batch || "")) {
        maxDay = Math.max(maxDay, Number(card.entry.fields.batch));
      }
    }
    return maxDay;
  }, [cards]);
  const activeDay = Math.max(2, unlockedPref, maxLearnedDay);

  const groups = useMemo(() => practiceGroups(entries), [entries]);
  const rules = useMemo(() => readingRules(entries), [entries]);
  const today = dateKey();
  const streak = useMemo(() => studyStreakDays(entries, today), [entries, today]);

  const confirmed = (card:Card) => Number(card.entry.fields.batch || 0) <= activeDay;
  const due = cards.filter(card => confirmed(card) && (!card.entry.due || card.entry.due <= today));
  const reviewed = cards.filter(card => card.entry.reviewed === today).length;
  const masteredCount = cards.filter(card => Boolean(card.entry.reviewed) && card.entry.due > today).length;
  const listeningEntries = useMemo(() => entries.filter(entry => entry.kind === "listening"), [entries]);
  const listeningMastered = listeningEntries.filter(entry => Boolean(entry.reviewed) && entry.due > today).length;
  const listeningDue = listeningEntries.filter(entry => !entry.due || entry.due <= today).length;

  const cardsById = useMemo(() => new Map(cards.map(c => [c.entry.id, c])), [cards]);

  const pool = cards.filter(card => !source || card.source === source);
  const filteredPool = pool.filter(card => (!category || card.category === category) && (!batch || card.entry.fields.batch === batch));
  const catalog = filteredPool.filter(card =>
    [card.term, card.meaning, card.example].join(" ").toLowerCase().includes(query.trim().toLowerCase()));

  const readingAllCards = useMemo(
    () => cards.filter(c => c.source === "阅读积累库" || c.source === "阅读分析"),
    [cards],
  );
  const gptDailyCards = useMemo(
    () => cards.filter(c => c.source === "英语对话" || c.source === "手动积累"),
    [cards],
  );

  const decks = useMemo<DeckDef[]>(() => {
    const readingWords = readingAllCards.filter(c => c.category === "单词" || c.category === "熟词生义");
    const readingPhrases = readingAllCards.filter(c => c.category === "固定搭配");
    const readingMeta = readingAllCards.filter(c => c.category === "同义改写" || c.category === "关键句");
    const bookAll = cards.filter(c => Boolean(c.entry.fields.batch));
    const openAll = cards.filter(confirmed);

    return [
      {
        id: "today-mix",
        section: "smart",
        title: "今日全部待复习",
        subtitle: `开放词书 1–${activeDay} 天 + 阅读积累 + GPT 词单`,
        tone: "purple",
        cards: openAll,
      },
      {
        id: "gpt-daily",
        section: "smart",
        title: "GPT 每日推送 & 对话",
        subtitle: "ChatGPT 同步词条与一键粘贴的每日词单",
        tone: "orange",
        cards: gptDailyCards,
      },
      {
        id: "reading-word",
        section: "reading",
        title: "阅读生词",
        subtitle: "六级阅读积累库高频生词",
        tone: "mint",
        cards: readingWords,
      },
      {
        id: "reading-phrase",
        section: "reading",
        title: "阅读短语 & 搭配",
        subtitle: "真题高频短语、固定搭配",
        tone: "mint",
        cards: readingPhrases,
      },
      {
        id: "reading-para",
        section: "reading",
        title: "同义改写 & 关键句",
        subtitle: "选项替换规律与难句精析",
        tone: "blue",
        cards: readingMeta,
      },
      {
        id: "reading-all",
        section: "reading",
        title: "阅读积累全部合集",
        subtitle: "Drive 阅读文档全部词汇短语语句",
        tone: "purple",
        cards: readingAllCards,
      },
      ...visibleBatches.map(group => ({
        id: `day-${group.day}`,
        section: "book" as const,
        title: `第 ${group.day} 天词书`,
        subtitle: `第 ${group.first}–${group.last} 页 · 词书核心词`,
        tone: "blue" as const,
        cards: cards.filter(c => c.entry.fields.batch === group.day),
        dayNum: Number(group.day),
      })),
      {
        id: "book-all",
        section: "book",
        title: "全部词书合集",
        subtitle: "Day 1–4 全部词书词条",
        tone: "purple",
        cards: bookAll,
      },
    ];
  }, [cards, readingAllCards, gptDailyCards, visibleBatches, activeDay]);

  const activeDeck = decks.find(d => d.id === selectedDeckId) ?? decks[0];

  function updateAudioPrefs(next: AudioPrefs) {
    setAudioPrefs(next);
    saveAudioPrefs(next);
  }

  function updateStudyPrefs(next: StudyPrefs) {
    setStudyPrefs(next);
    saveStudyPrefs(next);
  }

  function updateActiveSession(next: SavedSession | null) {
    setActiveSession(next);
    writeSavedSession(next);
    setSavedSession(next && next.position < next.queueIds.length ? next : null);
  }

  function unlockBatchDay(dayNum: number) {
    if (dayNum <= activeDay) return;
    setUnlockedPref(dayNum);
    try { localStorage.setItem(batchUnlockKey, String(dayNum)); } catch {}
    setNotice(`已自动开启第 ${dayNum} 天词书，并纳入日常复习池。`);
  }

  function navigate(next: View) {
    stopSpeaking();
    setView(next); setDraft(undefined); setEditing(undefined); setActiveSession(null);
    setSource(""); setCategory(""); setBatch(""); setQuery(""); setLimit(40); setCurveCard(""); setNotice(""); setError("");
  }

  function launchSession(deck: DeckDef, mode: Mode, forceAll = false) {
    if (deck.dayNum && deck.dayNum > activeDay) unlockBatchDay(deck.dayNum);
    const built = buildStudySession({
      deckId: deck.id,
      deckLabel: deck.title,
      pool: deck.cards,
      mode,
      groupSize: studyPrefs.groupSize,
      shuffle: studyPrefs.shuffle,
      today,
      forceAll,
    });
    if (!built) {
      setNotice("当前词本在该模式下暂无可练词条，试试切换「看词识义」模式。");
      return;
    }
    // Synchronously trigger first word pronunciation inside the click gesture for iPhone Safari auto-play!
    const firstCard = cardsById.get(built.queueIds[0]);
    if (firstCard && audioPrefs.autoPlay && mode !== "recall") {
      speakEnglish(firstCard.term, { rate: audioPrefs.rate, dedupeKey: `card:0:${firstCard.entry.id}` });
    }
    setNotice("");
    setView("review");
    setActiveSession(built);
    setSavedSession(built);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resumeSavedSession() {
    if (!savedSession) return;
    const validQueue = savedSession.queueIds.filter(id => cardsById.has(id));
    if (!validQueue.length || savedSession.position >= validQueue.length) {
      writeSavedSession(null);
      setSavedSession(null);
      return;
    }
    const currentCard = cardsById.get(savedSession.queueIds[savedSession.position]);
    if (currentCard && audioPrefs.autoPlay && savedSession.mode !== "recall") {
      speakEnglish(currentCard.term, {
        rate: audioPrefs.rate,
        dedupeKey: `card:${savedSession.position}:${currentCard.entry.id}`,
      });
    }
    setView("review");
    setActiveSession(savedSession);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function discardSavedSession() {
    writeSavedSession(null);
    setSavedSession(null);
  }

  function startCustomCards(customCards: Card[], deckLabel: string, mode: Mode) {
    const playable = customCards.filter(card => eligible(card, mode));
    if (!playable.length) return;
    const queueIds = playable.map(c => c.entry.id);
    const built: SavedSession = {
      deckId: "custom",
      deckLabel,
      mode,
      queueIds,
      position: 0,
      uniqueIds: [...queueIds],
      masteredIds: [],
      wrongIds: [],
      requeuedIds: [],
      groupSize: queueIds.length,
      shuffle: false,
      updatedAt: new Date().toISOString(),
    };
    writeSavedSession(built);
    const firstCard = playable[0];
    if (firstCard && audioPrefs.autoPlay && mode !== "recall") {
      speakEnglish(firstCard.term, { rate: audioPrefs.rate, dedupeKey: `card:0:${firstCard.entry.id}` });
    }
    setView("review");
    setActiveSession(built);
    setSavedSession(built);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startRescue(rescueCards: Card[], mode: Mode) {
    setNotice(`已启动临界遗忘抢救模式（共 ${rescueCards.length} 条）。`);
    startCustomCards(rescueCards, "遗忘预警抢救", mode);
  }

  function speak(card: Card) {
    speakEnglish(card.term, { rate: audioPrefs.rate });
  }

  async function handleGptImport(items: ParsedImportCard[], startNow: boolean, batchTag: string) {
    setBusy(true);
    setError("");
    try {
      const { added, updated } = await importGptNotes(items, batchTag);
      const refreshed = await listRecords();
      setEntries(refreshed);
      scheduleGistSync();
      setGptModalOpen(false);
      setNotice(`已导入 GPT 词单：新增 ${added} 条${updated ? `，更新 ${updated} 条` : ""}。`);
      if (startNow) {
        const refreshedCards = vocabulary(refreshed);
        const importedTitles = new Set(items.map(i => i.title.trim().toLowerCase()));
        const targetCards = refreshedCards.filter(c => importedTitles.has(c.term.trim().toLowerCase()));
        if (targetCards.length) {
          startCustomCards(targetCards, batchTag, "recognize");
        }
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "导入失败，请检查词单格式。");
    } finally {
      setBusy(false);
    }
  }

  async function persist(entry: Entry, action: "pass"|"again"|"save", fields?: Record<string,string>) {
    setBusy(true); setError("");
    try {
      const saved = await saveRecord(entry,action,fields);
      setEntries(previous => [...previous.filter(item => item.id !== saved.id),saved]);
      scheduleGistSync();
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存失败，请重试。");
      return false;
    } finally { setBusy(false); }
  }

  async function saveCard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft?.title.trim() || !draft.body.trim() || busy) return;
    const entry = editing ?? {id:crypto.randomUUID(),kind:"note" as const,version:0,fields:{origin:"手动积累"},history:[],stage:0,due:"",reviewed:""};
    if (await persist(entry,"save",{...entry.fields,...draft})) {
      setDraft(undefined); setEditing(undefined); setNotice("已保存到词句积累。");
    }
  }

  function editCard(card: Card) {
    setEditing(card.entry);
    setDraft({title:card.term, body:card.entry.fields.body || "", example:card.example, category:card.category});
    window.scrollTo({top:0, behavior:"instant"});
  }

  function exportBackup() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({records:entries},null,2)],{type:"application/json"}));
    const link = document.createElement("a");
    link.href=url;
    link.download="cet6-learning-backup.json";
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  async function importBackup(file?:File) {
    if (!file) return;
    try {
      if (file.size>10_000_000) throw new Error("备份文件超过 10 MB。");
      const count=importRecords(await file.text());
      await load();
      setNotice("已导入 "+count+" 条学习记录。");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "导入失败。");
    }
  }

  const duePlayableCount = due.filter(c=>eligible(c,"recognize")||eligible(c,"spelling")).length;
  const vocabGoalPct = cards.length ? Math.min(100, Math.round((masteredCount / Math.max(1, cards.filter(confirmed).length)) * 100)) : 0;
  const listenGoalPct = listeningEntries.length ? Math.min(100, Math.round((listeningMastered / listeningEntries.length) * 100)) : 0;
  const todayGoalPct = (reviewed + duePlayableCount) > 0 ? Math.min(100, Math.round((reviewed / (reviewed + duePlayableCount)) * 100)) : 0;

  const daysUntilExam = Math.round((Date.parse(`${examDate}T00:00:00+08:00`) - Date.parse(`${today}T00:00:00+08:00`)) / 86400000);
  const examTargetMs = Date.parse(`${examDate}T15:00:00+08:00`);
  const diffHoursTotal = Math.max(0, Math.floor((examTargetMs - nowMs) / 3600000));
  const remainDaysExact = Math.floor(diffHoursTotal / 24);
  const remainHoursExact = diffHoursTotal % 24;
  const examTone = daysUntilExam <= 0 ? "today" : daysUntilExam <= 14 ? "urgent" : "calm";
  const dailyPaceNeed = daysUntilExam > 0 ? Math.max(1, Math.ceil(duePlayableCount / daysUntilExam)) : duePlayableCount;

  const activeDeckPlayable = useMemo(
    () => (activeDeck?.cards ?? []).filter(card => eligible(card, selectedMode)),
    [activeDeck, selectedMode],
  );
  const activeDeckDue = useMemo(
    () => activeDeckPlayable.filter(card => !card.entry.due || card.entry.due <= today),
    [activeDeckPlayable, today],
  );
  const nextBatchSize = activeDeckDue.length
    ? (studyPrefs.groupSize > 0 ? Math.min(studyPrefs.groupSize, activeDeckDue.length) : activeDeckDue.length)
    : (studyPrefs.groupSize > 0 ? Math.min(studyPrefs.groupSize, activeDeckPlayable.length) : activeDeckPlayable.length);

  const previewCandidates = useMemo(() => {
    const base = activeDeckDue.length ? activeDeckDue : activeDeckPlayable;
    return base.slice(0, 6);
  }, [activeDeckDue, activeDeckPlayable]);

  const peekCard = previewCandidates.find(c => c.entry.id === peekCardId) ?? previewCandidates[0];

  const navCounts: Partial<Record<View, string>> = ready ? {
    review: String(duePlayableCount),
    listening: String(listeningDue),
    library: String(cards.length),
  } : {};

  return <div className="vocab shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>navigate("review")} disabled={busy} aria-label="返回单词复盘">
        <span className="brand-icon"><BookOpen size={21}/></span>
        <span><strong>六级单词复盘</strong><small>CET-6 VOCABULARY</small></span>
      </button>

      <nav className="side-nav" aria-label="主要功能">
        <div className="nav-label">学习空间</div>
        {tabs.map(({id,label,icon:Icon}) => (
          <button
            key={id}
            className={"nav-button "+(view===id?"active":"")}
            aria-current={view===id?"page":undefined}
            aria-label={label}
            title={label}
            disabled={busy}
            onClick={()=>navigate(id)}
          >
            <span className={"nav-pill-icon "+id}><Icon size={17}/></span>
            <span>{label}</span>
            {navCounts[id] && <i className="nav-badge">{navCounts[id]}</i>}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <div className="streak-card" title="根据本机复习日期统计连续学习天数">
          <span className="streak-flame"><Flame size={22} color="#f26b26" fill="#ff9e5e"/></span>
          <div>
            <strong>{ready ? `${streak} 天` : "—"}</strong>
            <small>{streak > 0 ? "连续打卡复习" : "今日练一词开启连胜"}</small>
          </div>
        </div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <div className="breadcrumb">
            <span>六级复盘台</span><ChevronRight size={14}/><strong>{tabs.find(tab=>tab.id===view)?.label}</strong>
          </div>
          <div className="countdown-wrap" ref={countdownRef}>
            <button
              type="button"
              className={`countdown-pill ${examTone}`}
              aria-expanded={countdownOpen}
              aria-haspopup="dialog"
              onClick={()=>setCountdownOpen(open=>!open)}
              title={`目标考试：${formatCnDate(examDate)} 15:00（点击可调整日期）`}
            >
              <span className="countdown-icon"><CalendarClock size={14}/></span>
              <span className="countdown-label">距六级笔试</span>
              <strong className="countdown-days">
                {daysUntilExam > 0 ? `${daysUntilExam} 天` : daysUntilExam === 0 ? "就是今天" : `已过 ${Math.abs(daysUntilExam)} 天`}
              </strong>
              <span className="countdown-date">{formatShortDate(examDate)}</span>
            </button>
            {countdownOpen && (
              <div className="countdown-popover" role="dialog" aria-label="六级考试倒计时设置">
                <div className="countdown-pop-head">
                  <strong>全国大学英语六级笔试 (CET-6)</strong>
                  <span>{formatCnDate(examDate)} · 15:00</span>
                </div>
                <div className="countdown-pop-hero">
                  {daysUntilExam > 0 ? (
                    <>
                      <div><b>{remainDaysExact}</b><small>天</small><b>{String(remainHoursExact).padStart(2,"0")}</b><small>小时</small></div>
                      <p>当前开放池还有 {duePlayableCount} 条待复习，考前日均练约 {dailyPaceNeed} 条即可稳步过完。</p>
                    </>
                  ) : daysUntilExam === 0 ? (
                    <p>今天就是六级笔试！深呼吸，保持节奏，发挥出平时的积累！</p>
                  ) : (
                    <p>目标日期已过去，可在下方切换为下一次六级考试日期。</p>
                  )}
                </div>
                <label className="countdown-date-field">
                  <span>自定义考试日期</span>
                  <input type="date" value={examDate} onChange={e=>updateExamDate(e.target.value)}/>
                </label>
                <div className="countdown-presets">
                  {examPresets.map(preset => (
                    <button
                      key={preset.date}
                      type="button"
                      className={"countdown-preset "+(examDate===preset.date?"active":"")}
                      onClick={()=>updateExamDate(preset.date)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="top-actions">
          {driveEnabled && (
            <span className="drive-chip" title={driveMessage || "Google Drive 自动同步已开启"}>
              <span className={"drive-dot "+(driveBusy?"busy":"")}/>
              {driveBusy ? "同步中…" : "Drive 自动同步"}
            </span>
          )}
          <button
            type="button"
            className={"cloud-chip " + (gistConfig ? "connected" : "")}
            disabled={gistBusy}
            onClick={() => {
              if (gistConfig) {
                void runGistSync();
              } else {
                navigate("review");
                setTimeout(() => document.getElementById("cloud-sync-card")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
              }
            }}
            title={gistConfig ? (gistMessage || `已连接 GitHub Gist 云同步（点击立即同步）`) : "配置 iPhone ↔ 电脑跨设备云同步"}
          >
            <Cloud size={14} className={gistBusy ? "spin" : ""}/>
            <span>{gistBusy ? "云同步中…" : gistConfig ? "云同步已连" : "云同步"}</span>
          </button>
          <form className="v-top-search" onSubmit={e=>{e.preventDefault();const value=query;navigate("library");setQuery(value);}}>
            <Search size={15}/>
            <input aria-label="全站搜索" placeholder="搜索词句与释义" value={query} onChange={e=>{setQuery(e.target.value);setLimit(40);}}/>
          </form>
          <button className="v-primary" disabled={!ready||busy} onClick={()=>{navigate("library");setDraft(blank);}}>
            <Plus size={16}/>添加词句
          </button>
        </div>
      </header>

      <main className="v-main">
        {error && <div className="v-error" role="alert">{error} {!ready && <button className="v-secondary" onClick={()=>void load()}>重新加载</button>}</div>}
        {!ready && !error && <p role="status" className="v-muted">正在读取积累库…</p>}
        {notice && <p className="v-notice" role="status">{notice}</p>}

        <div className="v-stage" key={view}>
        {view==="review" && <>
          {!activeSession && <>
            {/* Persistent Checkpoint Resume Banner */}
            {ready && savedSession && (
              <section className="v-panel resume-banner">
                <div className="resume-info">
                  <span className="resume-badge"><Play size={13}/>上次背诵未完成</span>
                  <strong>{savedSession.deckLabel}</strong>
                  <span className="v-muted">
                    第 {savedSession.position + 1} / {savedSession.queueIds.length} 步 · 已掌握 {savedSession.masteredIds.length} / {savedSession.uniqueIds.length} 词
                  </span>
                </div>
                <div className="resume-actions">
                  <button type="button" className="v-primary" onClick={resumeSavedSession}>
                    <Play size={15}/>继续上次背诵
                  </button>
                  <button type="button" className="v-secondary rc-mini-btn" onClick={discardSavedSession} title="清除断点">
                    <X size={14}/>清除进度
                  </button>
                </div>
              </section>
            )}

            <section className="v-hero">
              <div className="v-hero-copy">
                <span className="v-hero-tag"><Sparkles size={13}/> 六级智能背词台 · 自动播音 & 断点续背</span>
                <h1>选好词本，直接开背。</h1>
                <p>已同步词书每日词单、Google Drive 六级阅读生词与短语，以及 ChatGPT 每日推送词条。</p>
                <div className="v-actions">
                  <button
                    className="hero-primary"
                    disabled={!ready || !nextBatchSize}
                    onClick={() => savedSession ? resumeSavedSession() : (activeDeck && launchSession(activeDeck, selectedMode))}
                  >
                    {savedSession ? `继续上次进度 (${savedSession.position + 1}/${savedSession.queueIds.length})` : `立即开背 · ${nextBatchSize} 词`}
                  </button>
                  <button className="hero-secondary" onClick={() => setGptModalOpen(true)}>
                    <Upload size={15}/>导入 GPT 每日词单
                  </button>
                </div>
              </div>
              <div className="v-hero-render" aria-hidden="true">
                <div className="v-hero-glow"/>
                <div className="v-hero-card-float one"><i/><i/><i/></div>
                <div className="v-hero-card-float two"><i/><i/></div>
                <img src={heroArt} alt="" width="500" height="500" fetchPriority="high"/>
              </div>
            </section>

            <dl className="v-metrics">{[
              {label:"今日待复习", value:duePlayableCount, icon:Clock3, tone:"purple"},
              {label:"今日已背词", value:reviewed, icon:Check, tone:"mint"},
              {label:"每日词书词条", value:cards.filter(c=>c.entry.fields.batch).length, icon:Layers3, tone:"blue"},
              {label:"阅读积累 & GPT", value:readingAllCards.length + gptDailyCards.length, icon:Star, tone:"orange"},
            ].map(({label,value,icon:Icon,tone}) => (
              <div className="v-panel" key={label}>
                <span className={"metric-icon "+tone}><Icon size={20}/></span>
                <dd>{ready ? value : "—"}</dd>
                <dt>{label}</dt>
              </div>
            ))}</dl>

            {/* Step 1: Visual Deck Picker */}
            <section className="v-panel v-module deck-studio" id="practice-modes">
              <div className="v-heading">
                <div>
                  <h2>第一步：选择要背的词本</h2>
                  <p className="v-muted">点选任意词本卡片即可切换，已完整接入 Google Drive 阅读生词、短语与 GPT 每日词单。</p>
                </div>
                <div className="v-actions">
                  <button type="button" className="v-secondary rc-mini-btn" onClick={() => setGptModalOpen(true)}>
                    <Upload size={14}/>粘贴导入 GPT 词单
                  </button>
                  <a className="v-secondary rc-mini-btn" href={readingDocUrl} target="_blank" rel="noreferrer">
                    阅读文档源 <ExternalLink size={13}/>
                  </a>
                </div>
              </div>

              {(["smart", "reading", "book"] as const).map(sec => {
                const secTitle = sec === "smart"
                  ? "今日推荐 & GPT 每日词单"
                  : sec === "reading"
                    ? `六级阅读积累库（已同步 ${readingAllCards.length} 条）`
                    : "每日词书词表（Day 1 – Day 4）";
                const list = decks.filter(d => d.section === sec);
                return (
                  <div className="deck-group" key={sec}>
                    <div className="deck-group-label">{secTitle}</div>
                    <div className={"deck-grid " + sec}>
                      {list.map(deck => {
                        const selected = deck.id === selectedDeckId;
                        const total = deck.cards.length;
                        const learned = deck.cards.filter(c => Boolean(c.entry.reviewed)).length;
                        const dueCnt = deck.cards.filter(c => !c.entry.due || c.entry.due <= today).length;
                        const pct = total ? Math.round((learned / total) * 100) : 0;
                        return (
                          <button
                            key={deck.id}
                            type="button"
                            className={`deck-card tone-${deck.tone} ${selected ? "selected" : ""}`}
                            aria-pressed={selected}
                            onClick={() => {
                              setSelectedDeckId(deck.id);
                              setPeekCardId("");
                              if (deck.dayNum && deck.dayNum > activeDay) unlockBatchDay(deck.dayNum);
                              if (!deck.cards.some(c => eligible(c, selectedMode)) && deck.cards.some(c => eligible(c, "recognize"))) {
                                setSelectedMode("recognize");
                              }
                            }}
                          >
                            <div className="deck-card-top">
                              <strong>{deck.title}</strong>
                              <span className={"deck-due-pill " + (dueCnt ? "" : "done")}>
                                {dueCnt ? `待背 ${dueCnt}` : "今日已清"}
                              </span>
                            </div>
                            <p className="deck-card-sub">{deck.subtitle}</p>
                            <div className="deck-card-foot">
                              <span className="deck-bar"><i style={{ width: `${pct}%` }}/></span>
                              <small>{learned}/{total} 已学</small>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Step 2: Mode + Group Size + Auto-Play + Launch Button */}
              <div className="launch-dock">
                <div className="launch-head">
                  <h2>第二步：选背诵方式 & 本组设置</h2>
                  <span className="v-tag sky">当前词本：{activeDeck?.title}</span>
                </div>

                <div className="launch-modes">
                  {modes.map(({ id, title, badge, detail }) => {
                    const playableCnt = (activeDeck?.cards ?? []).filter(c => eligible(c, id)).length;
                    const active = selectedMode === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className={`launch-mode-card v-mode-${id} ${active ? "selected" : ""}`}
                        aria-pressed={active}
                        disabled={!ready || !playableCnt}
                        onClick={() => setSelectedMode(id)}
                      >
                        <img src={modeArt[id]} alt="" width="88" height="88"/>
                        <div className="launch-mode-copy">
                          <div className="launch-mode-title">
                            <strong>{title}</strong>
                            <span>{badge}</span>
                          </div>
                          <p>{detail}</p>
                          <small>{playableCnt ? `可练 ${playableCnt} 条` : "本词本含长句/改写，建议用看词识义"}</small>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="launch-controls">
                  <div className="launch-ctrl-group">
                    <span className="v-dock-label">每组词数</span>
                    <div className="launch-seg">
                      {groupSizeOptions.map(opt => (
                        <button
                          key={opt.value}
                          type="button"
                          className={studyPrefs.groupSize === opt.value ? "active" : ""}
                          onClick={() => updateStudyPrefs({ ...studyPrefs, groupSize: opt.value })}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="launch-ctrl-group">
                    <button
                      type="button"
                      className={"v-focus-pill " + (studyPrefs.shuffle ? "active" : "")}
                      onClick={() => updateStudyPrefs({ ...studyPrefs, shuffle: !studyPrefs.shuffle })}
                    >
                      <Shuffle size={13}/>{studyPrefs.shuffle ? "随机顺序 开" : "顺序背诵"}
                    </button>
                    <button
                      type="button"
                      className={"v-focus-pill " + (audioPrefs.autoPlay ? "active" : "")}
                      onClick={() => updateAudioPrefs({ ...audioPrefs, autoPlay: !audioPrefs.autoPlay })}
                    >
                      {audioPrefs.autoPlay ? <Volume2 size={13}/> : <VolumeX size={13}/>}
                      {audioPrefs.autoPlay ? "自动播音 开" : "自动播音 关"}
                    </button>
                  </div>

                  <button
                    type="button"
                    className="v-primary launch-start-btn"
                    disabled={!ready || !activeDeckPlayable.length}
                    onClick={() => activeDeck && launchSession(activeDeck, selectedMode)}
                  >
                    <Play size={17}/>
                    {activeDeckDue.length
                      ? `开始背诵 · 本组 ${nextBatchSize} 词`
                      : activeDeckPlayable.length
                        ? `继续下一组自由复习 · ${nextBatchSize} 词`
                        : "该模式暂无词条"}
                  </button>
                </div>

                {/* Compact word preview strip for the chosen deck */}
                {previewCandidates.length > 0 && (
                  <div className="v-pool-preview compact">
                    <div className="v-peek-chips">
                      <span className="v-dock-label">本组预览（点词试听）：</span>
                      {previewCandidates.map(card => {
                        const selected = peekCard?.entry.id === card.entry.id;
                        return (
                          <button
                            key={card.entry.id}
                            type="button"
                            className={"v-peek-chip " + (selected ? "active" : "")}
                            onClick={() => { setPeekCardId(card.entry.id); speak(card); }}
                          >
                            <Volume2 size={12}/>
                            <span>{card.term.length > 24 ? card.term.slice(0, 23) + "…" : card.term}</span>
                          </button>
                        );
                      })}
                    </div>
                    {peekCard && (
                      <div className="v-peek-gloss">
                        <div className="v-peek-gloss-text">
                          <strong>{peekCard.term}</strong>
                          {peekCard.pronunciation && <span className="v-peek-ipa">{peekCard.pronunciation}</span>}
                          <span className="v-peek-meaning">{peekCard.meaning.replace(/\n+/g, " · ")}</span>
                        </div>
                        <div className="v-peek-gloss-meta">
                          <span className="v-tag">{peekCard.category}</span>
                          <span className="v-tag sky">{peekCard.source}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Horizontal 3-bar progress overview */}
            <section className="v-panel v-module progress-strip-card">
              <div className="progress-strip-grid">
                <div className="v-goal-row">
                  <div className="v-goal-head"><span>今日复习完成度</span><span>{todayGoalPct}%</span></div>
                  <div className="v-track"><div className="v-fill purple" style={{width:`${todayGoalPct}%`}}/></div>
                </div>
                <div className="v-goal-row">
                  <div className="v-goal-head"><span>听力复盘掌握度</span><span>{listenGoalPct}%</span></div>
                  <div className="v-track"><div className="v-fill mint" style={{width:`${listenGoalPct}%`}}/></div>
                </div>
                <div className="v-goal-row">
                  <div className="v-goal-head"><span>开放词库巩固率</span><span>{vocabGoalPct}%</span></div>
                  <div className="v-track"><div className="v-fill peach" style={{width:`${vocabGoalPct}%`}}/></div>
                </div>
              </div>
            </section>

            <section className="v-panel v-module v-local-backup" id="cloud-sync-card">
              <div className="v-sync-grid">
                <div className="v-sync-box">
                  <div className="v-sync-head">
                    <h2>跨设备云同步（iPhone ↔ 电脑）</h2>
                    <span className={"v-tag " + (gistConfig ? "mint" : "sky")}>
                      {gistConfig ? "GitHub Gist 已连接" : "未连接"}
                    </span>
                  </div>
                  <p className="v-muted">
                    使用你自己的私有 GitHub Gist 自动双向同步复习进度、打卡记录与倒计时。只需在电脑和 iPhone 各粘贴一次同一枚 Token，自动识别同一份私有进度。
                  </p>
                  {gistConfig ? (
                    <div className="v-gist-connected">
                      <div className="v-gist-meta">
                        <span>私有 Gist：<code>{gistConfig.gistId.slice(0, 8)}…{gistConfig.gistId.slice(-4)}</code></span>
                        {gistConfig.lastSyncAt && <span>上次同步：{formatSyncClock(gistConfig.lastSyncAt)}</span>}
                      </div>
                      <div className="v-actions">
                        <button type="button" className="v-primary rc-mini-btn" disabled={gistBusy || busy} onClick={() => void runGistSync()}>
                          <RefreshCw size={14} className={gistBusy ? "spin" : ""}/>{gistBusy ? "双向同步中…" : "立即双向同步"}
                        </button>
                        <button type="button" className="v-secondary rc-mini-btn" disabled={gistBusy} onClick={disconnectGist}>
                          <CloudOff size={14}/>断开连接
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form
                      className="v-gist-form"
                      onSubmit={e => {
                        e.preventDefault();
                        if (gistToken.trim()) void runGistSync({ token: gistToken.trim(), gistId: gistIdInput.trim() });
                      }}
                    >
                      <div className="v-gist-inputs">
                        <input
                          type="password"
                          autoComplete="off"
                          aria-label="GitHub Token"
                          placeholder="粘贴 GitHub Token（仅需勾选 gist 权限）"
                          value={gistToken}
                          onChange={e => setGistToken(e.target.value)}
                        />
                        <input
                          type="text"
                          autoComplete="off"
                          aria-label="可选 Gist ID"
                          placeholder="Gist ID（留空自动查找或新建）"
                          value={gistIdInput}
                          onChange={e => setGistIdInput(e.target.value)}
                        />
                      </div>
                      <div className="v-actions">
                        <button className="v-primary rc-mini-btn" disabled={!gistToken.trim() || gistBusy}>
                          <Cloud size={15}/>{gistBusy ? "连接并同步中…" : "连接并同步"}
                        </button>
                        <a className="v-secondary rc-mini-btn" href={githubTokenCreateUrl} target="_blank" rel="noreferrer">
                          一键生成 gist Token <ExternalLink size={13}/>
                        </a>
                      </div>
                    </form>
                  )}
                  {gistMessage && <p className="v-muted v-sync-status ok" role="status">{gistMessage}</p>}
                  {gistError && <p className="v-muted v-sync-status err" role="alert">{gistError}</p>}
                </div>

                <div className="v-sync-box">
                  <h2>本机备份与 Google Drive</h2>
                  <p className="v-muted">支持随时导出 JSON 文件迁移进度；电脑端本地运行时还会自动同步 Google Drive 词书与阅读积累库。</p>
                  <div className="v-actions" style={{marginTop:12}}>
                    <label className="v-secondary">导入备份
                      <input type="file" accept=".json,application/json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void importBackup(file);}}/>
                    </label>
                    <button className="v-secondary" disabled={!ready||busy} onClick={exportBackup}>导出备份</button>
                    {driveEnabled && <button className="v-secondary" disabled={driveBusy||busy} onClick={()=>void syncDrive()}>{driveBusy?"正在读取 Google Drive…":"立即同步 Google Drive"}</button>}
                  </div>
                  <p className="v-muted" style={{marginTop:10}} role="status">
                    {driveEnabled ? driveMessage || "页面打开时同步 Google Drive，随后每 10 分钟检查一次。" : "在 iPhone Safari 点「分享 → 添加到主屏幕」即可像原生 App 一样全屏使用。"}
                  </p>
                </div>
              </div>
            </section>
          </>}

          {activeSession && (
            <FlashcardStudio
              session={activeSession}
              cardsById={cardsById}
              busy={busy}
              audioPrefs={audioPrefs}
              studyPrefs={studyPrefs}
              onUpdateAudioPrefs={updateAudioPrefs}
              onUpdateStudyPrefs={updateStudyPrefs}
              onSessionChange={updateActiveSession}
              onRate={(entry, passed) => persist(entry, passed ? "pass" : "again")}
              onNextGroup={(deckId, mode) => {
                const target = decks.find(d => d.id === deckId) ?? activeDeck;
                if (target) launchSession(target, mode);
              }}
              onRetryWrong={(wrongCards, label, mode) => startCustomCards(wrongCards, label, mode)}
              onExit={() => setActiveSession(null)}
            />
          )}
        </>}

        {view==="listening" && ready && <ListeningReview entries={entries} busy={busy}
          rate={(entry, passed)=>persist(entry,passed?"pass":"again")}/>}

        {view==="library" && <>
          <div className="v-heading">
            <div><h1>词句积累</h1><p className="v-muted">查看原句、文中释义和同义改写，支持直接朗读与编辑。</p></div>
            <button className="v-primary" disabled={!ready || busy} onClick={()=>{setEditing(undefined);setDraft(blank);}}><Plus size={18}/>添加词句</button>
          </div>
          {draft && <form className="v-panel v-editor" onSubmit={saveCard}>
            <h2>{editing?"编辑词句":"添加词句"}</h2>
            <label>英文词句<input required value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
            <label>类型<select value={draft.category} onChange={e=>setDraft({...draft,category:e.target.value})}>{categories.map(value=><option key={value}>{value}</option>)}</select></label>
            <label>释义<textarea required rows={3} value={draft.body} onChange={e=>setDraft({...draft,body:e.target.value})}/></label>
            <label>原句或例句<textarea rows={2} value={draft.example} onChange={e=>setDraft({...draft,example:e.target.value})}/></label>
            <div className="v-actions">
              <button className="v-primary" disabled={busy}>保存</button>
              <button className="v-secondary" type="button" disabled={busy} onClick={()=>{setDraft(undefined);setEditing(undefined);}}>取消</button>
            </div>
          </form>}

          <div className="v-filters">
            <label className="v-search"><Search size={18}/><input aria-label="搜索词句" value={query} onChange={e=>{setQuery(e.target.value);setLimit(40);}} placeholder="搜索英文、释义或原句"/></label>
            <select aria-label="来源" value={source} onChange={e=>{setSource(e.target.value);setBatch("");setLimit(40);}}><option value="">全部来源</option>{sources.map(value=><option key={value}>{value}</option>)}</select>
            <select aria-label="类型" value={category} onChange={e=>{setCategory(e.target.value);setLimit(40);}}><option value="">全部类型</option>{categories.map(value=><option key={value}>{value}</option>)}</select>
            <select aria-label="词书天数" value={batch} onChange={e=>{setBatch(e.target.value);setSource("");setLimit(40);}}><option value="">所有天数</option>{visibleBatches.map(group=><option key={group.day} value={group.day}>第 {group.day} 天</option>)}</select>
          </div>
          {ready && <p className="v-muted">{catalog.length} 条积累</p>}

          <div className="v-catalog">{catalog.slice(0,limit).map(card=><details key={card.entry.id} className="v-panel">
            <summary>
              <div className="v-summary-main">
                <strong>{card.term}</strong>
                <div className="v-summary-meta">
                  <span className="v-tag">{card.category}</span>
                  <span className="v-tag sky">{card.source}</span>
                  {card.entry.fields.batch && <span>第 {card.entry.fields.batch} 天 · 第 {card.entry.fields.page} 页</span>}
                  {card.entry.reviewed && <span className="v-tag mint">S{card.entry.stage}</span>}
                </div>
              </div>
              <span className="v-chevron-pill" aria-hidden="true"><ChevronRight size={15}/></span>
            </summary>
            <div className="v-card-content">
              {card.pronunciation && <p className="v-muted">{card.pronunciation}</p>}
              <p>{card.meaning}</p>
              {card.example && <p className="v-example">{card.example}</p>}
              <div className="v-actions">
                <button type="button" className="v-secondary" onClick={()=>speak(card)}><Volume2 size={16}/>朗读</button>
                <button type="button" className="v-secondary" disabled={busy} onClick={()=>editCard(card)}>编辑</button>
                <button type="button" className="v-secondary" onClick={()=>{navigate("curve");setCurveCard(card.entry.id);}}>查看复习曲线</button>
                {safeUrl(card.entry.fields.sourceUrl) && <a className="v-secondary" href={safeUrl(card.entry.fields.sourceUrl)} target="_blank" rel="noreferrer">查看来源</a>}
              </div>
            </div>
          </details>)}</div>
          {catalog.length>limit && <button className="v-secondary v-more" onClick={()=>setLimit(limit+40)}>加载更多</button>}
          {ready && !catalog.length && <p className="v-panel v-empty">没有找到符合条件的词句。</p>}
        </>}

        {view==="curve" && <>
          <div className="v-heading">
            <div>
              <h1>记忆曲线与遗忘预警</h1>
              <p className="v-muted">追踪每条词句的实时记忆保持率、预测未来 7 天复习负荷，直接抢救即将遗忘的词条。</p>
            </div>
          </div>
          {ready && (
            <ReviewCurve
              cards={cards}
              selectedId={curveCard}
              onSelect={setCurveCard}
              onSpeak={speak}
              onRate={(entry, passed) => persist(entry, passed ? "pass" : "again")}
              onStartRescue={startRescue}
              busy={busy}
              daysUntilExam={daysUntilExam}
            />
          )}
        </>}

        {view==="trend" && <>
          <div className="v-heading"><div><h1>阅读趋势与真题复盘</h1><p className="v-muted">按文章汇总首次作答正确率，展开可回看具体真题定位句与可迁移解题规律。</p></div></div>

          {rules.length > 0 && <div className="v-rules-grid">
            {rules.map(rule => (
              <section key={rule.id} className="v-panel v-rule-card">
                <div className="v-summary-meta" style={{marginTop:0}}>
                  <span className="v-tag">{rule.fields.category || "解题规律"}</span>
                  {rule.fields.tags && <span>{rule.fields.tags}</span>}
                </div>
                <h3>{rule.fields.title}</h3>
                <p className="v-muted">{rule.fields.body}</p>
                {rule.fields.example && <p className="v-example">{rule.fields.example}</p>}
              </section>
            ))}
          </div>}

          <section className="v-panel v-trend">
            <h2>各篇阅读正确率</h2>
            {groups.map((group,index) => {
              const questions = readingQuestionsForGroup(entries, group.name, group.date);
              return <div className="v-trend-row" key={index}>
                <div className="v-heading" style={{marginBottom:6}}>
                  <strong>{group.name}</strong>
                  <span className="v-muted">{group.date || "日期待补录"}</span>
                </div>
                {group.total>0 && <progress aria-label={group.name+" 正确率"} value={group.correct} max={group.total}/>}
                <p>
                  {group.total ? Math.round(group.correct/group.total*100)+"% · "+group.correct+"/"+group.total+" 题" : "暂无可计分答案"}
                  {group.missing ? " · "+group.missing+" 题待核对" : ""}
                </p>
                {questions.length > 0 && (
                  <details style={{marginTop:8}}>
                    <summary className="v-muted" style={{fontWeight:650, cursor:"pointer"}}>
                      展开查看本篇 {questions.length} 道题目复盘详情
                    </summary>
                    <div className="v-reading-questions">
                      {questions.map(q => {
                        const ans = firstAnswer(q);
                        const ok = ans && q.fields.correct && ans === q.fields.correct;
                        return <div key={q.id} className="v-reading-q">
                          <div className="v-heading" style={{marginBottom:0}}>
                            <strong>第 {q.fields.n || "?"} 题{q.fields.theme ? ` · ${q.fields.theme}` : ""}</strong>
                            {ans && q.fields.correct ? (
                              <span className={"v-tag "+(ok ? "mint" : "rose")}>
                                原作答 {ans} · 正确 {q.fields.correct}
                              </span>
                            ) : <span className="v-tag peach">待核对</span>}
                          </div>
                          {q.fields.prompt && <p><strong>{q.fields.prompt}</strong></p>}
                          {q.fields.options && <div className="v-options-list">{q.fields.options}</div>}
                          {q.fields.evidence && <p className="v-example">{q.fields.evidence}</p>}
                          {q.fields.conclusion && <p className="v-muted">复盘结论：{q.fields.conclusion}</p>}
                        </div>;
                      })}
                    </div>
                  </details>
                )}
              </div>;
            })}
            {ready && !groups.length && <p className="v-muted">暂无阅读练习记录。导入备份后可查看真题正确率与错题解析。</p>}
          </section>
        </>}
        </div>
      </main>
    </div>
    <GptImportModal
      open={gptModalOpen}
      busy={busy}
      onClose={() => setGptModalOpen(false)}
      onImport={handleGptImport}
    />
  </div>;
}
