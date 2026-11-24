"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AudioLines, BookOpen, CalendarClock, ChartNoAxesCombined, Check, ChevronRight, Clock3, ExternalLink, Eye, Flame, Headphones, Layers3, LibraryBig, PencilLine, Plus, Search, Sparkles, Star, Volume2, Waves } from "lucide-react";
import { dateKey, firstAnswer, type Entry } from "./data";
import { eligible, practiceGroups, readingQuestionsForGroup, readingRules, spellingMatches, studyStreakDays, vocabulary, type Card, type Mode } from "./vocabulary";
import { dailyBatches } from "./daily-vocabulary";
import { readingDocUrl } from "./reading-vocabulary";
import { ReviewCurve } from "./review-curve";
import { importRecords, listRecords, mergeDriveFeed, mergeReadingDriveDoc, saveRecord } from "./local-store";
import { ListeningReview } from "./listening-review";
import heroArt from "./images/model-0.webp?inline";
import spellingArt from "./images/model-1.webp?inline";
import recognizeArt from "./images/model-2.webp?inline";
import recallArt from "./images/model-3.webp?inline";
import "./vocabulary.css";

const modeArt = [spellingArt, recognizeArt, recallArt];
const batchUnlockKey = "cet6-unlocked-batch-v1";
const examDateKey = "cet6-exam-date-v1";
const defaultExamDate = "2026-12-12";
const examPresets = [
  {label:"2026年12月笔试", date:"2026-12-12"},
  {label:"2027年6月笔试", date:"2027-06-12"},
] as const;

const modes = [
  {id:"spelling", title:"单词拼写", detail:"听发音或看字母提示，写出完整英文。", icon:AudioLines},
  {id:"recognize", title:"看词识义", detail:"先回想文中的意思，再翻卡核对。", icon:Eye},
  {id:"recall", title:"看意思写词", detail:"根据中文释义，回忆原来的英文。", icon:PencilLine},
] as const;

const tabs = [
  {id:"review", label:"单词复盘", icon:BookOpen},
  {id:"listening", label:"听力复盘", icon:Headphones},
  {id:"library", label:"词句积累", icon:LibraryBig},
  {id:"curve", label:"复习曲线", icon:Waves},
  {id:"trend", label:"阅读趋势", icon:ChartNoAxesCombined},
] as const;

type View = (typeof tabs)[number]["id"];
type Session = {mode:Mode; cards:Card[]; position:number; correct:number};
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
  const [view, setView] = useState<View>("review");
  const [source, setSource] = useState("");
  const [category, setCategory] = useState("");
  const [batch, setBatch] = useState("");
  const [unlockedPref, setUnlockedPref] = useState<number>(readUnlockedDay);
  const [examDate, setExamDate] = useState<string>(readExamDate);
  const [countdownOpen, setCountdownOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const countdownRef = useRef<HTMLDivElement>(null);
  const [peekCardId, setPeekCardId] = useState("");
  const [limit, setLimit] = useState(40);
  const [curveCard, setCurveCard] = useState("");
  const [includeAll, setIncludeAll] = useState(false);
  const [query, setQuery] = useState("");
  const [session, setSession] = useState<Session>();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<"right"|"wrong"|"shown">();
  const [audioMessage, setAudioMessage] = useState("");
  const [letterHint, setLetterHint] = useState(false);
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

  useEffect(() => {
    void load();
    if (!driveEnabled) return;
    void syncDrive();
    const timer = window.setInterval(()=>void syncDrive(),10*60*1000);
    return ()=>window.clearInterval(timer);
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
  const due = cards.filter(card => (includeAll || confirmed(card)) && (!card.entry.due || card.entry.due <= today));
  const reviewed = cards.filter(card => card.entry.reviewed === today).length;
  const masteredCount = cards.filter(card => Boolean(card.entry.reviewed) && card.entry.due > today).length;
  const listeningEntries = useMemo(() => entries.filter(entry => entry.kind === "listening"), [entries]);
  const listeningMastered = listeningEntries.filter(entry => Boolean(entry.reviewed) && entry.due > today).length;
  const listeningDue = listeningEntries.filter(entry => !entry.due || entry.due <= today).length;

  const pool = cards.filter(card => !source || card.source === source);
  const filteredPool = pool.filter(card => (!category || card.category === category) && (!batch || card.entry.fields.batch === batch));
  const practicePool = view === "review" && !batch && !includeAll ? filteredPool.filter(confirmed) : filteredPool;
  const catalog = filteredPool.filter(card =>
    [card.term, card.meaning, card.example].join(" ").toLowerCase().includes(query.trim().toLowerCase()));
  const active = session?.cards[session.position];
  const finished = Boolean(session && !active);

  function unlockBatchDay(dayNum: number) {
    setUnlockedPref(dayNum);
    try { localStorage.setItem(batchUnlockKey, String(dayNum)); } catch {}
    setNotice(`已解锁至第 ${dayNum} 天词表，对应词条已加入日常复习池。`);
  }

  function resetPrompt() {
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    setInput(""); setResult(undefined); setAudioMessage(""); setLetterHint(false); setError("");
  }

  function navigate(next: View) {
    setView(next); setDraft(undefined); setEditing(undefined); setSession(undefined);
    setSource(""); setCategory(""); setBatch(""); setQuery(""); setLimit(40); setCurveCard(""); setNotice(""); resetPrompt();
  }

  function startRescue(rescueCards: Card[], mode: Mode) {
    const playable = rescueCards.filter(card => eligible(card, mode));
    if (!playable.length) return;
    setView("review");
    resetPrompt();
    setNotice(`已启动临界遗忘抢救模式（共 ${playable.length} 条）。`);
    setSession({ mode, cards: playable, position: 0, correct: 0 });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openBatch(day:string) { navigate("review"); setBatch(day); }

  function start(mode: Mode, includeFuture: boolean) {
    const choices = practicePool.filter(card => eligible(card, mode));
    const ordered = [...choices].sort((a,b) =>
      Number(b.entry.reviewLog?.at(-1)?.passed === false) - Number(a.entry.reviewLog?.at(-1)?.passed === false)
      || Number(Boolean(b.entry.fields.previousSpelling)) - Number(Boolean(a.entry.fields.previousSpelling))
      || Number(Boolean(b.entry.due)) - Number(Boolean(a.entry.due))
      || a.entry.due.localeCompare(b.entry.due));
    const selected = ordered.filter(card => includeFuture || !card.entry.due || card.entry.due <= today);
    if (!selected.length) return;
    resetPrompt(); setNotice(""); setSession({mode, cards:selected, position:0, correct:0});
  }

  function speakText(english: string, fallbackHint = false) {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === "undefined") {
      setAudioMessage("当前浏览器无法播放发音。");
      if (fallbackHint) setLetterHint(true);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(english.split("/")[0].trim());
    utterance.lang = "en-US"; utterance.rate = .86;
    utterance.onerror = event => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setAudioMessage("当前浏览器无法播放发音。");
        if (fallbackHint) setLetterHint(true);
      }
    };
    setAudioMessage(""); window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  }

  function speak(card: Card) {
    speakText(card.term, true);
  }

  async function persist(entry: Entry, action: "pass"|"again"|"save", fields?: Record<string,string>) {
    setBusy(true); setError("");
    try {
      const saved = await saveRecord(entry,action,fields);
      setEntries(previous => [...previous.filter(item => item.id !== saved.id),saved]);
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "保存失败，请重试。");
      return false;
    } finally { setBusy(false); }
  }

  async function rate(correct: boolean) {
    if (!active || !session || busy) return;
    if (await persist(active.entry, correct ? "pass" : "again")) {
      setSession({...session, position:session.position+1, correct:session.correct+Number(correct)});
      resetPrompt();
    }
  }

  // Keyboard shortcuts during active flashcard session
  useEffect(() => {
    if (!active || !session || busy) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (inField || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        speak(active!);
      } else if (session!.mode === "recognize" && !result && event.key === " ") {
        event.preventDefault();
        setResult("shown");
      } else if (result === "shown" && event.key === "1") {
        event.preventDefault();
        void rate(false);
      } else if (result === "shown" && event.key === "2") {
        event.preventDefault();
        void rate(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

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

  const openScopeCards = useMemo(() => (includeAll ? cards : cards.filter(confirmed)), [cards, includeAll, activeDay]);
  const readingCards = useMemo(() => cards.filter(c => c.source === "阅读积累库"), [cards]);
  const readingWordsCount = readingCards.filter(c => c.category === "单词").length;
  const readingPhrasesCount = readingCards.filter(c => c.category === "固定搭配").length;
  const readingParaphraseCount = readingCards.filter(c => c.category === "同义改写").length;
  const readingSentenceCount = readingCards.filter(c => c.category === "关键句").length;
  const bookOpenCount = openScopeCards.filter(c => c.source === "词书复习").length;

  const poolBookCount = practicePool.filter(c => Boolean(c.entry.fields.batch)).length;
  const poolReadingWordPhraseCount = practicePool.filter(c => !c.entry.fields.batch && (c.category === "单词" || c.category === "固定搭配" || c.category === "熟词生义")).length;
  const poolReadingMetaCount = Math.max(0, practicePool.length - poolBookCount - poolReadingWordPhraseCount);

  const previewCandidates = useMemo(() => {
    const sorted = [...practicePool].sort((a, b) =>
      Number(b.entry.reviewLog?.at(-1)?.passed === false) - Number(a.entry.reviewLog?.at(-1)?.passed === false)
      || Number(!b.entry.due || b.entry.due <= today) - Number(!a.entry.due || a.entry.due <= today)
      || Number(b.source === "阅读积累库") - Number(a.source === "阅读积累库")
      || Number(Boolean(b.entry.fields.previousSpelling)) - Number(Boolean(a.entry.fields.previousSpelling))
    );
    return sorted.slice(0, 6);
  }, [practicePool, today]);

  const peekCard = previewCandidates.find(c => c.entry.id === peekCardId) ?? previewCandidates[0];

  const focusPresets = [
    {id:"all", label:"全部范围", count:openScopeCards.length, active:!source && !category && !batch, apply:()=>{setSource("");setCategory("");setBatch("");}},
    {id:"r-word", label:"阅读生词", count:readingWordsCount, active:source==="阅读积累库" && category==="单词" && !batch, apply:()=>{setSource("阅读积累库");setCategory("单词");setBatch("");}},
    {id:"r-phrase", label:"阅读短语", count:readingPhrasesCount, active:source==="阅读积累库" && category==="固定搭配" && !batch, apply:()=>{setSource("阅读积累库");setCategory("固定搭配");setBatch("");}},
    {id:"r-para", label:"同义改写", count:readingParaphraseCount, active:source==="阅读积累库" && category==="同义改写" && !batch, apply:()=>{setSource("阅读积累库");setCategory("同义改写");setBatch("");}},
    {id:"r-sent", label:"阅读关键句", count:readingSentenceCount, active:source==="阅读积累库" && category==="关键句" && !batch, apply:()=>{setSource("阅读积累库");setCategory("关键句");setBatch("");}},
    {id:"book", label:"仅看词书", count:bookOpenCount, active:source==="词书复习" && !category && !batch, apply:()=>{setSource("词书复习");setCategory("");setBatch("");}},
  ];

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
          {!session && <>
            <section className="v-hero">
              <div className="v-hero-copy">
                <span className="v-hero-tag"><Sparkles size={13}/> 今日六级智能复盘</span>
                <h1>准备好开始今天的六级练习了吗？</h1>
                <p>把每日词书、真题阅读与听力里遇到的生词、短语和关键句轻松练熟。</p>
                <div className="v-actions">
                  <button className="hero-primary" onClick={()=>document.getElementById("practice-modes")?.scrollIntoView({behavior:"smooth", block:"start"})}>
                    继续今日复习
                  </button>
                  <button className="hero-secondary" onClick={()=>navigate("library")}>
                    浏览词句积累
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
              {label:"今日已复习", value:reviewed, icon:Check, tone:"mint"},
              {label:"每日词书词条", value:cards.filter(c=>c.entry.fields.batch).length, icon:Layers3, tone:"blue"},
              {label:"阅读与手动积累", value:cards.filter(c=>!c.entry.fields.batch).length, icon:Star, tone:"orange"},
            ].map(({label,value,icon:Icon,tone}) => (
              <div className="v-panel" key={label}>
                <span className={"metric-icon "+tone}><Icon size={20}/></span>
                <dd>{ready ? value : "—"}</dd>
                <dt>{label}</dt>
              </div>
            ))}</dl>

            <div className="v-dashboard">
              <section className="v-panel v-module" id="practice-modes">
                <div className="v-heading">
                  <h2>选择练习方式</h2>
                  <div className="v-actions">
                    <label className="v-filter">来源
                      <select value={source} onChange={e=>{setSource(e.target.value);setBatch("");}}>
                        <option value="">全部来源</option>
                        {sources.map(value=><option key={value}>{value}</option>)}
                      </select>
                    </label>
                    <label className="v-filter">类型
                      <select value={category} onChange={e=>setCategory(e.target.value)}>
                        <option value="">全部类型</option>
                        {categories.map(value=><option key={value}>{value}</option>)}
                      </select>
                    </label>
                    {batch && <button className="v-secondary" onClick={()=>setBatch("")}>清除第 {batch} 天筛选</button>}
                  </div>
                </div>

                <div className="v-scope-bar">
                  <label className="v-scope">
                    <input type="checkbox" checked={includeAll} onChange={e=>setIncludeAll(e.target.checked)}/>
                    复习范围包含全部词表（含未开启天数）
                  </label>
                  <span className="v-muted">{batch ? `当前仅练第 ${batch} 天` : includeAll ? "当前范围：全部词表" : `当前范围：第 1–${activeDay} 天及阅读积累`}</span>
                </div>

                <div className="v-modes">{modes.map(({id,title,detail},index)=>{
                  const count = practicePool.filter(card=>eligible(card,id)).length;
                  const dueCount = practicePool.filter(card=>eligible(card,id) && (!card.entry.due || card.entry.due<=today)).length;
                  return <section className={"v-mode v-mode-"+id} key={id}>
                    <div>
                      <h3>{title}</h3>
                      <p>{detail}</p>
                    </div>
                    <img className="v-mode-render" src={modeArt[index]} alt="" width="500" height="500"/>
                    <button className="v-mode-btn" disabled={!ready || !count} onClick={()=>start(id,!dueCount)}>
                      {dueCount ? "开始复习 · "+dueCount+" 条" : count ? "自由复习 · "+count+" 条" : "暂无可练词条"}
                    </button>
                  </section>;
                })}</div>

                <div className="v-practice-dock">
                  <div className="v-focus-strip" role="group" aria-label="专项快速筛选">
                    <span className="v-dock-label">专项聚焦</span>
                    <div className="v-focus-pills">
                      {focusPresets.map(preset => (
                        <button
                          key={preset.id}
                          type="button"
                          className={"v-focus-pill "+(preset.active?"active":"")}
                          onClick={preset.apply}
                        >
                          <span>{preset.label}</span>
                          <i>{ready ? preset.count : "—"}</i>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="v-pool-preview">
                    <div className="v-pool-header">
                      <div className="v-pool-title">
                        <strong>当前范围词池构成</strong>
                        <span className="v-muted">{ready ? `共 ${practicePool.length} 条可练` : "读取中…"}</span>
                      </div>
                      <div className="v-pool-legend">
                        <span><i className="dot book"/>词书 {poolBookCount}</span>
                        <span><i className="dot reading"/>阅读词组 {poolReadingWordPhraseCount}</span>
                        <span><i className="dot meta"/>改写/关键句 {poolReadingMetaCount}</span>
                      </div>
                    </div>

                    <div className="v-composition-bar" aria-hidden="true">
                      {practicePool.length > 0 && <>
                        {poolBookCount > 0 && <span className="seg book" style={{flexGrow: poolBookCount}}/>}
                        {poolReadingWordPhraseCount > 0 && <span className="seg reading" style={{flexGrow: poolReadingWordPhraseCount}}/>}
                        {poolReadingMetaCount > 0 && <span className="seg meta" style={{flexGrow: poolReadingMetaCount}}/>}
                      </>}
                    </div>

                    {previewCandidates.length > 0 ? (
                      <div className="v-peek-zone">
                        <div className="v-peek-chips">
                          {previewCandidates.map(card => {
                            const selected = peekCard?.entry.id === card.entry.id;
                            return (
                              <button
                                key={card.entry.id}
                                type="button"
                                className={"v-peek-chip "+(selected?"active":"")}
                                onClick={()=>{setPeekCardId(card.entry.id); speak(card);}}
                                title="点击试听发音并预览释义"
                              >
                                <Volume2 size={12}/>
                                <span>{card.term.length > 26 ? card.term.slice(0,25)+"…" : card.term}</span>
                              </button>
                            );
                          })}
                        </div>
                        {peekCard && (
                          <div className="v-peek-gloss">
                            <div className="v-peek-gloss-text">
                              <strong>{peekCard.term}</strong>
                              {peekCard.pronunciation && <span className="v-peek-ipa">{peekCard.pronunciation}</span>}
                              <span className="v-peek-meaning">{peekCard.meaning.replace(/\n+/g," · ")}</span>
                            </div>
                            <div className="v-peek-gloss-meta">
                              <span className="v-tag">{peekCard.category}</span>
                              <span className="v-tag sky">{peekCard.source}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="v-muted" style={{marginTop:8}}>当前筛选条件下暂无词条，点击上方“全部范围”可重置。</p>
                    )}

                    <div className="v-dock-foot">
                      <span className="v-shortcut-tip">快捷键：R 朗读 · Space 翻卡 · 1 还不熟 · 2 答对了</span>
                      <a className="v-drive-doc-link" href={readingDocUrl} target="_blank" rel="noreferrer">
                        Google Drive 阅读积累库 ({ready ? readingCards.length : "—"} 条)<ExternalLink size={12}/>
                      </a>
                    </div>
                  </div>
                </div>
              </section>

              <section className="v-panel v-module">
                <h2>每日进度与词表</h2>
                <div className="v-progress-bars">
                  <div className="v-goal-row">
                    <div className="v-goal-head"><span>今日复习完成度</span><span>{todayGoalPct}%</span></div>
                    <div className="v-track"><div className="v-fill purple" style={{width:`${todayGoalPct}%`}}/></div>
                  </div>
                  <div className="v-goal-row">
                    <div className="v-goal-head"><span>听力复盘掌握度</span><span>{listenGoalPct}%</span></div>
                    <div className="v-track"><div className="v-fill mint" style={{width:`${listenGoalPct}%`}}/></div>
                  </div>
                  <div className="v-goal-row">
                    <div className="v-goal-head"><span>开放词表巩固率</span><span>{vocabGoalPct}%</span></div>
                    <div className="v-track"><div className="v-fill peach" style={{width:`${vocabGoalPct}%`}}/></div>
                  </div>
                </div>

                <p className="v-muted">当前开放至第 {activeDay} 天 · 点击天数可单独筛选</p>
                <div className="v-batches">
                  {visibleBatches.map(group => {
                    const dayNum = Number(group.day);
                    const unlocked = dayNum <= activeDay;
                    return <div className="v-batch-row" key={group.day}>
                      <button
                        className={"v-batch "+(batch===group.day?"selected":"")}
                        aria-pressed={batch===group.day}
                        onClick={()=>openBatch(group.day)}
                      >
                        <span>
                          <strong>第 {group.day} 天</strong>
                          <small>第 {group.first}–{group.last} 页 · {group.count} 词{group.learned ? ` · 已学 ${group.learned}` : ""}</small>
                        </span>
                        <span className={"v-batch-status "+(unlocked?"":"locked")}>{unlocked ? "可复习" : "待开启"}</span>
                      </button>
                      {!unlocked && (
                        <button type="button" className="v-unlock-btn" onClick={()=>unlockBatchDay(dayNum)} title={`将第 ${group.day} 天纳入日常复习`}>
                          开启
                        </button>
                      )}
                    </div>;
                  })}
                </div>
              </section>
            </div>

            <section className="v-panel v-module v-local-backup">
              <h2>本机学习数据与云同步</h2>
              <p className="v-muted">进度保存在当前浏览器。换电脑或浏览器时，可以用 JSON 备份迁移。</p>
              <div className="v-actions">
                <label className="v-secondary">导入备份
                  <input type="file" accept=".json,application/json" onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value="";void importBackup(file);}}/>
                </label>
                <button className="v-secondary" disabled={!ready||busy} onClick={exportBackup}>导出备份</button>
                {driveEnabled && <button className="v-secondary" disabled={driveBusy||busy} onClick={()=>void syncDrive()}>{driveBusy?"正在读取 Google Drive…":"立即同步 Google Drive"}</button>}
              </div>
              <p className="v-muted" style={{marginTop:10}} role="status">
                {driveEnabled ? driveMessage || "页面打开时同步，随后每 10 分钟检查一次。" : "双击打开的版本支持离线使用。自动同步请从 project 文件夹启动本地版。"}
              </p>
            </section>
          </>}

          {session && <section className="v-panel v-practice">
            <div className="v-heading">
              <h2>{modes.find(mode=>mode.id===session.mode)?.title}</h2>
              <button className="v-secondary" disabled={busy} onClick={()=>{setSession(undefined);resetPrompt();}}>返回练习选择</button>
            </div>

            {active && <div className="v-active-card" key={active.entry.id}>
              <div className="v-session-bar">
                <span>第 {session.position+1} / {session.cards.length} 条 · {active.category}{active.entry.fields.batch ? ` · 第 ${active.entry.fields.batch} 天` : ""}</span>
                <span>答对 {session.correct} 条 · 阶段 S{active.entry.stage}</span>
              </div>
              <progress aria-label="本轮进度" value={session.position+1} max={session.cards.length}/>

              {session.mode==="spelling" ? <div className="v-prompt">
                <div className="v-actions">
                  <button className="v-secondary" type="button" onClick={()=>speak(active)}><Volume2 size={18}/>播放发音 (R)</button>
                  {!letterHint && <button className="v-secondary" type="button" onClick={()=>setLetterHint(true)}>字母提示</button>}
                </div>
                {audioMessage && <p role="status" className="v-muted" style={{marginTop:8}}>{audioMessage}</p>}
                {letterHint && <div className="v-hint">
                  <strong>{active.term.split("/")[0].trim().replace(/[a-z]+/gi, word=>word[0]+"·".repeat(word.length-1))}</strong>
                  <p>{active.meaning}</p>
                </div>}
              </div> : <div className={"v-prompt "+(session.mode==="recognize"?"v-english":"")}>
                {session.mode==="recognize" ? <>
                  <span>{active.term}</span>
                  {active.pronunciation && <span className="v-phonetic">{active.pronunciation}</span>}
                </> : active.meaning}
              </div>}

              {session.mode==="recognize" && !result && (
                <div className="v-actions">
                  <button className="v-primary" onClick={()=>setResult("shown")}>显示释义 (Space)</button>
                  <button className="v-secondary" type="button" onClick={()=>speak(active)}><Volume2 size={17}/>朗读 (R)</button>
                </div>
              )}

              {session.mode!=="recognize" && !result && <form className="v-answer" onSubmit={e=>{e.preventDefault();if(input.trim())setResult(spellingMatches(active.term,input)?"right":"wrong");}}>
                <label htmlFor="v-answer" className="v-muted">输入完整英文词句</label>
                <input key={active.entry.id} id="v-answer" autoFocus autoComplete="off" autoCorrect="off" spellCheck={false} value={input} onChange={e=>setInput(e.target.value)}/>
                <div className="v-actions">
                  <button className="v-primary" disabled={!input.trim()}>检查答案</button>
                  <button type="button" className="v-secondary" onClick={()=>setResult("wrong")}>想不起来</button>
                </div>
              </form>}

              {result && <div className={"v-feedback v-feedback-"+result} aria-live="polite">
                <div className="v-heading" style={{marginBottom:0}}>
                  <span className={"v-feedback-badge "+result}>
                    {result==="right" ? "✓ 拼写正确" : result==="wrong" ? "再复习一次" : "对照释义"}
                  </span>
                  <button type="button" className="v-secondary" onClick={()=>speak(active)}><Volume2 size={16}/>朗读 (R)</button>
                </div>
                <p className="v-english">{active.term}{active.pronunciation && <span className="v-phonetic">{active.pronunciation}</span>}</p>
                <p>{active.meaning}</p>
                {active.example && <p className="v-example">{active.example}</p>}
                {input.trim() && result==="wrong" && <p className="v-muted">你的拼写：<strong>{input}</strong></p>}
                {active.entry.fields.previousSpelling && <p className="v-muted">以前写成过：{active.entry.fields.previousSpelling}</p>}
                <div className="v-actions" style={{marginTop:4}}>
                  {result==="shown" ? <>
                    <button className="v-primary" disabled={busy} onClick={()=>void rate(true)}><Check size={17}/>答对了 (2)</button>
                    <button className="v-secondary" disabled={busy} onClick={()=>void rate(false)}>还不熟 (1)</button>
                  </> : (
                    <button className="v-primary" autoFocus disabled={busy} onClick={()=>void rate(result==="right")}>
                      {busy ? "保存中…" : "保存并继续"}
                    </button>
                  )}
                </div>
              </div>}
            </div>}

            {finished && <div className="v-summary">
              <h3>本轮练习完成 🎉</h3>
              <p>共复习了 {session.cards.length} 条，答对 {session.correct} 条（正确率 {Math.round(session.correct / Math.max(1, session.cards.length) * 100)}%）。</p>
              <button className="v-primary" onClick={()=>setSession(undefined)}>返回继续复习</button>
            </div>}
          </section>}
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
  </div>;
}
