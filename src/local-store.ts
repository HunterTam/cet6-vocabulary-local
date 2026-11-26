import { dailyVocabulary } from "./daily-vocabulary";
import { dateKey, nextDate, seed, type Entry } from "./data";
import { nextReview, reviewIntervals } from "./review-schedule";
import { listeningSeed } from "./listening-data";
import { parseReadingDoc, readingVocabulary, extraStudyVocabulary, type ParsedImportCard } from "./reading-vocabulary";
import { mirrorKeyToDurable } from "./durable-store";

const storageKey = "cet6-vocabulary-local-v1";
const driveKey = "cet6-vocabulary-drive-v1";
type Action = "pass" | "again" | "save" | "master" | "reset";
let baseCache: Map<string,Entry> | undefined;

function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bitLen = bytes.length * 8;
  const padLen = ((bytes.length + 9 + 63) >> 6) << 6;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(padLen - 4, bitLen >>> 0, false);
  const W = new Uint32Array(64);
  for (let off = 0; off < padLen; off += 64) {
    for (let i = 0; i < 16; i++) W[i] = view.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = ((W[i-15] >>> 7) | (W[i-15] << 25)) ^ ((W[i-15] >>> 18) | (W[i-15] << 14)) ^ (W[i-15] >>> 3);
      const s1 = ((W[i-2] >>> 17) | (W[i-2] << 15)) ^ ((W[i-2] >>> 19) | (W[i-2] << 13)) ^ (W[i-2] >>> 10);
      W[i] = (W[i-16] + s0 + W[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0]=(H[0]+a)>>>0; H[1]=(H[1]+b)>>>0; H[2]=(H[2]+c)>>>0; H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0; H[5]=(H[5]+f)>>>0; H[6]=(H[6]+g)>>>0; H[7]=(H[7]+h)>>>0;
  }
  return H.map(n => n.toString(16).padStart(8, "0")).join("");
}

function sourceIdSync(key:string) {
  return "sync-"+sha256Hex(key).slice(0,40);
}

async function sourceId(key:string) {
  return sourceIdSync(key);
}

function localBaseSync(): Map<string,Entry> {
  if (baseCache) return baseCache;
  const base = new Map([...seed,...listeningSeed].map(entry=>[entry.id,entry]));
  for (const {key,kind,fields} of [...dailyVocabulary(),...readingVocabulary()]) {
    const id = sourceIdSync(key);
    base.set(id,{id,kind,fields,source:{key,fields},version:0,history:[],stage:0,due:"",reviewed:""});
  }
  for (const {id:fixedId,key,kind,fields} of extraStudyVocabulary()) {
    const id = fixedId ?? sourceIdSync(key!);
    base.set(id,{id,kind,fields,...(key ? {source:{key,fields}} : {}),version:0,history:[],stage:0,due:"",reviewed:""});
  }
  baseCache = base;
  return base;
}

const loadBase = async () => localBaseSync();
const readLocal = (): Entry[] => JSON.parse(localStorage.getItem(storageKey) || "[]");
const writeLocal = (records: Iterable<Entry>) => {
  const raw = JSON.stringify([...records]);
  localStorage.setItem(storageKey, raw);
  mirrorKeyToDurable(storageKey, raw);
};
const validDate = (value:unknown) => typeof value === "string" && (value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value));
function validFields(value:unknown) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) &&
    Object.entries(value).every(([key,field])=>/^[a-zA-Z][a-zA-Z0-9]{0,25}$/.test(key) && typeof field === "string" && field.length<=30000));
}
function validEntry(value:unknown): value is Entry {
  if (!value || typeof value!=="object") return false;
  const e = value as Entry;
  return /^[a-z0-9-]{1,64}$/.test(e.id || "") && ["article","question","note","listening"].includes(e.kind) &&
    Number.isSafeInteger(e.version) && e.version>=0 && Number.isInteger(e.stage) && e.stage>=0 && e.stage<=6 &&
    validFields(e.fields) && validDate(e.due) && validDate(e.reviewed) && Array.isArray(e.history) &&
    e.history.every(item=>item && typeof item.date==="string" && validFields(item.fields)) &&
    (!e.reviewLog || (Array.isArray(e.reviewLog) && e.reviewLog.every(item=>item &&
      typeof item.at==="string" && Number.isFinite(Date.parse(item.at)) && typeof item.passed==="boolean" &&
      Number.isInteger(item.stage) && validDate(item.due))));
}

function overlay(current:Entry | undefined, incoming:Entry) {
  if (!current) return incoming;
  const fields = {...current.fields};
  for (const [key,value] of Object.entries(incoming.fields)) {
    const previous = current.source?.fields?.[key];
    if (fields[key] === undefined || fields[key] === previous ||
        (fields[key] === "" && previous === undefined && !current.history.length)) fields[key]=value;
  }
  return {...current,fields,source:incoming.source??current.source};
}

export async function mergeDriveFeed(text:string) {
  const [header,...lines] = text.replace(/^\uFEFF/,"").trimEnd().split(/\r?\n/);
  if (header!=="CET6_SYNC_V1" || lines.length>15000) throw new Error("同步文件格式不正确。");
  const rows = new Map<string,Entry>();
  for (const line of lines) {
    if (!line.trim()) continue;
    const row = JSON.parse(line) as {key?:unknown;fields?:Entry["fields"]} | null;
    if (!row || typeof row.key!=="string" || !/^conversation:[a-z0-9_-]+:(?:word:|spelling:|phrase:|daily:\d+:)[^\r\n]{1,180}$/i.test(row.key) ||
        !validFields(row.fields) || !row.fields?.title?.trim() || !row.fields.body?.trim() ||
        !["词书复习","英语对话","阅读积累库","阅读分析","手动积累"].includes(row.fields.origin)) throw new Error("同步文件包含无效词条。");
    const spelling = {"dilemma":"62","subsequent":"64","subscribe":"61"} as Record<string,string>;
    const title = row.fields.title.toLowerCase().trim();
    const key = spelling[title]===row.fields.page ? "conversation:c269190020:spelling:"+title : row.key;
    const id = await sourceId(key);
    const fields = {...rows.get(id)?.fields,...row.fields};
    rows.set(id,{id,kind:"note",fields,source:{key,fields},version:0,history:[],stage:0,due:"",reviewed:""});
  }
  const existing = new Map((JSON.parse(localStorage.getItem(driveKey)||"[]") as Entry[]).map(row=>[row.id,row]));
  let changed = 0;
  for (const [id,row] of rows) {
    const previous = existing.get(id);
    const fields = {...previous?.fields,...row.fields};
    if (JSON.stringify(fields)!==JSON.stringify(previous?.fields)) changed++;
    existing.set(id,{...row,fields,source:{key:row.source!.key,fields}});
  }
  if (changed) {
    const raw = JSON.stringify([...existing.values()]);
    localStorage.setItem(driveKey, raw);
    mirrorKeyToDurable(driveKey, raw);
  }
  return changed;
}

export async function mergeReadingDriveDoc(text:string) {
  const parsed = parseReadingDoc(text);
  if (!parsed.length || parsed.length>15000) throw new Error("阅读积累库文档未识别到有效词条。");
  const rows = new Map<string,Entry>();
  for (const item of parsed) {
    if (!validFields(item.fields) || !item.fields.title?.trim() || !item.fields.body?.trim()) {
      throw new Error("阅读积累库包含无效词条。");
    }
    const id = await sourceId(item.key);
    const fields = {...rows.get(id)?.fields,...item.fields};
    rows.set(id,{id,kind:"note",fields,source:{key:item.key,fields},version:0,history:[],stage:0,due:"",reviewed:""});
  }
  const existing = new Map((JSON.parse(localStorage.getItem(driveKey)||"[]") as Entry[]).map(row=>[row.id,row]));
  const base = await loadBase();
  let changed = 0;
  for (const [id,row] of rows) {
    const previous = existing.get(id);
    const baseline = previous?.fields ?? base.get(id)?.fields;
    const fields = {...previous?.fields,...row.fields};
    if (JSON.stringify(fields)!==JSON.stringify(baseline)) changed++;
    if (previous || JSON.stringify(fields)!==JSON.stringify(base.get(id)?.fields)) {
      existing.set(id,{...row,fields,source:{key:row.source!.key,fields}});
    }
  }
  if (changed) {
    const raw = JSON.stringify([...existing.values()]);
    localStorage.setItem(driveKey, raw);
    mirrorKeyToDurable(driveKey, raw);
  }
  return changed;
}

function resolvedRecordsSync() {
  const records = new Map(localBaseSync());
  const cloud = JSON.parse(localStorage.getItem(driveKey)||"[]") as Entry[];
  for (const record of readLocal()) {
    const previous = records.get(record.id);
    records.set(record.id,previous?.kind==="listening" && record.kind==="listening"
      ? overlay(record,previous)
      : {...record,fields:{...previous?.fields,...record.fields}});
  }
  for (const row of cloud) records.set(row.id,overlay(records.get(row.id),row));
  return records;
}

async function resolvedRecords() {
  return resolvedRecordsSync();
}

export function listRecordsSync() {
  return [...resolvedRecordsSync().values()];
}

export async function listRecords() {
  return listRecordsSync();
}

export async function saveRecord(input:Entry, action:Action, fields?:Entry["fields"]) {
  const previous = (await resolvedRecords()).get(input.id);
  const local = new Map(readLocal().map(entry=>[entry.id,entry]));
  if ((previous?.version ?? 0)!==input.version || (previous && previous.kind!==input.kind)) {
    throw new Error("记录已有更新，刷新页面后再保存。");
  }
  const entry = {...(previous ?? input),version:input.version+1};
  if (action==="save") {
    if (!fields || !validFields(fields) || !fields.title?.trim()) throw new Error("请填写有效词条。");
    if (previous && JSON.stringify(previous.fields)!==JSON.stringify(fields)) {
      entry.history = [...previous.history,{date:new Date().toISOString(),fields:previous.fields}];
    }
    entry.fields = fields;
  } else if ((input.kind==="note" || input.kind==="listening") && previous) {
    if (action==="master") {
      const topStage = reviewIntervals.length - 1;
      const due = nextDate(reviewIntervals[topStage]);
      const reviewed = dateKey();
      entry.stage = topStage;
      entry.due = due;
      entry.reviewed = reviewed;
      entry.reviewLog = [...(previous.reviewLog ?? []), { at: new Date().toISOString(), passed: true, stage: topStage, due }].slice(-60);
    } else if (action==="reset") {
      entry.stage = 0;
      entry.due = dateKey();
      entry.reviewed = previous.reviewed || dateKey();
    } else {
      Object.assign(entry,nextReview(previous,action==="pass"));
    }
  } else if (input.kind==="question" && previous) {
    entry.reviewed=dateKey();
    entry.due=nextDate(1);
  } else {
    throw new Error("该记录无法加入复习。");
  }
  local.set(entry.id,entry);
  writeLocal(local.values());
  return entry;
}

/**
 * Restores a record back to its pre-rating snapshot (used by the Flashcard Undo button).
 */
export async function restoreRecord(snapshot: Entry): Promise<Entry> {
  const local = new Map(readLocal().map(entry => [entry.id, entry]));
  if (snapshot.version === 0 && !snapshot.reviewed && !(snapshot.reviewLog?.length) && !snapshot.history.length) {
    local.delete(snapshot.id);
  } else {
    local.set(snapshot.id, snapshot);
  }
  writeLocal(local.values());
  return (await resolvedRecords()).get(snapshot.id) ?? snapshot;
}

export function importRecords(text:string) {
  const value: unknown = JSON.parse(text);
  const rows: unknown = Array.isArray(value) ? value : (value as { records?:unknown } | null)?.records;
  if (!Array.isArray(rows) || !rows.length || rows.length>10000 || !rows.every(validEntry) ||
    new Set(rows.map(row=>row.id)).size!==rows.length) {
    throw new Error("备份格式不正确。请使用导出的学习记录 JSON。");
  }
  const local = new Map(readLocal().map(entry=>[entry.id,entry]));
  let count=0;
  for (const row of rows) {
    const previous = local.get(row.id);
    if (previous && (previous.kind!==row.kind || previous.version>=row.version)) continue;
    local.set(row.id,row);
    count++;
  }
  writeLocal(local.values());
  return count;
}

export function exportLocalDelta(): Entry[] {
  return readLocal();
}

export async function importGptNotes(items: ParsedImportCard[], batchTag?: string): Promise<{ added: number; updated: number }> {
  const existingAll = await resolvedRecords();
  const local = new Map(readLocal().map(entry => [entry.id, entry]));
  let added = 0;
  let updated = 0;
  for (const item of items) {
    const title = item.title.trim();
    const body = item.body.trim();
    if (!title || !body) continue;
    const key = `gpt-import:${item.origin}:${title.toLowerCase()}`;
    const id = await sourceId(key);
    const fields: Entry["fields"] = {
      title,
      body,
      example: item.example.trim(),
      category: item.category || "单词",
      origin: item.origin || "英语对话",
      ...(item.batch ? { batch: item.batch } : {}),
      ...(item.page ? { page: item.page } : {}),
      ...(batchTag ? { tags: batchTag } : {}),
    };
    const prev = local.get(id) ?? existingAll.get(id);
    if (prev) {
      const mergedFields = { ...prev.fields, ...fields };
      if (JSON.stringify(mergedFields) !== JSON.stringify(prev.fields)) {
        local.set(id, { ...prev, fields: mergedFields, version: prev.version + 1 });
        updated++;
      }
    } else {
      local.set(id, {
        id,
        kind: "note",
        fields,
        source: { key, fields },
        version: 1,
        history: [],
        stage: 0,
        due: "",
        reviewed: "",
      });
      added++;
    }
  }
  if (added || updated) writeLocal(local.values());
  return { added, updated };
}

function mergeLogs(a?: Entry["reviewLog"], b?: Entry["reviewLog"]) {
  const combined = [...(a ?? []), ...(b ?? [])];
  if (!combined.length) return undefined;
  const unique = new Map<string, NonNullable<Entry["reviewLog"]>[number]>();
  for (const item of combined) unique.set(item.at, item);
  return [...unique.values()].sort((x, y) => Date.parse(x.at) - Date.parse(y.at)).slice(-60);
}

export function mergeCloudRecords(rows: unknown): { pulled: number; merged: Entry[] } {
  if (!Array.isArray(rows) || rows.length > 10000 || !rows.every(validEntry)) {
    throw new Error("云端同步数据格式无效。");
  }
  const local = new Map(readLocal().map(entry => [entry.id, entry]));
  let pulled = 0;
  for (const remote of rows) {
    const current = local.get(remote.id);
    if (!current) {
      local.set(remote.id, remote);
      pulled++;
      continue;
    }
    if (current.kind !== remote.kind) continue;
    const reviewLog = mergeLogs(current.reviewLog, remote.reviewLog);
    const remoteWins =
      remote.version > current.version ||
      (remote.version === current.version &&
        ((remote.reviewLog?.length ?? 0) > (current.reviewLog?.length ?? 0) ||
          (remote.reviewed || "") > (current.reviewed || "")));
    const winner = remoteWins ? remote : current;
    const mergedEntry: Entry = { ...winner, ...(reviewLog ? { reviewLog } : {}) };
    if (JSON.stringify(mergedEntry) !== JSON.stringify(current)) {
      local.set(remote.id, mergedEntry);
      if (remoteWins || (reviewLog?.length ?? 0) > (current.reviewLog?.length ?? 0)) pulled++;
    }
  }
  const merged = [...local.values()];
  writeLocal(merged);
  return { pulled, merged };
}
