import type { Entry, Fields } from "./data";
import { listeningChunkGroups } from "./listening-chunks";

export const listeningCategories = ["错题", "猜对题", "推断正确", "听力词块"] as const;
type ListeningCategory = (typeof listeningCategories)[number];
const origin = "听力选项速读技巧";
const paperTitles: Record<string, string> = {
  S01: "S01 · 《听力与阅读特训》长对话 Test 1（考试年月待核实）",
  S02: "S02 · 《听力与阅读特训》长对话 Test 2（考试年月待核实）",
  S03: "S03 · 《听力与阅读特训》短文理解 Test 1（考试年月待核实）",
  S04: "S04 · 2025 年 12 月真题（一）",
  S05: "S05 · 2025 年 12 月真题（二）",
};

function listeningEntry(id: string, category: ListeningCategory, content: Fields): Entry {
  const fields = { ...content, category, origin };
  return {
    id: `listening-${id}`,
    kind: "listening",
    fields,
    source: { key: `chatgpt:6ac78330-4a10-83ea-abec-32673cfe8ac6:${id}`, fields },
    version: 0,
    history: [],
    stage: 0,
    due: "",
    reviewed: "",
  };
}

type Question = {
  id: string;
  paper: keyof typeof paperTitles;
  section: "A" | "B" | "C";
  number: number;
  topic: string;
  category: Exclude<ListeningCategory, "听力词块">;
  answer: string;
  correct: string;
  evidence: string;
  body: string;
  tags?: string;
};

const questions: Question[] = [
  { id: "s01-q03", paper: "S01", section: "A", number: 3, topic: "改变饮食习惯", category: "错题",
    answer: "D", correct: "B", evidence: "giving up something you're accustomed to eating",
    body: "你提到第 3 题没听太清。D 里的 morning meetings 出自后面的咖啡例子，具体误选过程待核实。" },
  { id: "s01-q05", paper: "S01", section: "A", number: 5, topic: "绩效评估中的态度问题", category: "错题",
    answer: "B", correct: "D", evidence: "I had an attitude problem",
    body: "你提到录音继续播放时理解速度没跟上，漏掉了一整段。", tags: "跟听掉队" },
  { id: "s01-q06", paper: "S01", section: "A", number: 6, topic: "话术掩盖不合理选择", category: "猜对题",
    answer: "C", correct: "C", evidence: "manipulative language\ndisguise the unreasonable choices",
    body: "选项 C 的 mask their irrational choices 对应原文。你主要靠听到的表达匹配。", tags: "关键词匹配" },
  { id: "s01-q07", paper: "S01", section: "A", number: 7, topic: "诚实被视为过错", category: "猜对题",
    answer: "B", correct: "B", evidence: "more of a sin than a virtue",
    body: "录音表达与 B 直接对应。你定位到了答案表达，对整段讨论理解不充分。", tags: "关键词匹配" },
  { id: "s01-q08", paper: "S01", section: "A", number: 8, topic: "保住权力和威望", category: "猜对题",
    answer: "D", correct: "D", evidence: "retaining their power and prestige",
    body: "选项 D 用 preserving their power and prestige。你靠原词和同义替换选对。", tags: "关键词匹配" },
  { id: "s02-q03", paper: "S02", section: "A", number: 3, topic: "建筑成果留存更久", category: "猜对题",
    answer: "B", correct: "B. It is long-lasting.", evidence: "the legacies you build will last much longer",
    body: "你明确说当时没听到这条答案信息。", tags: "答案细节漏听" },
  { id: "s02-q05", paper: "S02", section: "A", number: 5, topic: "桑切斯的公众知名度", category: "推断正确",
    answer: "C", correct: "C", evidence: "a very high public profile",
    body: "录音还提到他外出会被认出和骚扰。你根据整段对话推断出他的公众知名度高。", tags: "上下文推断" },
  { id: "s02-q06", paper: "S02", section: "A", number: 6, topic: "私人助理的工作职责", category: "错题",
    answer: "D（后订正为 A）", correct: "A", evidence: "As his personal assistant\nrun common everyday chores",
    body: "你靠整体信息推断，漏掉了处理日常琐事这一职责。D 涉及提高公众形象，录音没有将其列为职责。", tags: "上下文推断" },
  { id: "s02-q07", paper: "S02", section: "A", number: 7, topic: "应聘者缺少工作经验", category: "猜对题",
    answer: "D", correct: "D", evidence: "This is my first job after graduating from university\nI don't have much prior working experience",
    body: "你明确说没听到这条信息。little previous work experience 指几乎没有工作经验，区别于完全没有经验或有一点经验。毕业后的第一份工作也无法证明大学期间做过兼职。", tags: "答案细节漏听" },
  { id: "s03-q12", paper: "S03", section: "B", number: 12, topic: "婚礼容易产生额外开支", category: "错题",
    answer: "C", correct: "A", evidence: "Even with the most meticulous budgeting\nunexpected costs are bound to occur",
    body: "你确认不熟悉 meticulous 和 be bound to。录音说即使预算做得很细，也难免有额外开支。C 描述的是 Susan 的个人做法。", tags: "词汇不熟" },
  { id: "s03-q13", paper: "S03", section: "B", number: 13, topic: "婚礼已经取消", category: "错题",
    answer: "D", correct: "B", evidence: "now-cancelled wedding\ncalled off the wedding",
    body: "去拉斯维加斯只是后来提出的建议。你提到人物关系和事件经过很乱，是否漏听 called off 待核实。", tags: "事件关系混乱" },
  { id: "s03-q15", paper: "S03", section: "B", number: 15, topic: "新娘拒绝未婚夫的提议", category: "错题",
    answer: "A", correct: "D", evidence: "The bride quickly shut down the idea",
    body: "你对故事发展把握不清。是否也受到 shut down 的词义影响待核实。", tags: "事件关系混乱" },
  { id: "2025-12-1-q01", paper: "S04", section: "A", number: 1, topic: "男士的外交官身份", category: "错题",
    answer: "D", correct: "A", evidence: "one of our country's most experienced and distinguished career diplomats",
    body: "没有准确定位男士是杰出的职业外交官。具体是漏听还是误解，待核实。" },
  { id: "2025-12-1-q10", paper: "S04", section: "B", number: 10, topic: "记得争执的解决方式", category: "猜对题",
    answer: "A", correct: "A", evidence: "I no longer even recall what the dispute was about, but I definitely recall the resolution.",
    body: "你明确说是根据整段内容猜的。but 后面的 resolution 是作答依据。", tags: "上下文猜测" },
  { id: "2025-12-1-q15", paper: "S04", section: "B", number: 15, topic: "越来越不愿意花时间做饭", category: "错题",
    answer: "B", correct: "D", evidence: "Americans' growing aversion to spending time in the kitchen",
    body: "录音讨论的是人们越来越不愿意花时间做饭。你选了家庭经济状况恶化，具体误选原因待核实。" },
  { id: "2025-12-1-q18", paper: "S04", section: "C", number: 18, topic: "贵重物品与托运行李", category: "错题",
    answer: "A", correct: "D", evidence: "never pack anything of real value in your checked baggage",
    body: "关键建议是托运行李里别放贵重物品。是否漏听 never 等信息待核实。" },
  { id: "2025-12-1-q20", paper: "S04", section: "C", number: 20, topic: "对社交时使用手机的看法", category: "猜对题",
    answer: "B", correct: "B", evidence: "The participants had a negative view of phone use during social interactions.",
    body: "你明确说是根据整段内容猜的。B 对应参与者的负面态度。", tags: "上下文猜测" },
  { id: "2025-12-1-q23", paper: "S04", section: "C", number: 23, topic: "游览欧洲的传统住宿方式", category: "错题",
    answer: "B", correct: "A", evidence: "For decades, B&Bs have been the classic way to visit Europe",
    body: "你听到了 B&B 在欧洲较常见，听完问题想改 A，但因不确定是否听到 classic 而保留了 B。复听时把 for decades 和 B&Bs 一起用于确认 classic 的传统含义。", tags: "答案犹豫" },
  { id: "2025-12-1-q25", paper: "S04", section: "C", number: 25, topic: "民宿经营的收入机会", category: "错题",
    answer: "B", correct: "D", evidence: "The final consideration is a financial one\nopportunities for income",
    body: "答案强调收入机会。你选了接待客人的数量，具体误选原因待核实。" },
  { id: "2025-12-2-q02", paper: "S05", section: "A", number: 2, topic: "女士对甜食的态度", category: "错题",
    answer: "照片上标有 C（有涂改，初选字母待核实）", correct: "A. They never really appeal to her.",
    evidence: "I never really crave sweet things or any fancy delicacies.",
    body: "你确认听到了 crave，当时把它理解成了 carve（雕刻）。never really crave 对应选项中的 never really appeal to her。复听时可用 sweet things 检查词义是否符合语境。", tags: "词汇误辨" },
];

const earlierChunks = [
  { id: "crave", title: "crave", body: "/kreɪv/ · 渴望，非常想要。", example: "crave sweet things 渴望吃甜食" },
  { id: "never-really", title: "never really", body: "其实并不怎么……", example: "I never really crave sweet things." },
  { id: "sweet-things", title: "sweet things", body: "甜食。", example: "I never really crave sweet things." },
  { id: "within-students-budgets", title: "within students' budgets", body: "在学生的预算范围内。", example: "They are within students' budgets." },
];

export const listeningSeed = [
  ...questions.map(({ id, category, paper, section, number, topic, answer, correct, evidence, body, tags }) =>
    listeningEntry(id, category, {
      title: `第 ${number} 题 · ${topic}`,
      paper: paperTitles[paper],
      section: `Section ${section}`,
      answer, correct, evidence, body,
      audio: evidence.replaceAll("\n", ". "),
      ...(tags ? { tags } : {}),
    })),
  ...listeningChunkGroups.flatMap(({ paper, topic, items }) => items.map(([id, title, body, example, priority]) =>
    listeningEntry(`chunk-${id}`, "听力词块", {
      title, body, example, topic, audio: title, paper: paperTitles[paper],
      ...(priority ? { priority: "重点词块" } : {}),
    }))),
  ...earlierChunks.map(({ id, title, body, example }) =>
    listeningEntry(`chunk-${id}`, "听力词块", { title, body, audio: title, example, paper: paperTitles.S05 })),
];
