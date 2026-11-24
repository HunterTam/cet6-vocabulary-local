export type Kind = "article" | "question" | "note" | "listening";
export type Fields = Record<string, string>;
export type Entry = {
  id: string;
  kind: Kind;
  fields: Fields;
  version: number;
  history: {date: string; fields: Fields}[];
  stage: number;
  due: string;
  reviewed: string;
  reviewLog?: {at:string; passed:boolean; stage:number; due:string}[];
  source?: {key: string; fields: Fields};
};
export const questionTypes = ["细节理解","推理判断","主旨大意","词义猜测","指代判断","作者意图","态度观点"];
export const reasons = ["定位偏差","同义改写未识别","指代误判","题干与选项拼接错误","核心名词短语误判","过度推断","范围或程度偷换","关键信息遗漏","词义误读"];
export const noteTypes = ["单词","固定搭配","熟词生义","同义改写","关键句","解题规律"];
export const dateKey = (date = new Date()) => new Intl.DateTimeFormat("sv-SE", {timeZone:"Asia/Shanghai", year:"numeric", month:"2-digit", day:"2-digit"}).format(date);
export function nextDate(days: number, now = new Date()) {
  return dateKey(new Date(now.getTime() + days * 86400000));
}
export const priority = ["47","48","50","52","54"];
export const seed: Entry[] = [
  ...priority.map((n):Entry => ({
    id: "initial-" + n, kind: "question" as const, version: 0, stage: 0, due: "", reviewed: "", history: [],
    fields: n === "48" ? {
      n, theme: "个人成就（节选）", status: "待补录", type: "指代判断",
      tags: "题干与选项拼接、代词指代、核心名词短语",
      prompt: "What is American society’s assumption of personal achievement?",
      evidence: "现有复盘记录指出，四个选项以 It 起句。把选项分别和题干拼起来，检查主语替换后各选项表达的意思，再回原文寻找对 personal achievement 的描述。原文及完整选项待补录。",
      rule: "先圈出题干要求描述的核心名词短语；将选项里的代词替换为候选先行词，检查语义，再用原文验证。第 48 题的现有复盘将 It 指向 personal achievement。"
    } : {n, status: "待补录"},
  })),
  {id:"initial-rule",kind:"note",version:0,stage:0,due:"",reviewed:"",history:[],fields:{
    title:"题干与选项拼接", category:"解题规律", tags:"代词指代、核心名词短语、题干与选项拼接",
    question:"initial-48", body:"圈出题干要描述的对象，把代词替换成候选名词短语。拼成完整句后，逐项检查语义、范围和原文证据。",
    example:"第 48 题。四个选项开头的 It 在现有复盘中指向 personal achievement。",
  }},
];
export const searchable = (f: Fields) => Object.values(f).join(" ").toLowerCase();
export const splitTags = (value = "") => value.split(/[、,，;；\n]/).map(s => s.trim()).filter(Boolean);
export const firstAnswer = (entry: Entry) => entry.history.find(h => h.fields.answer)?.fields.answer || entry.fields.answer;
export const resultFor = (entry: Entry) => {
  const answer = firstAnswer(entry), correct = entry.fields.correct;
  return answer && correct ? (answer === correct ? "正确" : "错题") : "待补录";
};
