"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, BookText, Check, CheckCheck, Eye, Flame, GitCompareArrows, Lightbulb, RotateCcw, Sparkles, Undo2, Volume2, VolumeX, X, Zap } from "lucide-react";
import type { Entry } from "./data";
import { spellingMatches, type Card, type Mode } from "./vocabulary";
import { findLookAlikes } from "./confusable-words";
import {
  extractEnglishExample,
  speakEnglish,
  spellingDiff,
  stopSpeaking,
  type AudioPrefs,
  type SavedSession,
  type StudyKind,
  type StudyPrefs,
} from "./study-session";

type DeckRemaining = {
  unlearned: number;
  dueReview: number;
  learned: number;
  total: number;
};

type NextDeckHint = {
  deckId: string;
  title: string;
  unlearnedCount: number;
};

type Props = {
  session: SavedSession;
  allCards: Card[];
  cardsById: Map<string, Card>;
  busy: boolean;
  audioPrefs: AudioPrefs;
  studyPrefs: StudyPrefs;
  deckRemaining?: DeckRemaining;
  nextDeckHint?: NextDeckHint;
  onUpdateAudioPrefs: (next: AudioPrefs) => void;
  onUpdateStudyPrefs: (next: StudyPrefs) => void;
  onSessionChange: (next: SavedSession | null) => void;
  onRate: (entry: Entry, passed: boolean) => Promise<boolean>;
  onMaster: (entry: Entry) => Promise<boolean>;
  onUndo: (snapshot: Entry) => Promise<boolean>;
  onNextGroup: (deckId: string, mode: Mode, kind: StudyKind) => void;
  onRetryWrong: (wrongCards: Card[], deckLabel: string, mode: Mode) => void;
  onExit: () => void;
};

const modeNames: Record<Mode, string> = {
  recognize: "看词识义",
  spelling: "听音拼写",
  recall: "看义写词",
};

const kindMeta: Record<StudyKind, { label: string; short: string; tone: string }> = {
  new:    { label: "学新词", short: "新词", tone: "new" },
  review: { label: "到期复习", short: "复习", tone: "review" },
  mix:    { label: "智能混合", short: "混合", tone: "mix" },
  free:   { label: "自由速刷", short: "速刷", tone: "free" },
};

type RevealState = undefined | "check-know" | "check-miss" | "shown" | "right" | "wrong";

type FlipSnapshot = {
  termRect?: DOMRect;
  ipaRect?: DOMRect;
  speakRect?: DOMRect;
};

type UndoRecord = {
  prevSession: SavedSession;
  prevEntry: Entry;
};

function splitExampleParts(raw?: string): { english: string; chinese: string; note: string } {
  if (!raw) return { english: "", chinese: "", note: "" };
  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  let english = "";
  let chinese = "";
  let note = "";
  for (const line of lines) {
    if (/^(?:例|题)[｜|]/.test(line)) {
      const cleaned = line.replace(/^(?:例|题)[｜|]\s*/, "");
      if (!english && /[a-zA-Z]{3,}/.test(cleaned)) english = cleaned;
      else note = note ? `${note}\n${line}` : line;
    } else if (/^译[｜|]/.test(line)) {
      const cleaned = line.replace(/^译[｜|]\s*/, "");
      chinese = chinese ? `${chinese}\n${cleaned}` : cleaned;
    } else if (/^记[｜|]/.test(line)) {
      note = note ? `${note}\n${line}` : line;
    } else if (!english && /[a-zA-Z]{3,}/.test(line) && !/^[\u4e00-\u9fa5]/.test(line)) {
      english = line;
    } else if (!chinese && /[\u4e00-\u9fa5]/.test(line)) {
      chinese = line;
    } else {
      note = note ? `${note}\n${line}` : line;
    }
  }
  return { english, chinese, note };
}

function highlightTermInSentence(sentence: string, term: string): ReactNode {
  const stem = term.split("/")[0].replace(/\+\s*[\u4e00-\u9fa5]+/g, "").replace(/\.{2,}|…/g, "").trim();
  const rootWord = stem.split(/\s+/)[0];
  if (!rootWord || rootWord.length < 3 || !/^[a-zA-Z'-]+$/.test(rootWord)) return sentence;
  const base = rootWord.length > 5 ? rootWord.slice(0, rootWord.length - 1) : rootWord;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(\\b${escaped}[a-zA-Z'’-]*\\b)`, "gi");
  const parts = sentence.split(regex);
  if (parts.length <= 1) return sentence;
  return parts.map((part, idx) =>
    idx % 2 === 1 ? <mark key={idx} className="fs-ex-mark">{part}</mark> : <span key={idx}>{part}</span>,
  );
}

function animateFlip(el: HTMLElement | null, fromRect: DOMRect | undefined, duration = 420) {
  if (!el || !fromRect || typeof el.animate !== "function") return;
  const toRect = el.getBoundingClientRect();
  if (!toRect.width || !toRect.height || !fromRect.width || !fromRect.height) return;

  const scale = Math.min(2.8, Math.max(0.55, fromRect.height / toRect.height));
  const dx = (fromRect.left + fromRect.width / 2) - (toRect.left + toRect.width / 2);
  const dy = (fromRect.top + fromRect.height / 2) - (toRect.top + toRect.height / 2);

  if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.03) return;

  el.animate(
    [
      { transform: `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0) scale(${scale.toFixed(3)})` },
      { transform: "translate3d(0, 0, 0) scale(1)" },
    ],
    {
      duration,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "none",
    },
  );
}

export function FlashcardStudio({
  session,
  allCards,
  cardsById,
  busy,
  audioPrefs,
  studyPrefs,
  deckRemaining,
  nextDeckHint,
  onUpdateAudioPrefs,
  onUpdateStudyPrefs,
  onSessionChange,
  onRate,
  onMaster,
  onUndo,
  onNextGroup,
  onRetryWrong,
  onExit,
}: Props) {
  const [reveal, setReveal] = useState<RevealState>(undefined);
  const [input, setInput] = useState("");
  const [letterHint, setLetterHint] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioNote, setAudioNote] = useState("");
  const [undoStack, setUndoStack] = useState<UndoRecord[]>([]);
  const [undoToast, setUndoToast] = useState("");

  const termRef = useRef<HTMLHeadingElement>(null);
  const ipaRef = useRef<HTMLSpanElement>(null);
  const speakRef = useRef<HTMLButtonElement>(null);
  const flipSnapRef = useRef<FlipSnapshot | null>(null);

  const activeId = session.queueIds[session.position];
  const activeCard = activeId ? cardsById.get(activeId) : undefined;
  const finished = session.position >= session.queueIds.length || !activeCard;
  const isRequeued = Boolean(activeId && session.requeuedIds.includes(activeId));
  const kindInfo = kindMeta[session.studyKind ?? "mix"];

  const exampleParts = useMemo(() => splitExampleParts(activeCard?.example), [activeCard?.example]);
  const englishExample = exampleParts.english || extractEnglishExample(activeCard?.example);
  const lookAlikes = useMemo(
    () => (activeCard ? findLookAlikes(activeCard, allCards, 4) : []),
    [activeCard, allCards],
  );

  const termLength = activeCard?.term.length ?? 0;
  const termSizeClass = termLength > 26 ? " long" : termLength > 14 ? " medium" : "";

  function playText(text: string, dedupeKey?: string) {
    setAudioNote("");
    speakEnglish(text, {
      rate: audioPrefs.rate,
      dedupeKey,
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
      onError: msg => setAudioNote(msg),
    });
  }

  function triggerReveal(next: RevealState) {
    if (!reveal && next && session.mode === "recognize") {
      const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (!reduced) {
        flipSnapRef.current = {
          termRect: termRef.current?.getBoundingClientRect(),
          ipaRect: ipaRef.current?.getBoundingClientRect(),
          speakRect: speakRef.current?.getBoundingClientRect(),
        };
      }
    }
    setReveal(next);
  }

  useLayoutEffect(() => {
    const snap = flipSnapRef.current;
    if (!reveal || !snap) return;
    flipSnapRef.current = null;
    animateFlip(termRef.current, snap.termRect, 430);
    animateFlip(ipaRef.current, snap.ipaRect, 400);
    animateFlip(speakRef.current, snap.speakRect, 380);
  }, [reveal]);

  useEffect(() => {
    if (finished || !activeCard) return;
    if (!audioPrefs.autoPlay) return;
    if (session.mode === "recall") return;
    playText(activeCard.term, `card:${session.position}:${activeCard.entry.id}`);
  }, [session.position, activeCard?.entry.id, session.mode, audioPrefs.autoPlay, finished]);

  useEffect(() => () => stopSpeaking(), []);

  function resetCardUi() {
    flipSnapRef.current = null;
    setReveal(undefined);
    setInput("");
    setLetterHint(false);
    setAudioNote("");
  }

  async function commitAndAdvance(outcome: "pass" | "again" | "master") {
    if (!activeCard || busy) return;
    const prevEntrySnapshot: Entry = JSON.parse(JSON.stringify(activeCard.entry)) as Entry;
    const prevSessionSnapshot: SavedSession = {
      ...session,
      queueIds: [...session.queueIds],
      uniqueIds: [...session.uniqueIds],
      masteredIds: [...session.masteredIds],
      wrongIds: [...session.wrongIds],
      requeuedIds: [...session.requeuedIds],
    };

    const saved = outcome === "master"
      ? await onMaster(activeCard.entry)
      : await onRate(activeCard.entry, outcome === "pass");
    if (!saved) return;

    setUndoStack(prev => [...prev.slice(-9), { prevSession: prevSessionSnapshot, prevEntry: prevEntrySnapshot }]);
    setUndoToast(outcome === "master" ? `已「斩」${activeCard.term}（60 天后再复习）` : "");

    const currentId = activeCard.entry.id;
    const nextQueue = [...session.queueIds];
    const nextMastered = new Set(session.masteredIds);
    const nextWrong = new Set(session.wrongIds);
    const nextRequeued = new Set(session.requeuedIds);

    if (outcome === "pass" || outcome === "master") {
      nextMastered.add(currentId);
      nextRequeued.delete(currentId);
    } else {
      nextWrong.add(currentId);
      // Reinforce missed words 2-3 cards ahead while short-term memory is still warm
      const aheadSlice = nextQueue.slice(session.position + 1);
      if (!aheadSlice.includes(currentId)) {
        const insertAt = Math.min(session.position + 3, nextQueue.length);
        nextQueue.splice(insertAt, 0, currentId);
        nextRequeued.add(currentId);
      }
    }

    const nextPos = session.position + 1;
    const updated: SavedSession = {
      ...session,
      queueIds: nextQueue,
      position: nextPos,
      masteredIds: [...nextMastered],
      wrongIds: [...nextWrong],
      requeuedIds: [...nextRequeued],
      updatedAt: new Date().toISOString(),
    };

    const nextCardId = nextQueue[nextPos];
    const nextCard = nextCardId ? cardsById.get(nextCardId) : undefined;
    if (nextCard && audioPrefs.autoPlay && session.mode !== "recall") {
      playText(nextCard.term, `card:${nextPos}:${nextCard.entry.id}`);
    } else {
      stopSpeaking();
    }

    resetCardUi();
    onSessionChange(updated);
  }

  async function handleUndoLast() {
    if (!undoStack.length || busy) return;
    const last = undoStack[undoStack.length - 1];
    const ok = await onUndo(last.prevEntry);
    if (!ok) return;
    setUndoStack(prev => prev.slice(0, -1));
    setUndoToast(`已撤销「${last.prevEntry.fields.title || "上一词"}」`);
    resetCardUi();
    onSessionChange(last.prevSession);
  }

  function handleCheckSpelling() {
    if (!activeCard || !input.trim()) return;
    const ok = spellingMatches(activeCard.term, input);
    setReveal(ok ? "right" : "wrong");
    if (audioPrefs.autoPlay) {
      playText(activeCard.term, `reveal:${session.position}:${activeCard.entry.id}`);
    }
  }

  function handleGiveUpSpelling() {
    if (!activeCard) return;
    setReveal("wrong");
    if (audioPrefs.autoPlay) {
      playText(activeCard.term, `reveal:${session.position}:${activeCard.entry.id}`);
    }
  }

  useEffect(() => {
    if (finished || !activeCard || busy) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const inField = target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (inField) return;

      if (event.key === "r" || event.key === "R") {
        event.preventDefault();
        playText(activeCard!.term);
        return;
      }
      if ((event.key === "z" || event.key === "Z") && undoStack.length) {
        event.preventDefault();
        void handleUndoLast();
        return;
      }

      if (session.mode === "recognize") {
        if (!reveal) {
          if (event.key === "1" || event.key === "ArrowLeft") {
            event.preventDefault();
            if (studyPrefs.instantKnow) void commitAndAdvance("pass");
            else triggerReveal("check-know");
          } else if (event.key === " ") {
            event.preventDefault();
            triggerReveal("shown");
          } else if (event.key === "2" || event.key === "ArrowRight") {
            event.preventDefault();
            triggerReveal("check-miss");
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (studyPrefs.instantKnow) void commitAndAdvance("pass");
            else triggerReveal("check-know");
          }
        } else {
          if (event.key === "1" || event.key === "ArrowLeft") {
            event.preventDefault();
            void commitAndAdvance("pass");
          } else if (event.key === "2" || event.key === "ArrowRight") {
            event.preventDefault();
            void commitAndAdvance("again");
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void commitAndAdvance(reveal !== "check-miss" ? "pass" : "again");
          }
        }
      } else if (reveal === "right" || reveal === "wrong") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void commitAndAdvance(reveal === "right" ? "pass" : "again");
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const totalUnique = Math.max(1, session.uniqueIds.length);
  const masteredUnique = session.masteredIds.length;
  const firstTryCorrect = session.uniqueIds.filter(id => session.masteredIds.includes(id) && !session.wrongIds.includes(id)).length;
  const wrongCardsList = session.wrongIds.map(id => cardsById.get(id)).filter((c): c is Card => Boolean(c));
  const sessionWords = session.uniqueIds.map(id => cardsById.get(id)).filter((c): c is Card => Boolean(c));
  const masteredPct = Math.min(100, Math.round((masteredUnique / totalUnique) * 100));
  const pendingRetryPct = Math.min(100 - masteredPct, Math.round((session.requeuedIds.length / totalUnique) * 100));

  if (finished) {
    const accuracy = Math.round((firstTryCorrect / totalUnique) * 100);
    const hasMoreNew = (deckRemaining?.unlearned ?? 0) > 0;
    const hasMoreDue = (deckRemaining?.dueReview ?? 0) > 0;
    const nextActionKind: StudyKind | null =
      session.studyKind === "new"
        ? (hasMoreNew ? "new" : hasMoreDue ? "review" : null)
        : session.studyKind === "review"
          ? (hasMoreDue ? "review" : hasMoreNew ? "new" : null)
          : hasMoreNew
            ? "new"
            : hasMoreDue
              ? "review"
              : "free";

    const primaryNextLabel =
      nextActionKind === "new"
        ? `继续学下一组新词（本表剩 ${deckRemaining?.unlearned} 词）`
        : nextActionKind === "review"
          ? `继续复习到期词（本表剩 ${deckRemaining?.dueReview} 词）`
          : nextDeckHint
            ? `开启「${nextDeckHint.title}」学新词（${nextDeckHint.unlearnedCount} 词）`
            : "继续自由速刷下一组";

    return (
      <section className="v-panel fs-shell fs-complete">
        <div className="fs-complete-badge"><Sparkles size={24}/></div>
        <h2>本组{kindInfo.label}完成！</h2>
        <p className="v-muted">
          {session.deckLabel} · {modeNames[session.mode]}
          {deckRemaining ? ` · 本表已学 ${deckRemaining.learned}/${deckRemaining.total}` : ""}
        </p>

        <div className="fs-summary-stats">
          <div>
            <strong>{totalUnique}</strong>
            <span>本组词条</span>
          </div>
          <div>
            <strong className="mint">{accuracy}%</strong>
            <span>首次认识率</span>
          </div>
          <div>
            <strong className={wrongCardsList.length ? "peach" : "mint"}>{wrongCardsList.length}</strong>
            <span>需重点巩固</span>
          </div>
        </div>

        {wrongCardsList.length > 0 && (
          <div className="fs-wrong-review">
            <div className="fs-wrong-head">
              <strong>本轮不熟词清单（点词复听）</strong>
              <button
                type="button"
                className="v-secondary rc-mini-btn"
                onClick={() => onRetryWrong(wrongCardsList, `${session.deckLabel} · 错词巩固`, session.mode)}
              >
                <RotateCcw size={14}/>只重练这 {wrongCardsList.length} 词
              </button>
            </div>
            <div className="fs-wrong-chips">
              {wrongCardsList.map(card => (
                <button
                  key={card.entry.id}
                  type="button"
                  className="fs-wrong-item"
                  onClick={() => playText(card.term)}
                >
                  <div>
                    <strong>{card.term}</strong>
                    <small>{card.meaning.replace(/\n+/g, " · ")}</small>
                  </div>
                  <Volume2 size={15}/>
                </button>
              ))}
            </div>
          </div>
        )}

        {!wrongCardsList.length && sessionWords.length > 0 && (
          <div className="fs-batch-recap">
            <strong className="v-muted">本组全部一次过关（点任意词可再听发音）</strong>
            <div className="fs-recap-pills">
              {sessionWords.map(card => (
                <button key={card.entry.id} type="button" className="fs-recap-pill" onClick={() => playText(card.term)}>
                  {card.term}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="fs-complete-actions">
          <button
            type="button"
            className="v-primary"
            onClick={() => {
              if (nextActionKind) onNextGroup(session.deckId, session.mode, nextActionKind);
              else if (nextDeckHint) onNextGroup(nextDeckHint.deckId, session.mode, "new");
              else onNextGroup(session.deckId, session.mode, "free");
            }}
          >
            {primaryNextLabel}
          </button>
          <button type="button" className="v-secondary" onClick={onExit}>
            返回首页
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="v-panel fs-shell">
      {/* Compact Single-Row Top Focus Bar */}
      <div className="fs-topbar">
        <button
          type="button"
          className="fs-back-btn"
          disabled={busy}
          title="进度已自动保存，随时可继续"
          onClick={() => { stopSpeaking(); onExit(); }}
        >
          <ArrowLeft size={16}/>
          <span>返回</span>
        </button>

        <div className="fs-progress-meta">
          <div className="fs-progress-labels">
            <div className="fs-deck-title-wrap">
              <span className={"fs-kind-badge " + kindInfo.tone}>{kindInfo.short}</span>
              <strong>{session.deckLabel}</strong>
            </div>
            <span>
              <b>{session.position + 1}/{session.queueIds.length}</b>
              <em className="fs-prog-detail"> · 已过 {masteredUnique}/{totalUnique}</em>
            </span>
          </div>
          <div className="fs-progress-track" aria-label="本轮进度">
            <span className="fs-prog-ok" style={{ width: `${masteredPct}%` }}/>
            <span className="fs-prog-retry" style={{ width: `${pendingRetryPct}%` }}/>
          </div>
        </div>

        <div className="fs-audio-controls">
          {undoStack.length > 0 && (
            <button
              type="button"
              className="fs-ctrl-pill fs-undo-btn"
              disabled={busy}
              onClick={() => void handleUndoLast()}
              title="撤销上一词的判定 (快捷键 Z)"
              aria-label="撤销上一词"
            >
              <Undo2 size={14}/>
              <span className="fs-ctrl-label">撤销</span>
            </button>
          )}
          <button
            type="button"
            className={"fs-ctrl-pill " + (audioPrefs.autoPlay ? "on" : "")}
            onClick={() => onUpdateAudioPrefs({ ...audioPrefs, autoPlay: !audioPrefs.autoPlay })}
            title="切换切词时是否自动朗读英文发音"
            aria-label={audioPrefs.autoPlay ? "自动播音已开启" : "自动播音已关闭"}
          >
            {audioPrefs.autoPlay ? <Volume2 size={15}/> : <VolumeX size={15}/>}
            <span className="fs-ctrl-label">{audioPrefs.autoPlay ? "播音" : "静音"}</span>
          </button>
          <button
            type="button"
            className="fs-ctrl-pill"
            onClick={() => onUpdateAudioPrefs({ ...audioPrefs, rate: audioPrefs.rate < 0.95 ? 1.0 : 0.85 })}
            title="切换朗读语速"
          >
            <span>{audioPrefs.rate < 0.95 ? "0.85x" : "1.0x"}</span>
          </button>
          {session.mode === "recognize" && (
            <button
              type="button"
              className={"fs-ctrl-pill " + (studyPrefs.instantKnow ? "on" : "")}
              onClick={() => onUpdateStudyPrefs({ ...studyPrefs, instantKnow: !studyPrefs.instantKnow })}
              title="开启后点「认识」直接进入下一词"
              aria-label={studyPrefs.instantKnow ? "闪电切词模式" : "核对释义模式"}
            >
              <Zap size={14}/>
              <span className="fs-ctrl-label">{studyPrefs.instantKnow ? "闪电" : "核对"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Full-Height Balanced Stage — Zero Top Void, Silky Morph on Reveal */}
      <div className={"fs-stage-body" + (reveal ? " revealed" : "")} key={`${session.position}-${activeCard.entry.id}`}>
        <div className="fs-card-tags">
          <span className="v-tag">{activeCard.category}</span>
          <span className="v-tag sky">{activeCard.source}</span>
          {activeCard.entry.fields.batch && (
            <span className="v-tag">Day {activeCard.entry.fields.batch} · P{activeCard.entry.fields.page}</span>
          )}
          <span className="v-tag mint">{activeCard.entry.reviewed ? `S${activeCard.entry.stage}` : "新词"}</span>
          {isRequeued && <span className="v-tag rose"><Flame size={11}/>本轮巩固</span>}
          <button
            type="button"
            className="fs-master-btn"
            disabled={busy}
            title="太简单？点击「斩」直接标记完全掌握，60 天内不再出现"
            onClick={() => void commitAndAdvance("master")}
          >
            <CheckCheck size={13}/>斩 · 太简单
          </button>
        </div>

        {undoToast && <div className="fs-mini-toast" role="status">{undoToast}</div>}

        {/* RECOGNIZE MODE — Persistent Morphing Card (Giant Front -> Smooth FLIP Shrink -> Reveal Details) */}
        {session.mode === "recognize" && (
          <div className="fs-card-body">
            <div
              className={
                "fs-morph-card " +
                (reveal ? "is-revealed " : "is-front ") +
                (reveal === "check-know" ? "tone-know" : reveal === "check-miss" ? "tone-miss" : "")
              }
            >
              <div className="fs-morph-header">
                <div className="fs-morph-word-block">
                  <div className="fs-morph-title-line">
                    <h2 ref={termRef} className={"fs-morph-term" + termSizeClass}>
                      {activeCard.term}
                    </h2>
                    {reveal && (
                      <span
                        className={
                          "v-feedback-badge compact fs-pop-badge " +
                          (reveal === "check-know" ? "right" : reveal === "check-miss" ? "wrong" : "shown")
                        }
                      >
                        {reveal === "check-know" ? "✓ 认识" : reveal === "check-miss" ? "需重练" : "释义"}
                      </span>
                    )}
                  </div>

                  <div className="fs-morph-sub-line">
                    {activeCard.pronunciation && (
                      <span ref={ipaRef} className="fs-morph-ipa">
                        {activeCard.pronunciation}
                      </span>
                    )}
                    {!reveal && (
                      <button
                        ref={speakRef}
                        type="button"
                        className={"fs-speak-orb " + (speaking ? "playing" : "")}
                        onClick={() => playText(activeCard.term)}
                        aria-label="播放单词发音"
                        title="播放发音 (快捷键 R)"
                      >
                        <Volume2 size={19}/>
                        <span>{speaking ? "朗读中…" : "听发音"}</span>
                      </button>
                    )}
                  </div>
                </div>

                {reveal && (
                  <button
                    ref={speakRef}
                    type="button"
                    className={"fs-speak-circle " + (speaking ? "playing" : "")}
                    onClick={() => playText(activeCard.term)}
                    aria-label="播放单词发音"
                    title="播放发音 (R)"
                  >
                    <Volume2 size={18}/>
                  </button>
                )}
              </div>

              {audioNote && <p className="v-muted fs-audio-note">{audioNote}</p>}

              {!reveal && (
                <div className="fs-front-lower">
                  {englishExample ? (
                    <div className="fs-front-example">
                      <div className="fs-front-ex-head">
                        <span className="fs-front-ex-label"><BookText size={13}/>语境例句</span>
                        <button
                          type="button"
                          className="fs-mini-speak"
                          onClick={() => playText(englishExample)}
                          title="朗读这句英文例句"
                        >
                          <Volume2 size={13}/>读例句
                        </button>
                      </div>
                      <p className="fs-front-ex-en">{highlightTermInSentence(englishExample, activeCard.term)}</p>
                    </div>
                  ) : (
                    <p className="fs-front-hint">先回想中文意思，再点下方按钮核对</p>
                  )}
                </div>
              )}

              {reveal && (
                <div className="fs-reveal-cascade">
                  <p className="fs-meaning compact fs-cascade-item" style={{ animationDelay: "70ms" }}>
                    {activeCard.meaning}
                  </p>

                  {(englishExample || exampleParts.chinese || exampleParts.note) && (
                    <div className="fs-example-card compact fs-cascade-item" style={{ animationDelay: "130ms" }}>
                      <div className="fs-example-content">
                        {englishExample && (
                          <p className="fs-ex-en">{highlightTermInSentence(englishExample, activeCard.term)}</p>
                        )}
                        {exampleParts.chinese && <p className="fs-ex-zh">{exampleParts.chinese}</p>}
                        {exampleParts.note && <p className="fs-ex-note">{exampleParts.note}</p>}
                      </div>
                      {englishExample && (
                        <button
                          type="button"
                          className="fs-ex-speak-icon"
                          onClick={() => playText(englishExample)}
                          aria-label="朗读例句"
                          title="朗读例句"
                        >
                          <Volume2 size={15}/>
                        </button>
                      )}
                    </div>
                  )}

                  {lookAlikes.length > 0 && (
                    <div className="fs-lookalike-box compact fs-cascade-item" style={{ animationDelay: "190ms" }}>
                      <div className="fs-lookalike-head">
                        <GitCompareArrows size={13}/>
                        <strong>形近易混词</strong>
                        <span>点词听发音</span>
                      </div>
                      <div className="fs-lookalike-grid">
                        {lookAlikes.map(peer => (
                          <button
                            key={peer.term}
                            type="button"
                            className="fs-lookalike-chip"
                            onClick={() => playText(peer.term)}
                            title={`点击听 ${peer.term} 的发音`}
                          >
                            <div className="fs-la-top">
                              <strong>{peer.term}</strong>
                              <Volume2 size={12}/>
                            </div>
                            <small>{peer.meaning}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeCard.entry.fields.previousSpelling && (
                    <p className="v-muted fs-prev-spell fs-cascade-item" style={{ animationDelay: "230ms" }}>
                      曾易错拼写：<strong>{activeCard.entry.fields.previousSpelling}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SPELLING & RECALL MODES */}
        {session.mode !== "recognize" && (
          <div className="fs-card-body">
            {!reveal ? (
              <div className="fs-spell-stage">
                {session.mode === "spelling" ? (
                  <div className="fs-word-hero fill">
                    <button
                      type="button"
                      className={"fs-speak-orb large " + (speaking ? "playing" : "")}
                      onClick={() => playText(activeCard.term)}
                    >
                      <Volume2 size={24}/>
                      <span>{speaking ? "正在朗读…" : "重播发音 (R)"}</span>
                    </button>
                    <p className="fs-spell-cue">听发音写出完整英文{!letterHint ? "，想不起可点提示" : ""}</p>
                    {audioNote && <p className="v-muted fs-audio-note">{audioNote}</p>}
                    {!letterHint ? (
                      <button type="button" className="fs-hint-link" onClick={() => setLetterHint(true)}>
                        <Lightbulb size={14}/>显示首字母与中文提示
                      </button>
                    ) : (
                      <div className="fs-letter-hint">
                        <strong>{activeCard.term.split("/")[0].trim().replace(/[a-z]+/gi, w => w[0] + "·".repeat(w.length - 1))}</strong>
                        <p>{activeCard.meaning.replace(/\n+/g, " · ")}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="fs-word-hero fill">
                    <p className="fs-recall-meaning">{activeCard.meaning}</p>
                    {exampleParts.chinese && (
                      <p className="fs-recall-ex-zh">例句提示：{exampleParts.chinese}</p>
                    )}
                    {!letterHint ? (
                      <button type="button" className="fs-hint-link" onClick={() => setLetterHint(true)}>
                        <Lightbulb size={14}/>显示首字母提示
                      </button>
                    ) : (
                      <div className="fs-letter-hint">
                        <strong>{activeCard.term.split("/")[0].trim().replace(/[a-z]+/gi, w => w[0] + "·".repeat(w.length - 1))}</strong>
                      </div>
                    )}
                  </div>
                )}

                <form
                  id="fs-spell-form"
                  className="fs-input-form"
                  onSubmit={e => {
                    e.preventDefault();
                    handleCheckSpelling();
                  }}
                >
                  <input
                    key={activeCard.entry.id}
                    id="fs-spell-input"
                    autoFocus
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    placeholder="输入完整英文单词或短语，按 Enter 检查…"
                    value={input}
                    onChange={e => setInput(e.target.value)}
                  />
                </form>
              </div>
            ) : (
              <div className={"fs-unified-reveal " + (reveal === "right" ? "v-feedback-right" : "v-feedback-wrong")}>
                <div className="fs-unified-head">
                  <div className="fs-unified-word">
                    <div className="fs-unified-title-row">
                      <span className={"v-feedback-badge compact " + reveal}>
                        {reveal === "right" ? "✓ 拼写正确" : "拼写有误 · 稍后重练"}
                      </span>
                    </div>
                    {reveal === "wrong" && input.trim() ? (
                      <div className="fs-diff-inline">
                        <strong className="fs-diff-letters">
                          {spellingDiff(activeCard.term, input).map((tok, i) => (
                            <i key={i} className={tok.status}>{tok.char}</i>
                          ))}
                        </strong>
                        <code className="fs-user-typed">{input}</code>
                      </div>
                    ) : (
                      <div className="fs-unified-title-row">
                        <h2 className="fs-term compact">{activeCard.term}</h2>
                        {activeCard.pronunciation && <span className="fs-ipa compact">{activeCard.pronunciation}</span>}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={"fs-speak-circle " + (speaking ? "playing" : "")}
                    onClick={() => playText(activeCard.term)}
                    aria-label="播放单词发音"
                  >
                    <Volume2 size={18}/>
                  </button>
                </div>

                <p className="fs-meaning compact">{activeCard.meaning}</p>

                {(englishExample || exampleParts.chinese || exampleParts.note) && (
                  <div className="fs-example-card compact">
                    <div className="fs-example-content">
                      {englishExample && (
                        <p className="fs-ex-en">{highlightTermInSentence(englishExample, activeCard.term)}</p>
                      )}
                      {exampleParts.chinese && <p className="fs-ex-zh">{exampleParts.chinese}</p>}
                      {exampleParts.note && <p className="fs-ex-note">{exampleParts.note}</p>}
                    </div>
                    {englishExample && (
                      <button
                        type="button"
                        className="fs-ex-speak-icon"
                        onClick={() => playText(englishExample)}
                        aria-label="朗读例句"
                      >
                        <Volume2 size={15}/>
                      </button>
                    )}
                  </div>
                )}

                {lookAlikes.length > 0 && (
                  <div className="fs-lookalike-box compact">
                    <div className="fs-lookalike-head">
                      <GitCompareArrows size={13}/>
                      <strong>形近易混词</strong>
                      <span>点词听发音</span>
                    </div>
                    <div className="fs-lookalike-grid">
                      {lookAlikes.map(peer => (
                        <button
                          key={peer.term}
                          type="button"
                          className="fs-lookalike-chip"
                          onClick={() => playText(peer.term)}
                        >
                          <div className="fs-la-top">
                            <strong>{peer.term}</strong>
                            <Volume2 size={12}/>
                          </div>
                          <small>{peer.meaning}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom-Anchored Thumb Dock: Left = 认识 | Center = 看释义/朗读 | Right = 不认识 */}
      <div className="fs-bottom-dock">
        {session.mode === "recognize" && !reveal && (
          <div className="fs-thumb-bar three">
            <button
              type="button"
              className="fs-btn-know"
              disabled={busy}
              onClick={() => {
                if (studyPrefs.instantKnow) void commitAndAdvance("pass");
                else triggerReveal("check-know");
              }}
            >
              <Check size={17}/><span>认识</span><kbd>1</kbd>
            </button>
            <button type="button" className="fs-btn-mid" disabled={busy} onClick={() => triggerReveal("shown")}>
              <Eye size={16}/><span>看释义</span><kbd>Space</kbd>
            </button>
            <button type="button" className="fs-btn-miss" disabled={busy} onClick={() => triggerReveal("check-miss")}>
              <X size={16}/><span>不认识</span><kbd>2</kbd>
            </button>
          </div>
        )}

        {session.mode === "recognize" && reveal && (
          <div className="fs-thumb-bar three">
            <button
              type="button"
              className="fs-btn-know"
              autoFocus={reveal !== "check-miss"}
              disabled={busy}
              onClick={() => void commitAndAdvance("pass")}
            >
              <Check size={17}/>
              <span>{busy ? "保存…" : reveal === "check-miss" ? "其实认识" : "记住了"}</span>
              <kbd>1</kbd>
            </button>
            <button
              type="button"
              className="fs-btn-mid"
              onClick={() => playText(activeCard.term)}
              title="再听一遍发音 (R)"
            >
              <Volume2 size={16}/>
              <span>朗读</span>
              <kbd>R</kbd>
            </button>
            <button
              type="button"
              className={"fs-btn-miss " + (reveal === "check-miss" ? "solid" : "")}
              autoFocus={reveal === "check-miss"}
              disabled={busy}
              onClick={() => void commitAndAdvance("again")}
            >
              <RotateCcw size={15}/>
              <span>{busy ? "保存…" : reveal === "check-miss" ? "不认识·重练" : "没记牢"}</span>
              <kbd>2</kbd>
            </button>
          </div>
        )}

        {session.mode !== "recognize" && !reveal && (
          <div className="fs-thumb-bar two">
            <button type="submit" form="fs-spell-form" className="fs-btn-know" disabled={!input.trim()}>
              <Check size={17}/><span>检查答案</span><kbd>Enter</kbd>
            </button>
            <button type="button" className="fs-btn-miss" onClick={handleGiveUpSpelling}>
              <Eye size={16}/><span>看答案</span>
            </button>
          </div>
        )}

        {session.mode !== "recognize" && (reveal === "right" || reveal === "wrong") && (
          <div className="fs-thumb-bar two">
            <button
              type="button"
              className="fs-btn-mid"
              onClick={() => playText(activeCard.term)}
            >
              <Volume2 size={16}/><span>再听发音</span>
            </button>
            <button
              type="button"
              className={reveal === "right" ? "fs-btn-know" : "fs-btn-miss solid"}
              autoFocus
              disabled={busy}
              onClick={() => void commitAndAdvance(reveal === "right" ? "pass" : "again")}
            >
              <span>{busy ? "保存中…" : reveal === "right" ? "下一词" : "重练 · 下一词"}</span>
              <kbd>Enter</kbd>
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
