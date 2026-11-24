"use client";

import { ExternalLink, Play, Upload, X } from "lucide-react";
import { readingDocUrl } from "./reading-vocabulary";
import type { Card } from "./vocabulary";

export type DeckItem = {
  id: string;
  section: "smart" | "reading" | "book";
  title: string;
  subtitle: string;
  tone: "purple" | "mint" | "orange" | "blue";
  cards: Card[];
  dayNum?: number;
};

type Props = {
  open: boolean;
  decks: DeckItem[];
  selectedDeckId: string;
  readingTotal: number;
  today: string;
  onClose: () => void;
  onSelect: (deck: DeckItem, startImmediately: boolean) => void;
  onOpenGptImport: () => void;
};

export function DeckPickerModal({
  open,
  decks,
  selectedDeckId,
  readingTotal,
  today,
  onClose,
  onSelect,
  onOpenGptImport,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="切换背诵词本" onClick={onClose}>
      <div className="v-panel modal-sheet deck-modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>切换词本</h2>
            <p className="v-muted">点击任意词本即刻切换，点右侧「直接背」马上进入背诵。</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭弹窗" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="deck-modal-toolbar">
          <button
            type="button"
            className="v-secondary rc-mini-btn"
            onClick={() => { onClose(); onOpenGptImport(); }}
          >
            <Upload size={14}/>粘贴导入 GPT 每日词单
          </button>
          <a className="v-secondary rc-mini-btn" href={readingDocUrl} target="_blank" rel="noreferrer">
            Google Drive 阅读文档 ({readingTotal} 条) <ExternalLink size={13}/>
          </a>
        </div>

        <div className="deck-modal-scroll">
          {(["smart", "reading", "book"] as const).map(sec => {
            const secTitle = sec === "smart"
              ? "智能复习 & GPT 推送"
              : sec === "reading"
                ? `六级阅读积累库（已同步 ${readingTotal} 条）`
                : "每日词书词表（Day 1 – Day 4）";
            const list = decks.filter(d => d.section === sec);
            return (
              <div className="deck-group" key={sec}>
                <div className="deck-group-label">{secTitle}</div>
                <div className="deck-modal-grid">
                  {list.map(deck => {
                    const selected = deck.id === selectedDeckId;
                    const total = deck.cards.length;
                    const learned = deck.cards.filter(c => Boolean(c.entry.reviewed)).length;
                    const dueCnt = deck.cards.filter(c => !c.entry.due || c.entry.due <= today).length;
                    const pct = total ? Math.round((learned / total) * 100) : 0;
                    return (
                      <div key={deck.id} className={`deck-card deck-modal-card tone-${deck.tone} ${selected ? "selected" : ""}`}>
                        <button
                          type="button"
                          className="deck-modal-main"
                          onClick={() => { onSelect(deck, false); onClose(); }}
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
                        <button
                          type="button"
                          className="deck-quick-play"
                          title={`直接开始背诵「${deck.title}」`}
                          disabled={!total}
                          onClick={() => { onSelect(deck, true); onClose(); }}
                        >
                          <Play size={13}/>直接背
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
