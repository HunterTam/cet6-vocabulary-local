import type { Fields } from "./data";

export const readingDocId = "1im9IlE05N7Gc0pkwDAFHpGUCxTIs2ZQt8dkZ4vvaVcQ";
export const readingDocUrl = `https://docs.google.com/document/d/${readingDocId}/edit`;

export type ReadingVocabItem = { key: string; kind: "note"; fields: Fields };

function splitTermAndPhonetic(raw: string): { title: string; phonetic: string } {
  const cleaned = raw.trim();
  const match = cleaned.match(/\s+(\/[^\s/][^/]*\/.*)$/);
  if (!match || match.index === undefined) {
    return { title: cleaned, phonetic: "" };
  }
  const title = cleaned.slice(0, match.index).trim();
  const phonetic = match[1].replace(/\s{2,}/g, " ").trim();
  return { title, phonetic };
}

function normalizeSection(line: string): "单词" | "固定搭配" | "同义改写" | "关键句" | undefined {
  if (/^0?1[｜|].*(?:词汇|VOCABULARY)/i.test(line)) return "单词";
  if (/^0?2[｜|].*(?:短语|PHRASES)/i.test(line)) return "固定搭配";
  if (/^【.*同义改写.*】/.test(line) || /同义改写/.test(line) && /^[\[【]/.test(line)) return "同义改写";
  if (/^0?3[｜|].*(?:语句|SENTENCES)/i.test(line)) return "关键句";
  return undefined;
}

export function parseReadingDoc(text: string): ReadingVocabItem[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const items: ReadingVocabItem[] = [];
  let section: "单词" | "固定搭配" | "同义改写" | "关键句" | undefined;
  let current: {
    category: "单词" | "固定搭配" | "同义改写" | "关键句";
    title: string;
    phonetic: string;
    meaning: string;
    examples: string[];
  } | undefined;

  const flush = () => {
    if (!current || !current.title || !current.meaning) {
      current = undefined;
      return;
    }
    const body = current.phonetic ? `${current.phonetic}\n${current.meaning}` : current.meaning;
    const fields: Fields = {
      title: current.title,
      category: current.category,
      origin: "阅读积累库",
      body,
      example: current.examples.join("\n"),
      sourceUrl: readingDocUrl,
      tags: "Google Drive",
    };
    items.push({
      key: `drive:${readingDocId}:${current.category}:${current.title.toLowerCase()}`,
      kind: "note",
      fields,
    });
    current = undefined;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || /^[━─═—-]{3,}$/.test(line)) continue;

    const nextSection = normalizeSection(line);
    if (nextSection) {
      flush();
      section = nextSection;
      continue;
    }
    if (!section) continue;

    if (section === "关键句") {
      const sentenceMatch = line.match(/^(?:〔\d+〕|\[\d+\]|\d+[.、])\s*(.+)$/);
      if (sentenceMatch) {
        flush();
        current = {
          category: "关键句",
          title: sentenceMatch[1].trim(),
          phonetic: "",
          meaning: "",
          examples: [],
        };
        continue;
      }
      if (current) {
        const transMatch = line.match(/^译[｜|]\s*(.+)$/);
        if (transMatch) {
          current.meaning = current.meaning ? `${current.meaning}\n${transMatch[1].trim()}` : transMatch[1].trim();
          continue;
        }
        if (/^(?:记|例|题)[｜|]/.test(line)) {
          current.examples.push(line.replace(/^(记|例|题)\|/, "$1｜"));
          continue;
        }
      }
      continue;
    }

    if (/^[•·▪\-]\s*/.test(line)) {
      const content = line.replace(/^[•·▪\-]\s*/, "").trim();
      const divider = content.search(/[｜|]/);
      if (divider === -1) continue;
      flush();
      const head = content.slice(0, divider).trim();
      const tail = content.slice(divider + 1).trim();
      const { title, phonetic } = splitTermAndPhonetic(head);
      const category: "单词" | "固定搭配" | "同义改写" =
        section === "同义改写" || /[↔≠]/.test(title) ? "同义改写" : section;
      const tailParts = tail.split(/\s+(?=(?:例|题|译|记)[｜|])/);
      const meaning = (tailParts[0] || "").trim();
      const examples = tailParts.slice(1).map(part => part.trim().replace(/^(例|题|译|记)\|/, "$1｜")).filter(Boolean);
      current = { category, title, phonetic, meaning, examples };
      continue;
    }

    if (current && /^(?:例|题|译|记)[｜|]/.test(line)) {
      current.examples.push(line.replace(/^(例|题|译|记)\|/, "$1｜"));
    }
  }

  flush();
  return items;
}

// Snapshot synced from Google Drive doc "六级阅读积累库｜词汇·短语·语句" (1im9IlE05N7Gc0pkwDAFHpGUCxTIs2ZQt8dkZ4vvaVcQ).
const readingDocSnapshot = `
六级阅读积累库
只收真正会影响理解、选项判断和同义改写识别的高价值内容

━━━━━━━━━━━━━━━━━━
01｜词汇  VOCABULARY
━━━━━━━━━━━━━━━━━━

• absurdity /əbˈsɝːdəti/｜荒谬之处；荒唐  例｜The intent is to untangle and clarify the issue by emphasizing its absurdities.
  译｜这种表达的目的，是通过突出其中的荒谬之处把问题理清楚。

• autonomy /ɔːˈtɑːnəmi/｜自主权；自主性
• badge /bædʒ/｜徽章；工作牌、姓名牌
• belittle /bɪˈlɪtəl/｜贬低；轻视
• biting /ˈbaɪtɪŋ/｜尖刻的；辛辣的
• bullying /ˈbʊliɪŋ/｜欺凌
• communicate /kəˈmjuːnɪkeɪt/｜传达；说明（文中不只是“交流”）  例｜A lot depends on how such monitoring initiatives are communicated.
  译｜很大程度上取决于这些监控措施是如何被传达、说明给员工的。

• condition /kənˈdɪʃən/｜使形成特定反应或观念；对……进行心理/行为塑造  例｜We seem to take it for granted that advertisers and marketers are allowed to condition even the youngest children.
  译｜我们似乎想当然地认为，广告商和营销人员甚至可以对最年幼的孩子进行观念和行为塑造。

• consistently /kənˈsɪstəntli/｜持续地；一贯地
• contemptible /kənˈtemptəbəl/｜可鄙的；令人鄙视的
• counterproductive /ˌkaʊntərprəˈdʌktɪv/｜适得其反的
• dehumanizing /diːˈhjuːmənaɪzɪŋ/｜使人失去尊严、缺乏人性化待遇的
• detrimental /ˌdetrɪˈmentəl/｜有害的；不利的
• disrespect /ˌdɪsrɪˈspekt/｜不尊重
• empower /ɪmˈpaʊər/｜赋予权力或能力
• erosion /ɪˈroʊʒən/｜逐渐侵蚀；削弱
• harassment /həˈræsmənt/｜骚扰
• heighten /ˈhaɪtən/｜加剧；增强  例｜When a person consistently acts sarcastically, it may only serve to heighten their underlying hostility and insecurity.
  译｜一个人如果总是挖苦讽刺别人，可能只会加剧其潜在的敌意和不安全感。

• hostility /hɑːˈstɪləti/｜敌意  例｜Sarcasm is often hostility disguised as humor.
  译｜讽刺往往是披着幽默外衣的敌意。

• implication /ˌɪmplɪˈkeɪʃən/｜含义；也可指潜在影响、后果
• implant /ɪmˈplænt/｜植入
• inherent /ɪnˈhɪrənt/｜内在的；固有的
• insecurity /ˌɪnsɪˈkjʊrəti/｜不安全感；缺乏自信
• intent / intention /ɪnˈtent/  /ɪnˈtenʃən/｜意图；目的
• interpret /ɪnˈtɝːprət/｜解释；理解
• intrusive /ɪnˈtruːsɪv/｜侵扰性的；侵犯隐私的
• irritation /ˌɪrəˈteɪʃən/｜恼怒；烦躁
• initiative /ɪˈnɪʃətɪv/｜措施；倡议；方案
• opponent /əˈpoʊnənt/｜反对者
• oppression /əˈpreʃən/｜压迫
• prevalence /ˈprevələns/｜流行程度；发生率
• proponent /prəˈpoʊnənt/｜支持者；倡导者（≈ supporter）
• regimented /ˈredʒəmentɪd/｜受到严格安排或管束的；规律而刻板的
• relentless /rɪˈlentləs/｜持续不断的；不间断的
• retaliate /rɪˈtælieɪt/｜报复；反击
• revenue /ˈrevənuː/｜收入；营收
• rude /ruːd/｜粗鲁的
• sarcasm /ˈsɑːrkæzəm/｜讽刺；挖苦
• scheme /skiːm/｜方案；计划（文中不是“阴谋”）
• sparingly /ˈsperɪŋli/｜节制地；少量地
• surveillance /sɚˈveɪləns/｜监控；监督
• underlying /ˌʌndərˈlaɪɪŋ/｜潜在的；深层的
• undisguised /ˌʌndɪsˈɡaɪzd/｜不加掩饰的
• universally /ˌjuːnəˈvɝːsəli/｜普遍地；无一例外地
• voluntary /ˈvɑːlənteri/｜自愿的
• wit /wɪt/｜机智；诙谐

• variability /ˌveriəˈbɪləti/｜可变性；变化性
  例｜Variability is crucially important for learning new skills.
  译｜变化性对于学习新技能至关重要。
• generalisation /ˌdʒenrələˈzeɪʃən/｜泛化；概括（英式拼写；美式 generalization）
  例｜Variability leads to better generalisation of what is learned.
  译｜变化性会让所学内容得到更好的泛化。
• perception /pərˈsepʃən/｜感知；知觉
• stimulus /ˈstɪmjələs/；stimuli /ˈstɪmjəlaɪ/｜刺激；刺激物
• atypical /eɪˈtɪpɪkəl/｜非典型的
• diminished /dɪˈmɪnɪʃt/｜减弱的；降低的
• infant /ˈɪnfənt/｜婴儿
• conducive /kənˈduːsɪv/｜有助于……的；有益于……的
• compel /kəmˈpel/｜迫使；强迫
• readily /ˈredɪli/｜容易地；轻易地；欣然地
• reconstruct /ˌriːkənˈstrʌkt/｜重构；重建
• serve /sɝːv/｜（网球等）发球；也可表示“服务”

━━━━━━━━━━━━━━━━━━
02｜短语  PHRASES
━━━━━━━━━━━━━━━━━━

• big eater /ˌbɪɡ ˈiːtər/｜饭量大、很能吃的人；不是“吃得种类多的人”  题｜Big eaters are more likely to become overweight.
  记｜big eater 指“吃得多的人”，不是“吃得多样的人”。

• turn out + 名词 /tɝːn aʊt/｜生产出；培养出；造就出  例｜We’re turning out little consumers rather than young citizens who will value themselves for what they contribute to society.
  译｜我们正在把孩子培养成“小消费者”，而不是重视自身社会贡献的年轻公民。

• turn out to be ... /tɝːn aʊt tə biː/｜结果是……；后来证明是……
• cradle-to-grave /ˌkreɪdəl tə ˈɡreɪv/｜从出生到死亡的；终身的  例｜Cradle-to-grave consumerism is contributing to growing rates of low self-esteem, depression and other forms of mental illness.
  译｜贯穿一生的消费主义正在促使低自尊、抑郁等心理问题的发生率上升。

• freedom of speech /ˌfriːdəm əv ˈspiːtʃ/｜言论自由  例｜There’ll be those who argue that would be a breach of freedom of speech and infringe the rights of corporations.
  译｜有人会认为这样做会侵犯言论自由，并侵犯企业的权利。

• anecdotal evidence /ˌænɪkˈdoʊtəl ˈevɪdəns/｜轶事性证据；个人经验式证据，而非系统研究证据
• dietary diversity /ˈdaɪəteri daɪˈvɝːsəti/｜饮食多样性
• standard dietary advice /ˈstændərd ˈdaɪəteri ədˈvaɪs/｜常规 / 标准饮食建议
• squeeze more productivity from sb. /skwiːz mɔːr ˌproʊdʌkˈtɪvəti frəm/｜从某人身上压榨出更多生产力
• workplace surveillance /ˈwɝːkpleɪs sɚˈveɪləns/｜职场监控
• sexual harassment /ˈsekʃuəl həˈræsmənt/｜性骚扰
• go undetected /ɡoʊ ˌʌndɪˈtektɪd/｜未被发现  例｜The pattern would probably have gone undetected without such data analysis.
  译｜如果没有这种数据分析，这一规律很可能不会被发现。

• opt to do sth. /ɑːpt tə duː/｜选择做某事
• be detrimental to ... /biː ˌdetrɪˈmentəl tə/｜对……有害 / 不利
• take away autonomy /teɪk əˈweɪ ɔːˈtɑːnəmi/｜剥夺自主权
• monitoring initiatives /ˈmɑːnɪtərɪŋ ɪˈnɪʃətɪvz/｜监控措施
• make sth. known /meɪk noʊn/｜让某事被知道；把某事说明清楚  题｜How well bosses make known their purpose of monitoring.
  记｜make sth. known = 把某事说明、让别人知道；这里对应 communicated。

• civil liberties /ˌsɪvəl ˈlɪbərtiz/｜公民自由 / 公民权利
• erosion of civil liberties /ɪˈroʊʒən əv ˌsɪvəl ˈlɪbərtiz/｜公民自由受到侵蚀 / 削弱
• refrain from doing /rɪˈfreɪn frəm ˈduːɪŋ/｜克制 / 避免做某事
• by nature /baɪ ˈneɪtʃər/｜本质上；天生地
• put sb. down /pʊt daʊn/｜贬低 / 羞辱某人
• tone down /toʊn daʊn/｜缓和；减弱
• cradle-to-grave consumerism /ˌkreɪdəl tə ˈɡreɪv kənˈsuːmərɪzəm/｜贯穿一生的消费主义

• serve in tennis /sɝːv ɪn ˈtenɪs/｜在网球中发球
• be exposed to /bi ɪkˈspoʊzd tə/｜接触到；暴露于
• be conducive to /bi kənˈduːsɪv tə/｜有助于；有益于
• compel sb. to do sth. /kəmˈpel/｜迫使某人做某事
• task at hand /tæsk æt hænd/｜当前手头的任务
• reconstruct one’s memories /ˌriːkənˈstrʌkt/｜重构记忆
• readily recognise /ˈredɪli ˈrekəɡnaɪz/｜很容易识别
• spark one’s curiosity /spɑːrk/｜激发某人的好奇心
• forced to ↔ compelled to｜被迫…… ↔ 被迫……
• reconstruct memories ↔ reorganise memories｜重构记忆 ↔ 重新组织记忆
• most effective for learning ↔ most conducive to learning｜对学习最有效 ↔ 最有助于学习

【常见同义改写】
• relentless pressure ↔ constant pressure /rɪˈlentləs ˈpreʃər/ ↔ /ˈkɑːnstənt ˈpreʃər/｜持续不断的压力 ↔ 持续压力
• proponents ↔ supporters /prəˈpoʊnənts/ ↔ /səˈpɔːrtərz/｜支持者 ↔ 支持者
• produce unexpected results ↔ yield something unexpected /prəˈduːs ˌʌnɪkˈspektɪd rɪˈzʌlts/ ↔ /jiːld ˈsʌmθɪŋ ˌʌnɪkˈspektɪd/｜产生意外结果 ↔ 得到意料之外的结果
• communicated ↔ make known /kəˈmjuːnɪkeɪtɪd/ ↔ /meɪk noʊn/｜被传达 / 说明 ↔ 让……知道
• feel put down ↔ feel belittled and disrespected /fiːl pʊt daʊn/ ↔ /fiːl bɪˈlɪtəld ænd ˌdɪsrɪˈspektɪd/｜感到被贬低 ↔ 感到被轻视和不尊重
• contributing to ↔ causing /kənˈtrɪbjətɪŋ tə/ ↔ /ˈkɔːzɪŋ/｜促成 / 导致 ↔ 导致
• growing rates ↔ more and more cases /ˈɡroʊɪŋ reɪts/ ↔ /mɔːr ænd mɔːr ˈkeɪsɪz/｜发生率上升 ↔ 越来越多的案例
• mental illness ↔ psychological problems /ˈmentəl ˈɪlnəs/ ↔ /ˌsaɪkəˈlɑːdʒɪkəl ˈprɑːbləmz/｜精神 / 心理疾病 ↔ 心理问题
• many ≠ universally /ˈmeni/ ≠ /ˌjuːnəˈvɝːsəli/｜many 只是“很多”；universally 是“普遍 / 所有人都”，程度不能偷换

━━━━━━━━━━━━━━━━━━
03｜语句  SENTENCES
━━━━━━━━━━━━━━━━━━

〔01〕We’re turning out little consumers rather than young citizens who will value themselves for what they contribute to society.
译｜我们正在把孩子培养成“小消费者”，而不是那些以自己对社会的贡献来衡量自我价值的年轻公民。
记｜turn out + 名词 = 培养出；rather than 后面是作者真正认可的方向。

〔02〕We seem to take it for granted that advertisers and marketers are allowed to condition even the youngest children.
译｜我们似乎想当然地认为，广告商和营销人员可以对甚至最年幼的孩子进行消费观念和行为上的塑造。
记｜condition 在这里不是“条件”，而是“塑造 / 训练反应”。

〔03〕Cradle-to-grave consumerism is contributing to growing rates of low self-esteem, depression and other forms of mental illness.
译｜贯穿一生的消费主义正在促使低自尊、抑郁及其他心理问题的发生率上升。
记｜cradle-to-grave ↔ life-long；contributing to ↔ causing；mental illness ↔ psychological problems。

〔04〕Some of this data analysis can produce unexpected results. For example, ...
译｜这类数据分析有时会产生意想不到的结果。例如，……
记｜看到 For example / For instance，先回看前一句总观点；例子通常是在证明它。

〔05〕A lot depends on how such monitoring initiatives are communicated.
译｜很大程度上取决于这些监控措施是如何被传达、说明给员工的。
记｜选项常改写为：How well bosses make known their purpose of monitoring.

〔06〕Sarcasm is often hostility disguised as humor.
译｜讽刺往往是“披着幽默外衣的敌意”。
记｜hostility disguised as humor = 用幽默作伪装的敌意。

〔07〕Sarcastic statements are expressed in a cutting manner; witty remarks are delivered with undisguised and harmless humor.
译｜讽刺话往往尖刻伤人；机智幽默则是不加掩饰但无害的幽默。
记｜cutting = 尖刻的；undisguised = 不加掩饰的。

〔08〕The intent is to untangle and clarify the issue by emphasizing its absurdities.
译｜这种机智表达的目的，是通过突出其中荒谬之处，把问题理清楚。
记｜intent ↔ intention；untangle and clarify = 理清并澄清。

〔09〕Learning from less variable input is often fast, but may fail to generalise to new stimuli.
译｜从变化较少的输入中学习往往更快，但可能无法泛化到新的刺激。
记｜generalise to new stimuli = 泛化到新刺激；和机器学习里的“泛化”是同一个核心概念。

〔10〕These four kinds of variability have never been directly compared—which means that we currently don’t know which is most effective for learning.
译｜这四种变化性从未被直接比较过，因此目前还不知道哪一种最有利于学习。
记｜most effective for learning ↔ most conducive to learning；don’t know which ↔ yet to be identified。

〔11〕When training is variable, learners are forced to actively reconstruct their memories.
译｜当训练条件具有变化性时，学习者会被迫主动重构自己的记忆。
记｜forced to ↔ compelled to；reconstruct memories ↔ reorganise memories。
`;

export function readingVocabulary(): ReadingVocabItem[] {
  return parseReadingDoc(readingDocSnapshot);
}
