"use client";

import { AudioLines, Eye, PencilLine, Shuffle, Volume2, X, Zap } from "lucide-react";
import type { Mode } from "./vocabulary";
import type { AudioPrefs, StudyPrefs } from "./study-session";

type Props = {
  open: boolean;
  mode: Mode;
  availableModes: Record<Mode, boolean>;
  audioPrefs: AudioPrefs;
  studyPrefs: StudyPrefs;
  onModeChange: (mode: Mode) => void;
  onUpdateAudioPrefs: (next: AudioPrefs) => void;
  onUpdateStudyPrefs: (next: StudyPrefs) => void;
  onClose: () => void;
};

const modeOptions = [
  { id: "recognize" as const, title: "看词识义", desc: "听音看词，快速刷词", icon: Eye },
  { id: "spelling" as const, title: "听音拼写", desc: "听发音拼完整单词", icon: AudioLines },
  { id: "recall" as const, title: "看义写词", desc: "看中文回想英文拼写", icon: PencilLine },
];

const groupSizes = [
  { value: 10, label: "10 词" },
  { value: 15, label: "15 词" },
  { value: 20, label: "20 词" },
  { value: 30, label: "30 词" },
  { value: 0, label: "全部" },
];

export function StudySettingsSheet({
  open,
  mode,
  availableModes,
  audioPrefs,
  studyPrefs,
  onModeChange,
  onUpdateAudioPrefs,
  onUpdateStudyPrefs,
  onClose,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop ios-sheet-backdrop" role="dialog" aria-modal="true" aria-label="背词偏好设置" onClick={onClose}>
      <div className="v-panel modal-sheet ios-sheet" onClick={e => e.stopPropagation()}>
        <div className="ios-sheet-handle" aria-hidden="true"/>
        <div className="modal-head">
          <div>
            <h2>背词设置</h2>
            <p className="v-muted">自由调整练习模式、每组词量与发音习惯</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="ios-setting-group">
          <div className="ios-setting-label">练习方式</div>
          <div className="ios-mode-cards" role="radiogroup" aria-label="练习方式">
            {modeOptions.map(({ id, title, desc, icon: Icon }) => {
              const disabled = !availableModes[id];
              const active = mode === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={disabled}
                  className={"ios-mode-card " + (active ? "active" : "")}
                  onClick={() => onModeChange(id)}
                >
                  <span className="ios-mode-ico"><Icon size={17}/></span>
                  <strong>{title}</strong>
                  <small>{desc}</small>
                </button>
              );
            })}
          </div>
        </div>

        <div className="ios-setting-group">
          <div className="ios-setting-label">每组背诵词数</div>
          <div className="ios-seg-row">
            {groupSizes.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={studyPrefs.groupSize === opt.value ? "active" : ""}
                onClick={() => onUpdateStudyPrefs({ ...studyPrefs, groupSize: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ios-setting-list">
          <div className="ios-switch-row">
            <div className="ios-switch-copy">
              <Volume2 size={16}/>
              <div>
                <strong>切词自动朗读英文</strong>
                <small>展示新词时自动播放标准发音</small>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={audioPrefs.autoPlay}
              className={"ios-switch " + (audioPrefs.autoPlay ? "on" : "")}
              onClick={() => onUpdateAudioPrefs({ ...audioPrefs, autoPlay: !audioPrefs.autoPlay })}
            >
              <i/>
            </button>
          </div>

          <div className="ios-switch-row">
            <div className="ios-switch-copy">
              <Shuffle size={16}/>
              <div>
                <strong>随机乱序出词</strong>
                <small>打乱词表顺序，防止按位置死记</small>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={studyPrefs.shuffle}
              className={"ios-switch " + (studyPrefs.shuffle ? "on" : "")}
              onClick={() => onUpdateStudyPrefs({ ...studyPrefs, shuffle: !studyPrefs.shuffle })}
            >
              <i/>
            </button>
          </div>

          <div className="ios-switch-row">
            <div className="ios-switch-copy">
              <Zap size={16}/>
              <div>
                <strong>闪电切词模式</strong>
                <small>点「认识」直接进入下一词，跳过核对</small>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={studyPrefs.instantKnow}
              className={"ios-switch " + (studyPrefs.instantKnow ? "on" : "")}
              onClick={() => onUpdateStudyPrefs({ ...studyPrefs, instantKnow: !studyPrefs.instantKnow })}
            >
              <i/>
            </button>
          </div>
        </div>

        <button type="button" className="v-primary ios-sheet-done" onClick={onClose}>
          完成
        </button>
      </div>
    </div>
  );
}
