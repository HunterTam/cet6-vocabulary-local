"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Eye, Flame, Lightbulb, RotateCcw, Sparkles, Volume2, VolumeX, Zap } from "lucide-react";
import type { Entry } from "./data";
import { spellingMatches, type Card, type Mode } from "./vocabulary";
import {
  extractEnglishExample,
  speakEnglish,
  spellingDiff,
  stopSpeaking,
  type AudioPrefs,
  type SavedSession,
  type StudyPrefs,
} from "./study-session";

type Props = {
  session: SavedSession;
  cardsById: Map<string, Card>;
  busy: boolean;
  audioPrefs: AudioPrefs;
  studyPrefs: StudyPrefs;
  onUpdateAudioPrefs: (next: AudioPrefs) => void;
  onUpdateStudyPrefs: (next: StudyPrefs) => void;
  onSessionChange: (next: SavedSession | null) => void;
  onRate: (entry: Entry, passed: boolean) => Promise<boolean>;
  onNextGroup: (deckId: string, mode: Mode) => void;
  onRetryWrong: (wrongCards: Card[], deckLabel: string, mode: Mode) => void;
  onExit: () => void;
};

const modeNames: Record<Mode, string> = {
  recognize: "看词识义",
  spelling: "听音拼写",
  recall: "看义写词",
};

type RevealState = undefined | "check-know" | "check-miss" | "shown" | "right" | "wrong";

export function FlashcardStudio({
  session,
  cardsById,
  busy,
  audioPrefs,
  studyPrefs,
  onUpdateAudioPrefs,
  onUpdateStudyPrefs,
  onSessionChange,
  onRate,
  onNextGroup,
  onRetryWrong,
  onExit,
}: Props) {
  const [reveal, setReveal] = useState<RevealState>(undefined);
  const [input, setInput] = useState("");
  const [letterHint, setLetterHint] = useState(false);
  const [showContextHint, setShowContextHint] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioNote, setAudioNote] = useState("");

  const activeId = session.queueIds[session.position];
  const activeCard = activeId ? cardsById.get(activeId) : undefined;
  const finished = session.position >= session.queueIds.length || !activeCard;
  const isRequeued = Boolean(activeId && session.requeuedIds.includes(activeId));
  const englishExample = useMemo(() => extractEnglishExample(activeCard?.example), [activeCard?.example]);

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

  // Auto-play pronunciation whenever a new card enters (respecting mode & user preference)
  useEffect(() => {
    if (finished || !activeCard) return;
    if (!audioPrefs.autoPlay) return;
    if (session.mode === "recall") return; // Recall tests English spelling from Chinese; play after reveal instead
    playText(activeCard.term, `card:${session.position}:${activeCard.entry.id}`);
  }, [session.position, activeCard?.entry.id, session.mode, audioPrefs.autoPlay, finished]);

  useEffect(() => () => stopSpeaking(), []);

  function resetCardUi() {
    setReveal(undefined);
    setInput("");
    setLetterHint(false);
    setShowContextHint(false);
    setAudioNote("");
  }

  async function commitAndAdvance(passed: boolean) {
    if (!activeCard || busy) return;
    const saved = await onRate(activeCard.entry, passed);
    if (!saved) return;

    const currentId = activeCard.entry.id;
    const nextQueue = [...session.queueIds];
    const nextMastered = new Set(session.masteredIds);
    const nextWrong = new Set(session.wrongIds);
    const nextRequeued = new Set(session.requeuedIds);

    if (passed) {
      nextMastered.add(currentId);
      nextRequeued.delete(currentId);
    } else {
      nextWrong.add(currentId);
      // In-session spaced retry: re-insert missed card 3 steps ahead if not already queued ahead
      const aheadSlice = nextQueue.slice(session.position + 1);
      if (!aheadSlice.includes(currentId)) {
        const insertAt = Math.min(session.position + 4, nextQueue.length);
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

    // Synchronously trigger audio for the NEXT card inside the user's tap gesture (crucial for iPhone Safari!)
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

  // Keyboard shortcuts for desktop speed-studying
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

      if (session.mode === "recognize") {
        if (!reveal) {
          if (event.key === "1") {
            event.preventDefault();
            setReveal("check-miss");
          } else if (event.key === " ") {
            event.preventDefault();
            setReveal("shown");
          } else if (event.key === "2" || event.key === "Enter") {
            event.preventDefault();
            if (studyPrefs.instantKnow) void commitAndAdvance(true);
            else setReveal("check-know");
          }
        } else {
          if (event.key === "1") {
            event.preventDefault();
            void commitAndAdvance(false);
          } else if (event.key === "2" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void commitAndAdvance(reveal !== "check-miss");
          }
        }
      } else if (reveal === "right" || reveal === "wrong") {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void commitAndAdvance(reveal === "right");
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
  const masteredPct = Math.min(100, Math.round((masteredUnique / totalUnique) * 100));
  const pendingRetryPct = Math.min(100 - masteredPct, Math.round((session.requeuedIds.length / totalUnique) * 100));

  if (finished) {
    const accuracy = Math.round((firstTryCorrect / totalUnique) * 100);
    return (
      <section className="v-panel fs-shell fs-complete">
        <div className="fs-complete-badge"><Sparkles size={24}/></div>
        <h2>本组背诵完成！</h2>
        <p className="v-muted">{session.deckLabel} · {modeNames[session.mode]}</p>

        <div className="fs-summary-stats">
          <div>
            <strong>{totalUnique}</strong>
            <span>本组词条</span>
          </div>
          <div>
            <strong className="mint">{accuracy}%</strong>
            <span>首次正确率</span>
          </div>
          <div>
            <strong className={wrongCardsList.length ? "peach" : "mint"}>{wrongCardsList.length}</strong>
            <span>需重点巩固</span>
          </div>
        </div>

        {wrongCardsList.length > 0 && (
          <div className="fs-wrong-review">
            <div className="fs-wrong-head">
              <strong>本轮错词清单（点喇叭可复听）</strong>
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

        <div className="fs-complete-actions">
          <button type="button" className="v-primary" onClick={() => onNextGroup(session.deckId, session.mode)}>
            继续下一组 ({session.groupSize > 0 ? `${session.groupSize} 词` : "全部"})
          </button>
          <button type="button" className="v-secondary" onClick={onExit}>
            返回选择词本
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="v-panel fs-shell">
      {/* Top Distraction-Free Studio Bar */}
      <div className="fs-topbar">
        <button type="button" className="fs-back-btn" disabled={busy} onClick={() => { stopSpeaking(); onExit(); }}>
          <ArrowLeft size={16}/>
          <span>暂存并返回</span>
        </button>

        <div className="fs-progress-meta">
          <div className="fs-progress-labels">
            <strong>{session.deckLabel}</strong>
            <span>{modeNames[session.mode]} · 第 {session.position + 1} / {session.queueIds.length} 步（已掌握 {masteredUnique}/{totalUnique}）</span>
          </div>
          <div className="fs-progress-track" aria-label="本轮进度">
            <span className="fs-prog-ok" style={{ width: `${masteredPct}%` }}/>
            <span className="fs-prog-retry" style={{ width: `${pendingRetryPct}%` }}/>
          </div>
        </div>

        <div className="fs-audio-controls">
          <button
            type="button"
            className={"fs-ctrl-pill " + (audioPrefs.autoPlay ? "on" : "")}
            onClick={() => onUpdateAudioPrefs({ ...audioPrefs, autoPlay: !audioPrefs.autoPlay })}
            title="切换切词时是否自动朗读英文发音"
          >
            {audioPrefs.autoPlay ? <Volume2 size={15}/> : <VolumeX size={15}/>}
            <span>{audioPrefs.autoPlay ? "自动播音 开" : "自动播音 关"}</span>
          </button>
          <button
            type="button"
            className="fs-ctrl-pill"
            onClick={() => onUpdateAudioPrefs({ ...audioPrefs, rate: audioPrefs.rate < 0.95 ? 1.0 : 0.85 })}
            title="切换朗读语速"
          >
            <span>{audioPrefs.rate < 0.95 ? "0.85x 慢速" : "1.0x 常速"}</span>
          </button>
          {session.mode === "recognize" && (
            <button
              type="button"
              className={"fs-ctrl-pill " + (studyPrefs.instantKnow ? "on" : "")}
              onClick={() => onUpdateStudyPrefs({ ...studyPrefs, instantKnow: !studyPrefs.instantKnow })}
              title="开启后点「认识」直接跳过核对进入下一词"
            >
              <Zap size={14}/>
              <span>{studyPrefs.instantKnow ? "闪电切词" : "核对模式"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Flashcard Stage */}
      <div className="fs-card" key={`${session.position}-${activeCard.entry.id}`}>
        <div className="fs-card-tags">
          <span className="v-tag">{activeCard.category}</span>
          <span className="v-tag sky">{activeCard.source}</span>
          {activeCard.entry.fields.batch && (
            <span className="v-tag">Day {activeCard.entry.fields.batch} · P{activeCard.entry.fields.page}</span>
          )}
          <span className="v-tag mint">{activeCard.entry.reviewed ? `阶段 S${activeCard.entry.stage}` : "新词"}</span>
          {isRequeued && <span className="v-tag rose"><Flame size={12}/> 本轮重练</span>}
        </div>

        {/* RECOGNIZE MODE */}
        {session.mode === "recognize" && (
          <div className="fs-card-body">
            <div className="fs-word-hero">
              <h2 className="fs-term">{activeCard.term}</h2>
              <div className="fs-audio-row">
                {activeCard.pronunciation && <span className="fs-ipa">{activeCard.pronunciation}</span>}
                <button
                  type="button"
                  className={"fs-speak-orb " + (speaking ? "playing" : "")}
                  onClick={() => playText(activeCard.term)}
                  aria-label="播放单词发音"
                  title="播放发音 (快捷键 R)"
                >
                  <Volume2 size={20}/>
                  <span>{speaking ? "朗读中…" : "听发音 (R)"}</span>
                </button>
              </div>
              {audioNote && <p className="v-muted fs-audio-note">{audioNote}</p>}
            </div>

            {!reveal && englishExample && (
              <div className="fs-context-area">
                {!showContextHint ? (
                  <button type="button" className="fs-hint-link" onClick={() => setShowContextHint(true)}>
                    <Lightbulb size={14}/>看英文例句提示（不剧透中文）
                  </button>
                ) : (
                  <div className="fs-context-box">
                    <p>{englishExample}</p>
                    <button type="button" className="fs-mini-speak" onClick={() => playText(englishExample)}>
                      <Volume2 size={14}/>读例句
                    </button>
                  </div>
                )}
              </div>
            )}

            {reveal && (
              <div className={"fs-reveal-box " + (reveal === "check-know" ? "v-feedback-right" : reveal === "check-miss" ? "v-feedback-wrong" : "")}>
                <div className="fs-reveal-head">
                  <span className={"v-feedback-badge " + (reveal === "check-know" ? "right" : reveal === "check-miss" ? "wrong" : "shown")}>
                    {reveal === "check-know" ? "✓ 认识 · 核对一下释义" : reveal === "check-miss" ? "已安排稍后重练 · 先记住释义" : "释义核对"}
                  </span>
                </div>
                <p className="fs-meaning">{activeCard.meaning}</p>
                {activeCard.example && (
                  <div className="fs-example-card">
                    <p>{activeCard.example}</p>
                    {englishExample && (
                      <button type="button" className="fs-mini-speak" onClick={() => playText(englishExample)}>
                        <Volume2 size={14}/>朗读例句
                      </button>
                    )}
                  </div>
                )}
                {activeCard.entry.fields.previousSpelling && (
                  <p className="v-muted">曾易错拼写：<strong>{activeCard.entry.fields.previousSpelling}</strong></p>
                )}
              </div>
            )}
          </div>
        )}

        {/* SPELLING & RECALL MODES */}
        {session.mode !== "recognize" && (
          <div className="fs-card-body">
            {session.mode === "spelling" ? (
              <div className="fs-word-hero">
                <button
                  type="button"
                  className={"fs-speak-orb large " + (speaking ? "playing" : "")}
                  onClick={() => playText(activeCard.term)}
                >
                  <Volume2 size={24}/>
                  <span>{speaking ? "正在朗读…" : "重播发音 (R)"}</span>
                </button>
                <p className="fs-spell-cue">听发音写出完整英文{!reveal && !letterHint ? "，想不起可点字母提示" : ""}</p>
                {audioNote && <p className="v-muted fs-audio-note">{audioNote}</p>}
                {!reveal && !letterHint && (
                  <button type="button" className="fs-hint-link" onClick={() => setLetterHint(true)}>
                    <Lightbulb size={14}/>显示首字母与中文提示
                  </button>
                )}
                {!reveal && letterHint && (
                  <div className="fs-letter-hint">
                    <strong>{activeCard.term.split("/")[0].trim().replace(/[a-z]+/gi, w => w[0] + "·".repeat(w.length - 1))}</strong>
                    <p>{activeCard.meaning.replace(/\n+/g, " · ")}</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="fs-word-hero">
                <p className="fs-recall-meaning">{activeCard.meaning}</p>
                {!reveal && !letterHint && (
                  <button type="button" className="fs-hint-link" onClick={() => setLetterHint(true)}>
                    <Lightbulb size={14}/>显示首字母提示
                  </button>
                )}
                {!reveal && letterHint && (
                  <div className="fs-letter-hint">
                    <strong>{activeCard.term.split("/")[0].trim().replace(/[a-z]+/gi, w => w[0] + "·".repeat(w.length - 1))}</strong>
                  </div>
                )}
              </div>
            )}

            {!reveal && (
              <form
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
                <div className="fs-thumb-bar two">
                  <button type="button" className="fs-btn-miss" onClick={handleGiveUpSpelling}>
                    想不起来 · 看答案
                  </button>
                  <button type="submit" className="fs-btn-know" disabled={!input.trim()}>
                    <Check size={18}/>检查答案 (Enter)
                  </button>
                </div>
              </form>
            )}

            {(reveal === "right" || reveal === "wrong") && (
              <div className={"fs-reveal-box " + (reveal === "right" ? "v-feedback-right" : "v-feedback-wrong")}>
                <div className="fs-reveal-head">
                  <span className={"v-feedback-badge " + reveal}>
                    {reveal === "right" ? "✓ 拼写完全正确！" : "拼写有误 · 已加入本轮稍后重练"}
                  </span>
                  <button type="button" className="fs-mini-speak" onClick={() => playText(activeCard.term)}>
                    <Volume2 size={15}/>朗读 (R)
                  </button>
                </div>

                {reveal === "wrong" && input.trim() ? (
                  <div className="fs-diff-box">
                    <div className="fs-diff-row">
                      <span>正确拼写</span>
                      <strong className="fs-diff-letters">
                        {spellingDiff(activeCard.term, input).map((tok, i) => (
                          <i key={i} className={tok.status}>{tok.char}</i>
                        ))}
                      </strong>
                    </div>
                    <div className="fs-diff-row">
                      <span>你的输入</span>
                      <code className="fs-user-typed">{input}</code>
                    </div>
                  </div>
                ) : (
                  <p className="fs-term small">
                    {activeCard.term}
                    {activeCard.pronunciation && <span className="fs-ipa">{activeCard.pronunciation}</span>}
                  </p>
                )}

                <p className="fs-meaning">{activeCard.meaning}</p>
                {activeCard.example && (
                  <div className="fs-example-card">
                    <p>{activeCard.example}</p>
                    {englishExample && (
                      <button type="button" className="fs-mini-speak" onClick={() => playText(englishExample)}>
                        <Volume2 size={14}/>朗读例句
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Bottom Thumb Action Bar */}
        {session.mode === "recognize" && !reveal && (
          <div className="fs-thumb-bar three">
            <button type="button" className="fs-btn-miss" disabled={busy} onClick={() => setReveal("check-miss")}>
              不认识 <kbd>1</kbd>
            </button>
            <button type="button" className="fs-btn-mid" disabled={busy} onClick={() => setReveal("shown")}>
              <Eye size={16}/>看释义 <kbd>Space</kbd>
            </button>
            <button
              type="button"
              className="fs-btn-know"
              disabled={busy}
              onClick={() => {
                if (studyPrefs.instantKnow) void commitAndAdvance(true);
                else setReveal("check-know");
              }}
            >
              <Check size={17}/>认识 <kbd>2</kbd>
            </button>
          </div>
        )}

        {session.mode === "recognize" && reveal && (
          <div className="fs-thumb-bar two">
            {reveal === "check-miss" ? (
              <>
                <button type="button" className="fs-btn-mid" disabled={busy} onClick={() => void commitAndAdvance(true)}>
                  其实记住了
                </button>
                <button type="button" className="fs-btn-miss solid" autoFocus disabled={busy} onClick={() => void commitAndAdvance(false)}>
                  {busy ? "保存中…" : "记入本轮重练 · 下一词 (Enter)"}
                </button>
              </>
            ) : (
              <>
                <button type="button" className="fs-btn-miss" disabled={busy} onClick={() => void commitAndAdvance(false)}>
                  {reveal === "check-know" ? "其实记错了 (1)" : "没记牢 · 稍后再练 (1)"}
                </button>
                <button type="button" className="fs-btn-know" autoFocus disabled={busy} onClick={() => void commitAndAdvance(true)}>
                  {busy ? "保存中…" : "记住了 · 下一词 (Enter)"}
                </button>
              </>
            )}
          </div>
        )}

        {session.mode !== "recognize" && (reveal === "right" || reveal === "wrong") && (
          <div className="fs-thumb-bar one">
            <button
              type="button"
              className={reveal === "right" ? "fs-btn-know" : "fs-btn-miss solid"}
              autoFocus
              disabled={busy}
              onClick={() => void commitAndAdvance(reveal === "right")}
            >
              {busy ? "保存中…" : reveal === "right" ? "太棒了 · 下一词 (Enter)" : "记入本轮重练 · 下一词 (Enter)"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
