"use client";

import { Check, ExternalLink, Play, Upload, X } from "lucide-react";
import type { DeckItem } from "./deck-picker-modal";
import { partitionPool } from "./study-session";
import { readingDocUrl } from "./reading-vocabulary";

type Props = {
  open: boolean;
  decks: DeckItem[];
  selectedDeckId: string;
  deckTab: "book" | "reading" | "smart";
  readingCount: number;
  today: string;
  onChangeTab: (tab: "book" | "reading" | "smart") => void;
  onSelectDeck: (deck: DeckItem, startImmediately: boolean) => void;
  onOpenGptImport: () => void;
  onClose: () => void;
};

export function DeckSheetModal({
  open,
  decks,
  selectedDeckId,
  deckTab,
  readingCount,
  today,
  onChangeTab,
  onSelectDeck,
  onOpenGptImport,
  onClose,
}: Props) {
  if (!open) return null;

  const visible = decks.filter(d => d.section === deckTab);

  return (
    <div className="modal-backdrop ios-sheet-backdrop" role="dialog" aria-modal="true" aria-label="切换词书" onClick={onClose}>
      <div className="v-panel modal-sheet ios-sheet deck-sheet" onClick={e => e.stopPropagation()}>
        <div className="ios-sheet-handle" aria-hidden="true"/>
        <div className="modal-head">
          <div>
            <h2>切换词书与词表</h2>
            <p className="v-muted">选择要背诵的词表，各词表进度独立保存</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="deck-tabs" role="tablist" aria-label="词表分类">
          <button
            type="button"
            role="tab"
            aria-selected={deckTab === "book"}
            className={deckTab === "book" ? "active" : ""}
            onClick={() => onChangeTab("book")}
          >
            词书词表
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={deckTab === "reading"}
            className={deckTab === "reading" ? "active" : ""}
            onClick={() => onChangeTab("reading")}
          >
            阅读积累 <i>{readingCount}</i>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={deckTab === "smart"}
            className={deckTab === "smart" ? "active" : ""}
            onClick={() => onChangeTab("smart")}
          >
            综合 & GPT
          </button>
        </div>

        <div className="deck-row-list deck-sheet-list">
          {visible.map(deck => {
            const selected = deck.id === selectedDeckId;
            const total = deck.cards.length;
            const b = partitionPool(deck.cards, today);
            const learned = b.dueReview.length + b.solid.length;
            const pct = total ? Math.round((learned / total) * 100) : 0;
            return (
              <div key={deck.id} className={"deck-row " + (selected ? "selected" : "")}>
                <button
                  type="button"
                  className="deck-row-main"
                  aria-pressed={selected}
                  onClick={() => { onSelectDeck(deck, false); onClose(); }}
                >
                  <span className={"deck-radio " + (selected ? "checked" : "")}>
                    {selected && <Check size={12}/>}
                  </span>
                  <div className="deck-row-text">
                    <strong>{deck.title}</strong>
                    <small>已学 {learned}/{total} · {deck.subtitle}</small>
                  </div>
                  <div className="deck-row-stats">
                    <div className="deck-chip-group">
                      {b.unlearned.length > 0 && <span className="deck-mini-chip new">新 {b.unlearned.length}</span>}
                      {b.dueReview.length > 0 && <span className="deck-mini-chip due">复 {b.dueReview.length}</span>}
                      {!b.unlearned.length && !b.dueReview.length && <span className="deck-mini-chip done">已清</span>}
                    </div>
                    <span className="deck-row-bar"><i style={{ width: `${pct}%` }}/></span>
                  </div>
                </button>
                <button
                  type="button"
                  className="deck-row-play"
                  disabled={!total}
                  aria-label={`开始学习 ${deck.title}`}
                  onClick={() => { onClose(); onSelectDeck(deck, true); }}
                >
                  <Play size={14}/>
                </button>
              </div>
            );
          })}
        </div>

        <div className="deck-sheet-foot">
          <button
            type="button"
            className="v-secondary rc-mini-btn"
            onClick={() => { onClose(); onOpenGptImport(); }}
          >
            <Upload size={14}/>导入 GPT 词单
          </button>
          <a className="home-link-btn" href={readingDocUrl} target="_blank" rel="noreferrer">
            阅读源文档 <ExternalLink size={12}/>
          </a>
        </div>
      </div>
    </div>
  );
}
