import type { Entry } from "./data";
import { exportLocalDelta, mergeCloudRecords } from "./local-store";

const gistConfigKey = "cet6-gist-sync-v1";
const gistFileName = "cet6-progress-sync.json";
const gistDescription = "CET-6 Vocabulary Cloud Progress Sync";
export const githubTokenCreateUrl = "https://github.com/settings/tokens/new?scopes=gist&description=CET6-Vocabulary-Sync";

export type GistConfig = {
  token: string;
  gistId: string;
  lastSyncAt?: string;
};

type CloudPayload = {
  schema: 1;
  updatedAt: string;
  examDate?: string;
  unlockedDay?: number;
  records: Entry[];
};

export type GistSyncResult = {
  gistId: string;
  pulled: number;
  totalSynced: number;
  created: boolean;
  lastSyncAt: string;
  examDate?: string;
  unlockedDay?: number;
};

export function readGistConfig(): GistConfig | null {
  try {
    const raw = localStorage.getItem(gistConfigKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GistConfig>;
    if (typeof parsed.token !== "string" || !parsed.token.trim()) return null;
    return {
      token: parsed.token.trim(),
      gistId: typeof parsed.gistId === "string" ? parsed.gistId.trim() : "",
      lastSyncAt: typeof parsed.lastSyncAt === "string" ? parsed.lastSyncAt : undefined,
    };
  } catch {
    return null;
  }
}

export function saveGistConfig(config: GistConfig) {
  try {
    localStorage.setItem(gistConfigKey, JSON.stringify(config));
  } catch {}
}

export function clearGistConfig() {
  try {
    localStorage.removeItem(gistConfigKey);
  } catch {}
}

function apiHeaders(token: string) {
  return {
    Authorization: `Bearer ${token.trim()}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function gistError(status: number, fallback: string) {
  if (status === 401) return new Error("GitHub Token 无效或已过期，请重新生成勾选 gist 权限的 Token。");
  if (status === 403) return new Error("Token 缺少 gist 权限或触发频率限制，请确认已勾选 gist 权限。");
  if (status === 404) return new Error("找不到该 Gist ID，请留空以自动查找或新建私有同步记录。");
  return new Error(`${fallback}（HTTP ${status}）`);
}

type GistApiResponse = {
  id: string;
  files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>;
};

async function fetchRemoteGist(token: string, gistId: string): Promise<GistApiResponse | null> {
  if (gistId) {
    const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId)}`, {
      headers: apiHeaders(token),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw gistError(res.status, "读取云端 Gist 失败");
    return (await res.json()) as GistApiResponse;
  }

  const listRes = await fetch("https://api.github.com/gists?per_page=40", {
    headers: apiHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!listRes.ok) throw gistError(listRes.status, "查询 GitHub Gist 列表失败");
  const list = (await listRes.json()) as GistApiResponse[];
  const hit = list.find(item => Boolean(item.files?.[gistFileName]));
  if (!hit) return null;

  const fullRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(hit.id)}`, {
    headers: apiHeaders(token),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!fullRes.ok) throw gistError(fullRes.status, "读取云端同步文件内容失败");
  return (await fullRes.json()) as GistApiResponse;
}

export async function syncWithGist(
  input: { token: string; gistId?: string },
  localMeta: { examDate: string; unlockedDay: number },
): Promise<GistSyncResult> {
  const token = input.token.trim();
  if (!token) throw new Error("请先填写 GitHub Personal Access Token（需勾选 gist 权限）。");
  const nowIso = new Date().toISOString();
  const existingGist = await fetchRemoteGist(token, (input.gistId || "").trim());

  if (!existingGist) {
    const records = exportLocalDelta();
    const payload: CloudPayload = {
      schema: 1,
      updatedAt: nowIso,
      examDate: localMeta.examDate,
      unlockedDay: localMeta.unlockedDay,
      records,
    };
    const createRes = await fetch("https://api.github.com/gists", {
      method: "POST",
      headers: apiHeaders(token),
      body: JSON.stringify({
        description: gistDescription,
        public: false,
        files: { [gistFileName]: { content: JSON.stringify(payload) } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!createRes.ok) throw gistError(createRes.status, "创建私有同步 Gist 失败");
    const created = (await createRes.json()) as GistApiResponse;
    saveGistConfig({ token, gistId: created.id, lastSyncAt: nowIso });
    return {
      gistId: created.id,
      pulled: 0,
      totalSynced: records.length,
      created: true,
      lastSyncAt: nowIso,
      examDate: localMeta.examDate,
      unlockedDay: localMeta.unlockedDay,
    };
  }

  let remoteRaw = existingGist.files?.[gistFileName]?.content || "";
  if (existingGist.files?.[gistFileName]?.truncated && existingGist.files[gistFileName].raw_url) {
    const rawRes = await fetch(existingGist.files[gistFileName].raw_url!, {
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
    if (rawRes.ok) remoteRaw = await rawRes.text();
  }

  let remotePayload: Partial<CloudPayload> = {};
  if (remoteRaw.trim()) {
    try {
      remotePayload = JSON.parse(remoteRaw) as Partial<CloudPayload>;
    } catch {
      throw new Error("云端 Gist 文件 JSON 解析失败，请检查文件是否损坏。");
    }
  }

  const remoteRecords = Array.isArray(remotePayload.records) ? remotePayload.records : [];
  const { pulled, merged } = mergeCloudRecords(remoteRecords);
  const nextUnlockedDay = Math.max(
    localMeta.unlockedDay,
    Number.isInteger(remotePayload.unlockedDay) ? (remotePayload.unlockedDay as number) : 2,
  );
  const nextExamDate =
    typeof remotePayload.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(remotePayload.examDate)
      ? remotePayload.examDate
      : localMeta.examDate;

  const nextPayload: CloudPayload = {
    schema: 1,
    updatedAt: nowIso,
    examDate: nextExamDate,
    unlockedDay: nextUnlockedDay,
    records: merged,
  };

  const patchRes = await fetch(`https://api.github.com/gists/${encodeURIComponent(existingGist.id)}`, {
    method: "PATCH",
    headers: apiHeaders(token),
    body: JSON.stringify({
      files: { [gistFileName]: { content: JSON.stringify(nextPayload) } },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!patchRes.ok) throw gistError(patchRes.status, "上传合并进度到 Gist 失败");

  saveGistConfig({ token, gistId: existingGist.id, lastSyncAt: nowIso });
  return {
    gistId: existingGist.id,
    pulled,
    totalSynced: merged.length,
    created: false,
    lastSyncAt: nowIso,
    examDate: nextExamDate,
    unlockedDay: nextUnlockedDay,
  };
}
