"use client";

import { Cloud, CloudOff, ExternalLink, RefreshCw, X } from "lucide-react";
import { githubTokenCreateUrl, type GistConfig } from "./cloud-sync";

type Props = {
  open: boolean;
  ready: boolean;
  busy: boolean;
  driveEnabled: boolean;
  driveBusy: boolean;
  driveMessage: string;
  gistConfig: GistConfig | null;
  gistToken: string;
  gistIdInput: string;
  gistBusy: boolean;
  gistMessage: string;
  gistError: string;
  onClose: () => void;
  onTokenChange: (value: string) => void;
  onGistIdChange: (value: string) => void;
  onConnectGist: () => void;
  onSyncGist: () => void;
  onDisconnectGist: () => void;
  onSyncDrive: () => void;
  onExportBackup: () => void;
  onImportBackup: (file?: File) => void;
  formatClock: (iso?: string) => string;
};

export function SyncSettingsModal({
  open,
  ready,
  busy,
  driveEnabled,
  driveBusy,
  driveMessage,
  gistConfig,
  gistToken,
  gistIdInput,
  gistBusy,
  gistMessage,
  gistError,
  onClose,
  onTokenChange,
  onGistIdChange,
  onConnectGist,
  onSyncGist,
  onDisconnectGist,
  onSyncDrive,
  onExportBackup,
  onImportBackup,
  formatClock,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="云同步与数据备份设置" onClick={onClose}>
      <div className="v-panel modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>云同步与学习数据备份</h2>
            <p className="v-muted">管理 iPhone ↔ 电脑跨设备同步、Google Drive 词库拉取与本机 JSON 备份。</p>
          </div>
          <button type="button" className="modal-close" aria-label="关闭弹窗" onClick={onClose}>
            <X size={18}/>
          </button>
        </div>

        <div className="sync-modal-section">
          <div className="v-sync-head">
            <h3>跨设备云同步（GitHub Gist）</h3>
            <span className={"v-tag " + (gistConfig ? "mint" : "sky")}>
              {gistConfig ? "已连接" : "未连接"}
            </span>
          </div>
          <p className="v-muted">
            在电脑和 iPhone 各粘贴一次同一枚勾选了 <code>gist</code> 权限的 GitHub Token，即可自动双向同步复习进度与倒计时。
          </p>

          {gistConfig ? (
            <div className="v-gist-connected">
              <div className="v-gist-meta">
                <span>私有 Gist：<code>{gistConfig.gistId.slice(0, 8)}…{gistConfig.gistId.slice(-4)}</code></span>
                {gistConfig.lastSyncAt && <span>上次同步：{formatClock(gistConfig.lastSyncAt)}</span>}
              </div>
              <div className="v-actions">
                <button type="button" className="v-primary rc-mini-btn" disabled={gistBusy || busy} onClick={onSyncGist}>
                  <RefreshCw size={14} className={gistBusy ? "spin" : ""}/>{gistBusy ? "双向同步中…" : "立即双向同步"}
                </button>
                <button type="button" className="v-secondary rc-mini-btn" disabled={gistBusy} onClick={onDisconnectGist}>
                  <CloudOff size={14}/>断开连接
                </button>
              </div>
            </div>
          ) : (
            <form
              className="v-gist-form"
              onSubmit={e => {
                e.preventDefault();
                if (gistToken.trim()) onConnectGist();
              }}
            >
              <div className="v-gist-inputs">
                <input
                  type="password"
                  autoComplete="off"
                  aria-label="GitHub Token"
                  placeholder="粘贴 GitHub Token（仅需 gist 权限）"
                  value={gistToken}
                  onChange={e => onTokenChange(e.target.value)}
                />
                <input
                  type="text"
                  autoComplete="off"
                  aria-label="可选 Gist ID"
                  placeholder="Gist ID（留空自动查找/新建）"
                  value={gistIdInput}
                  onChange={e => onGistIdChange(e.target.value)}
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

        <div className="sync-modal-section">
          <h3>本机备份与 Google Drive</h3>
          <p className="v-muted">支持 JSON 文件手动导入导出；电脑本地服务运行时自动同步 Google Drive 词书与阅读文档。</p>
          <div className="v-actions v-local-backup-inline">
            <label className="v-secondary rc-mini-btn v-file-btn">
              导入备份 JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={e => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  onImportBackup(file);
                }}
              />
            </label>
            <button type="button" className="v-secondary rc-mini-btn" disabled={!ready || busy} onClick={onExportBackup}>
              导出备份 JSON
            </button>
            {driveEnabled && (
              <button type="button" className="v-secondary rc-mini-btn" disabled={driveBusy || busy} onClick={onSyncDrive}>
                {driveBusy ? "读取 Drive 中…" : "立即同步 Google Drive"}
              </button>
            )}
          </div>
          <p className="v-muted" role="status">
            {driveEnabled
              ? driveMessage || "页面打开时同步 Google Drive，随后每 10 分钟自动检查。"
              : "在 iPhone Safari 点「分享 → 添加到主屏幕」即可像原生 App 一样全屏使用。"}
          </p>
        </div>

        <div className="sync-modal-section">
          <div className="v-sync-head">
            <h3>应用版本与离线缓存</h3>
            <span className="v-tag mint">v3.0 · 原生移动版</span>
          </div>
          <p className="v-muted">
            点击下方按钮仅刷新应用外壳缓存，不会删除任何本机背词进度。
          </p>
          <div className="v-actions">
            <button
              type="button"
              className="v-secondary rc-mini-btn"
              onClick={async () => {
                try {
                  if ("caches" in window) {
                    const keys = await caches.keys();
                    await Promise.all(keys.map(k => caches.delete(k)));
                  }
                  if ("serviceWorker" in navigator) {
                    const regs = await navigator.serviceWorker.getRegistrations();
                    await Promise.all(regs.map(r => r.unregister()));
                  }
                } catch {}
                window.location.reload();
              }}
            >
              <RefreshCw size={14}/>检查并强制刷新到最新版
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
