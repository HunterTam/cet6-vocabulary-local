"use client";

import { useMemo, useState } from "react";
import { Check, Sparkles, Upload, X } from "lucide-react";
import { dateKey } from "./data";
import { parseGptWordList, type ParsedImportCard } from "./reading-vocabulary";

type Props = {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onImport: (items: ParsedImportCard[], startNow: boolean, batchTag: string) => Promise<void>;
};

const samplePlaceholder = `直接把 ChatGPT 每天推送的单词粘贴到这里，支持任意常见格式：

• resilience /rɪˈzɪliəns/｜韧性；恢复力
  例｜Resilience helps students cope with exam pressure.
• take on：呈现出；承担
1. **profound** /prəˈfaʊnd/ adj. 深刻的；深远的
或直接粘贴 CET6_SYNC_V1 的 JSON 行`;

export function GptImportModal({ open, busy, onClose, onImport }: Props) {
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState<"英语对话" | "阅读积累库">("英语对话");
  const todayTag = `GPT推送 ${dateKey().slice(5)}`;

  const parsed = useMemo(() => parseGptWordList(text, origin), [text, origin]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="导入 GPT 每日词单" onClick={onClose}>
      <div className="v-panel modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2><Sparkles size={18}/>一键导入 GPT 每日词单</h2>
            <p className="v-muted">把 ChatGPT 推送的单词、短语或例句直接粘贴进来，自动解析成可背诵卡片并同步云端。</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭弹窗" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="modal-origin-row">
          <span className="v-dock-label">归类到</span>
          <button
            type="button"
            className={"v-focus-pill " + (origin === "英语对话" ? "active" : "")}
            onClick={() => setOrigin("英语对话")}
          >
            GPT 每日推送 / 英语对话
          </button>
          <button
            type="button"
            className={"v-focus-pill " + (origin === "阅读积累库" ? "active" : "")}
            onClick={() => setOrigin("阅读积累库")}
          >
            六级阅读积累库
          </button>
        </div>

        <textarea
          className="modal-textarea"
          rows={7}
          placeholder={samplePlaceholder}
          value={text}
          onChange={e => setText(e.target.value)}
        />

        <div className="modal-preview">
          <div className="modal-preview-head">
            <strong>解析预览</strong>
            <span className={"v-tag " + (parsed.length ? "mint" : "peach")}>
              {parsed.length ? `已识别 ${parsed.length} 条词句` : "粘贴文本后自动识别"}
            </span>
          </div>
          {parsed.length > 0 && (
            <ul className="modal-preview-list">
              {parsed.slice(0, 8).map((item, idx) => (
                <li key={item.title + idx}>
                  <strong>{item.title}</strong>
                  <span className="v-tag">{item.category}</span>
                  <small>{item.body.replace(/\n+/g, " · ")}</small>
                </li>
              ))}
              {parsed.length > 8 && <li className="v-muted">…还有 {parsed.length - 8} 条词句</li>}
            </ul>
          )}
        </div>

        <div className="modal-foot">
          <button type="button" className="v-secondary" disabled={busy} onClick={onClose}>取消</button>
          <div className="v-actions">
            <button
              type="button"
              className="v-secondary"
              disabled={!parsed.length || busy}
              onClick={async () => {
                await onImport(parsed, false, todayTag);
                setText("");
              }}
            >
              <Upload size={15}/>仅导入词库
            </button>
            <button
              type="button"
              className="v-primary"
              disabled={!parsed.length || busy}
              onClick={async () => {
                await onImport(parsed, true, todayTag);
                setText("");
              }}
            >
              <Check size={16}/>导入并立即背诵 ({parsed.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
