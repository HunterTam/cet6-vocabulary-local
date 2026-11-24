import { dailyVocabulary } from "./daily-vocabulary";
import { dateKey, nextDate, seed, type Entry } from "./data";
import { nextReview } from "./review-schedule";
import { listeningSeed } from "./listening-data";
import { parseReadingDoc, readingVocabulary } from "./reading-vocabulary";

const storageKey = "cet6-vocabulary-local-v1";
const driveKey = "cet6-vocabulary-drive-v1";
type Action = "pass" | "again" | "save";
let basePromise: Promise<Map<string,Entry>> | undefined;

async function sourceId(key:string) {
  const bytes = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(key));
  return "sync-"+Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,"0")).join("").slice(0,40);
}

async function localBase() {
  const base = new Map([...seed,...listeningSeed].map(entry=>[entry.id,entry]));
  const notes = await Promise.all([...dailyVocabulary(),...readingVocabulary()].map(async ({key,kind,fields}):Promise<Entry>=>{
    const id = await sourceId(key);
    return {id,kind,fields,source:{key,fields},version:0,history:[],stage:0,due:"",reviewed:""};
  }));
  for (const note of notes) base.set(note.id,note);
  return base;
}
const loadBase = () => basePromise ??= localBase();
const readLocal = (): Entry[] => JSON.parse(localStorage.getItem(storageKey) || "[]");
const writeLocal = (records: Iterable<Entry>) => localStorage.setItem(storageKey,JSON.stringify([...records]));
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
    if (!row || typeof row.key!=="string" || !/^conversation:c269190020:(?:word:|spelling:|daily:\d+:)[a-z0-9][a-z0-9 '’.-]{0,140}$/i.test(row.key) ||
        !validFields(row.fields) || !row.fields?.title?.trim() || !row.fields.body?.trim() ||
        !["词书复习","英语对话"].includes(row.fields.origin)) throw new Error("同步文件包含无效词条。");
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
  if (changed) localStorage.setItem(driveKey,JSON.stringify([...existing.values()]));
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
  if (changed) localStorage.setItem(driveKey,JSON.stringify([...existing.values()]));
  return changed;
}

async function resolvedRecords() {
  const records = new Map(await loadBase());
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

export async function listRecords() {
  return [...(await resolvedRecords()).values()];
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
    Object.assign(entry,nextReview(previous,action==="pass"));
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
