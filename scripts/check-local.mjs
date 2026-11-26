import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";

// Run the TypeScript store in isolation using the browser Storage contract.
const loaded = new Map();
const values = new Map();
Object.defineProperty(globalThis,"localStorage",{value:{
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>{values.set(key,value);},
},configurable:true});
const nativeRequire = createRequire(import.meta.url);
async function load(name) {
  const source = await readFile(new URL("../src/"+name+".ts",import.meta.url),"utf8");
  const output = ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  for (const [,dependency] of output.matchAll(/require\("\.\/([\w-]+)"\)/g)) {
    if (!loaded.has(dependency)) await load(dependency);
  }
  const entry = {exports:{}};
  runInThisContext("(function(require,exports){"+output+"})")(
    path=>path.startsWith("./")?loaded.get(path.slice(2)):nativeRequire(path),entry.exports);
  loaded.set(name,entry.exports);
  return entry.exports;
}

const store = await load("local-store");
const { vocabulary, practiceGroups } = await load("vocabulary");
const initial = await store.listRecords();
assert.equal(initial.filter(r=>r.fields.batch).length,341);
const readingInit = initial.filter(r=>r.source?.key?.startsWith("drive:1im9IlE05N7Gc0pkwDAFHpGUCxTIs2ZQt8dkZ4vvaVcQ:"));
assert.equal(readingInit.length,113);
for (const [category,count] of [["单词",58],["固定搭配",32],["同义改写",12],["关键句",11]]) {
  assert.equal(readingInit.filter(r=>r.fields.category===category).length,count);
}
const sampleReadingDoc = `六级阅读积累库
01｜词汇  VOCABULARY
• autonomy /ɔːˈtɑːnəmi/｜自主权；自主性
• nuance /ˈnuːɑːns/｜细微差别；微妙之处
02｜短语  PHRASES
• strike a balance /straɪk ə ˈbæləns/｜取得平衡`;
assert.equal(await store.mergeReadingDriveDoc(sampleReadingDoc),2);
assert.equal(await store.mergeReadingDriveDoc(sampleReadingDoc),0);
assert.equal((await store.listRecords()).filter(r=>r.fields.title==="nuance").length,1);
assert.equal((await store.listRecords()).filter(r=>r.fields.title==="strike a balance").length,1);
values.clear();
if (process.argv[2]) {
  const backup = await readFile(process.argv[2],"utf8");
  const count = JSON.parse(backup).records.length;
  assert.equal(store.importRecords(backup),count);
  assert.equal(store.importRecords(backup),0);
  assert.ok((await store.listRecords()).some(r=>r.kind==="article"));
}
const card = (await store.listRecords()).find(row=>row.kind==="note" && row.fields.title==="consecutive");
const saved = await store.saveRecord(card,"pass");
assert.equal(saved.version,card.version+1);
assert.equal(saved.reviewLog.at(-1).passed,true);
assert.equal((await store.listRecords()).find(r=>r.id===card.id).due,saved.due);
await assert.rejects(()=>store.saveRecord(card,"again"),/已有更新/);
assert.throws(()=>store.importRecords(JSON.stringify({records:[{id:"bad"}]})),/备份格式/);
const row = {key:"conversation:c269190020:daily:61:consecutive",fields:{
  title:"consecutive",body:"连续的，连贯的",origin:"词书复习",category:"单词",page:"61",batch:"1",example:"It rained for five consecutive days.",
}};
const dialogue = {key:"conversation:c269190020:word:keystone",fields:{title:"keystone",body:"关键组成部分",origin:"英语对话",category:"单词"}};
const feed = () => "CET6_SYNC_V1\n" + [row,dialogue].map(value=>JSON.stringify(value)).join("\n");
assert.equal(await store.mergeDriveFeed(feed()),2);
assert.equal(await store.mergeDriveFeed(feed()),0);
const synced = (await store.listRecords()).find(entry=>entry.id===card.id);
assert.equal(synced.due,saved.due);
assert.deepEqual(synced.reviewLog,saved.reviewLog);
assert.equal(synced.fields.example,row.fields.example);
const manual = await store.saveRecord(synced,"save",{...synced.fields,example:"我的手动例句"});
row.fields.example = "Another new example.";
assert.equal(await store.mergeDriveFeed(feed()),1);
assert.equal((await store.listRecords()).find(entry=>entry.id===manual.id).fields.example,"我的手动例句");
await assert.rejects(()=>store.mergeDriveFeed("CET6_SYNC_V1\n"+JSON.stringify(dialogue)+"\nbad"));
assert.equal((await store.listRecords()).filter(entry=>entry.fields.title==="keystone").length,1);

const beforeListening = await store.listRecords();
const listening = beforeListening.filter(entry=>entry.kind==="listening");
const wrongAnswer = listening.find(entry=>entry.id==="listening-2025-12-2-q02");
const chunk = listening.find(entry=>entry.fields.title==="crave");
assert.ok(wrongAnswer?.fields.correct && chunk?.fields.audio);
for (const [category,count] of [["错题",12],["猜对题",7],["推断正确",1],["听力词块",123]]) {
  assert.equal(listening.filter(entry=>entry.fields.category===category).length,count);
}
assert.equal(listening.filter(entry=>entry.fields.priority==="重点词块").length,10);
assert.equal(new Set(listening.map(entry=>entry.id)).size,listening.length);
assert.ok(vocabulary(beforeListening).every(card=>card.entry.kind==="note"));
assert.deepEqual(practiceGroups(beforeListening),practiceGroups(beforeListening.filter(entry=>entry.kind!=="listening")));
const wordBeforeListening = beforeListening.find(entry=>entry.id===manual.id);
const reviewedQuestion = await store.saveRecord(wrongAnswer,"pass");
const reviewedChunk = await store.saveRecord(chunk,"again");
assert.equal(reviewedQuestion.reviewLog.at(-1).passed,true);
assert.equal(reviewedChunk.reviewLog.at(-1).passed,false);
assert.ok(reviewedQuestion.due > reviewedQuestion.reviewed);
const exportWithListening = JSON.stringify({records:await store.listRecords()});
values.clear();
const previousBackup = JSON.parse(exportWithListening);
const previousQuestion = previousBackup.records.find(entry=>entry.id===wrongAnswer.id);
previousQuestion.fields.answer = "C. They are within students' budgets.";
previousQuestion.source.fields.answer = previousQuestion.fields.answer;
assert.ok(store.importRecords(JSON.stringify(previousBackup))>0);
assert.equal(store.importRecords(JSON.stringify(previousBackup)),0);
await store.mergeDriveFeed(feed());
const restored = await store.listRecords();
assert.deepEqual(restored.find(entry=>entry.id===reviewedQuestion.id),reviewedQuestion);
assert.deepEqual(restored.find(entry=>entry.id===reviewedChunk.id),reviewedChunk);
assert.deepEqual(restored.find(entry=>entry.id===manual.id),wordBeforeListening);

const html = await readFile(new URL("../dist/study.html",import.meta.url),"utf8");
assert.ok(html.includes("data:image/webp;base64,"));
assert.ok(!/<script[^>]+src=|<link[^>]+stylesheet/.test(html));
new Function(html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]);

// Verify two-way cloud progress merge keeps newer version and combines review logs.
const cloudRemote = {
  ...reviewedQuestion,
  version: reviewedQuestion.version + 1,
  stage: Math.min(reviewedQuestion.stage + 1, 6),
  reviewed: "2026-11-25",
  due: "2026-11-29",
  reviewLog: [...(reviewedQuestion.reviewLog ?? []), { at: "2026-11-25T08:00:00.000Z", passed: true, stage: 1, due: "2026-11-29" }],
};
const cloudMerged = store.mergeCloudRecords([cloudRemote]);
assert.equal(cloudMerged.pulled, 1);
const afterCloud = (await store.listRecords()).find(entry => entry.id === reviewedQuestion.id);
assert.equal(afterCloud.version, cloudRemote.version);
assert.equal(afterCloud.reviewLog.length, cloudRemote.reviewLog.length);

// Verify new conversation IDs (e.g. c270556750) and GPT daily word list parsing work cleanly.
const newConvRow = {key:"conversation:c270556750:word:solidarity",fields:{title:"solidarity",body:"团结；一致",origin:"英语对话",category:"单词"}};
assert.equal(await store.mergeDriveFeed("CET6_SYNC_V1\n"+JSON.stringify(newConvRow)),1);
const { parseGptWordList } = await load("reading-vocabulary");
const gptParsed = parseGptWordList("1. **resilience** /rɪˈzɪliəns/｜韧性；恢复力\n• take on：呈现出；承担");
assert.equal(gptParsed.length, 2);
assert.equal(gptParsed[0].title, "resilience");
assert.equal(gptParsed[1].category, "固定搭配");

// Verify mainstream vocab-app New vs Review separation across days, plus Master ("斩") and Undo!
const { buildStudySession, partitionPool } = await load("study-session");
const { nextDate } = await load("data");
const day3Cards = vocabulary(await store.listRecords()).filter(c => c.entry.fields.batch === "3");
assert.ok(day3Cards.length >= 75, "Day 3 deck should exist with 75+ words");
// Simulate studying 70 words of Day 3 yesterday (due today)
const todayIso = nextDate(0);
const yesterdayIso = nextDate(-1);
const simulatedDay3 = day3Cards.map((c, idx) =>
  idx < 70
    ? { ...c, entry: { ...c.entry, reviewed: yesterdayIso, due: todayIso, stage: 0, version: 1 } }
    : c,
);
const parts = partitionPool(simulatedDay3, todayIso);
assert.equal(parts.unlearned.length, day3Cards.length - 70);
assert.equal(parts.dueReview.length, 70);
// Starting "new" today MUST strictly serve ONLY the remaining unlearned words (never restart from word #1!)
const newSession = buildStudySession({
  deckId: "day-3",
  deckLabel: "第 3 天词书",
  studyKind: "new",
  pool: simulatedDay3,
  mode: "recognize",
  groupSize: 20,
  shuffle: false,
  today: todayIso,
});
assert.ok(newSession);
assert.equal(newSession.queueIds.length, Math.min(20, day3Cards.length - 70));
assert.equal(newSession.queueIds[0], simulatedDay3[70].entry.id, "New session must continue right at word #71");
// Starting "review" today MUST strictly serve ONLY the 70 due words from yesterday
const revSession = buildStudySession({
  deckId: "day-3",
  deckLabel: "第 3 天词书",
  studyKind: "review",
  pool: simulatedDay3,
  mode: "recognize",
  groupSize: 20,
  shuffle: false,
  today: todayIso,
});
assert.ok(revSession);
assert.equal(revSession.queueIds.length, 20);
assert.ok(revSession.queueIds.every(id => simulatedDay3.slice(0, 70).some(c => c.entry.id === id)));
// Verify "master" ("斩") jumps straight to stage 6 and restoreRecord (Undo) cleanly reverts it
const freshDay3Entry = (await store.listRecords()).find(r => r.id === day3Cards[0].entry.id);
const beforeMaster = JSON.parse(JSON.stringify(freshDay3Entry));
const mastered = await store.saveRecord(freshDay3Entry, "master");
assert.equal(mastered.stage, 6);
assert.ok(mastered.due > mastered.reviewed);
const undone = await store.restoreRecord(beforeMaster);
assert.equal(undone.stage, beforeMaster.stage);
assert.equal(undone.reviewed, beforeMaster.reviewed);

console.log("Offline bundle, 341 starter words, 113+ reading notes, listening and vocabulary progress, backup merge, cloud sync merge, GPT import, cross-day New/Review separation, Master & Undo, and Drive deduplication passed.");
