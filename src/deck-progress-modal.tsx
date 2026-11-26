"use client";

import { useMemo, useState } from "react";
import { CheckCheck, Play, RotateCcw, Search, Volume2, X } from "lucide-react";
import type { Entry } from "./data";
import { daysBetween } from "./review-schedule";
import type { Card } from "./vocabulary";
import { partitionPool, speakEnglish, type StudyKind } from "./study-session";

type Props = {
  open: boolean;
  deckTitle: string;
  cards: Card[];
  today: string;
  busy: boolean;
  speechRate: number;
  onClose: () => void;
  onMaster: (entry: Entry) => Promise<boolean>;
  onReset: (entry: Entry) => Promise<boolean>;
  onStartKind: (kind: StudyKind) => void;
};

type FilterTab = "unlearned" | "due" | "solid" | "all";

export function DeckProgressModal({
  open,
  deckTitle,
  cards,
  today,
  busy,
  speechRate,
  onClose,
  onMaster,
  onReset,
  onStartKind,
}: Props) {
  const [tab, setTab] = useState<FilterTab>("unlearned");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);

  const buckets = useMemo(() => partitionPool(cards, today), [cards, today]);
  const learnedCount = buckets.dueReview.length + buckets.solid.length;
  const pct = cards.length ? Math.round((learnedCount / cards.length) * 100) : 0;

  const list = useMemo(() => {
    const base =
      tab === "unlearned"
        ? buckets.unlearned
        : tab === "due"
          ? buckets.dueReview
          : tab === "solid"
            ? buckets.solid
            : cards;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter(c => (c.term + " " + c.meaning).toLowerCase().includes(q));
  }, [buckets, cards, tab, query]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${deckTitle} 学习进度`} onClick={onClose}>
      <div className="v-panel modal-sheet dpm-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>{deckTitle} · 进度明细</h2>
            <p className="v-muted">已学 {learnedCount} / {cards.length} 词（{pct}%）· 可直接标记熟词「斩」或重学</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="dpm-bar" aria-hidden="true">
          <i className="solid" style={{ flexGrow: buckets.solid.length }}/>
          <i className="due" style={{ flexGrow: buckets.dueReview.length }}/>
          <i className="fresh" style={{ flexGrow: buckets.unlearned.length }}/>
        </div>

        <div className="dpm-tabs" role="tablist">
          {[
            { id: "unlearned" as const, label: "未学新词", count: buckets.unlearned.length },
            { id: "due" as const, label: "今日待复习", count: buckets.dueReview.length },
            { id: "solid" as const, label: "已稳固", count: buckets.solid.length },
            { id: "all" as const, label: "全部", count: cards.length },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={"dpm-tab " + (tab === item.id ? "active" : "")}
              onClick={() => { setTab(item.id); setLimit(50); }}
            >
              <span>{item.label}</span>
              <i>{item.count}</i>
            </button>
          ))}
        </div>

        <label className="v-search dpm-search">
          <Search size={15}/>
          <input
            placeholder="搜索本表英文或释义"
            value={query}
            onChange={e => { setQuery(e.target.value); setLimit(50); }}
          />
        </label>

        <div className="dpm-list">
          {list.slice(0, limit).map(card => {
            const e = card.entry;
            const isNew = !e.reviewed;
            const isDue = Boolean(e.reviewed && (!e.due || e.due <= today));
            const daysLeft = e.reviewed && e.due ? daysBetween(today, e.due) : 0;
            const isMastered = e.reviewed && e.stage >= 6;
            const statusText = isNew
              ? "未学新词"
              : isMastered
                ? `已斩 · S6`
                : isDue
                  ? `S${e.stage} · 今日到期`
                  : `S${e.stage} · 剩 ${Math.max(1, daysLeft)} 天`;
            const statusTone = isNew ? "fresh" : isDue ? "due" : "solid";

            return (
              <div key={e.id} className="dpm-row">
                <button
                  type="button"
                  className="dpm-speak"
                  aria-label={`朗读 ${card.term}`}
                  onClick={() => speakEnglish(card.term, { rate: speechRate })}
                >
                  <Volume2 size={15}/>
                </button>
                <div className="dpm-info">
                  <div className="dpm-word-line">
                    <strong>{card.term}</strong>
                    <span className={"dpm-status " + statusTone}>{statusText}</span>
                  </div>
                  <p>{card.meaning.replace(/\n+/g, " · ")}</p>
                </div>
                <div className="dpm-row-act">
                  {!isMastered ? (
                    <button
                      type="button"
                      className="dpm-mini-act master"
                      disabled={busy}
                      title="太简单，标为已完全掌握（60天后再复习）"
                      onClick={() => void onMaster(e)}
                    >
                      <CheckCheck size={13}/>斩
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dpm-mini-act"
                      disabled={busy}
                      title="重新加入今日待复习"
                      onClick={() => void onReset(e)}
                    >
                      <RotateCcw size={13}/>重背
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {!list.length && (
            <div className="rc-radar-empty">
              <p>{tab === "unlearned" ? "本词表的新词已全部学完，太棒了！" : tab === "due" ? "本表今日到期复习已清空！" : "暂无匹配词条。"}</p>
            </div>
          )}

          {list.length > limit && (
            <button type="button" className="v-secondary rc-load-more" onClick={() => setLimit(n => n + 50)}>
              展开更多（剩余 {list.length - limit} 词）
            </button>
          )}
        </div>

        <div className="modal-foot">
          <div className="dpm-foot-ctas">
            {buckets.unlearned.length > 0 && (
              <button type="button" className="v-primary rc-mini-btn" onClick={() => { onClose(); onStartKind("new"); }}>
                <Play size={14}/>继续学新词 ({buckets.unlearned.length})
              </button>
            )}
            {buckets.dueReview.length > 0 && (
              <button type="button" className="v-secondary rc-mini-btn" onClick={() => { onClose(); onStartKind("review"); }}>
                <RotateCcw size={14}/>去复习 ({buckets.dueReview.length})
              </button>
            )}
          </div>
          <button type="button" className="v-secondary rc-mini-btn" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  );
}
