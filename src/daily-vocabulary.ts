import type { Fields } from "./data";
import { dayFourDetails } from "./day-four-details";

export const dailyBatches = [
  {day:"1", first:61, last:73, count:87},
  {day:"2", first:74, last:86, count:83},
  {day:"3", first:87, last:99, count:84},
  {day:"4", first:100, last:112, count:87},
] as const;

// Each line is a printed book page, in the order shown in the shared lesson.
const pages = `
61|junk:废旧物品；丢弃|consecutive:连续的，连贯的|subscribe:订阅；赞同；捐助|extinct:灭绝的；不再存在的
62|cork:软木；软木塞|glare:强光；怒视|dictate:口授；命令；决定|credit:信用；学分；赞扬|dilemma:进退两难的困境|prominent:杰出的；显著的；突出的
63|insane:疯狂的；精神失常的|magnitude:巨大；重要性；量级|hostage:人质|exchange:交换；交流|flank:侧面；位于两侧|convene:召集；开会|affiliate:使隶属；使加入|inertia:惯性；惰性
64|appearance:外观；出现|subsequent:随后的，后来的|reflect:反映；反射；思考|slump:暴跌；萧条|skull:颅骨|implication:含义；暗示；潜在影响|diligent:勤奋的|cradle:摇篮；发源地
65|adapt:适应；改编|skip:跳过；略过；跳跃|erroneous:错误的|subsidiary:子公司；辅助的|benefit:好处；福利；受益|subsidy:补贴，津贴|fabric:织物；结构
66|substance:物质；实质；依据|adjust:调整；适应|elegant:优美的；简洁巧妙的|edible:可食用的|collaboration:合作；协作|abuse:滥用；虐待|imply:暗示；意味着|distinct:明显不同的；清楚的
67|economy:经济；节约|dock:码头；船坞；停靠|rim:边缘；轮缘|indifferent:漠不关心的|appraisal:评价；估价|confidential:机密的；保密的
68|administration:管理；行政部门|collapse:倒塌；崩溃|instantaneous:瞬间的；即时的|commodity:商品；日用品|affection:喜爱；感情|environment:环境|complicated:复杂的；难懂的|comic:滑稽的；喜剧的；漫画|evaluate:评价；评估
69|subtract:减去；扣除|suburb:郊区；近郊|devote:奉献；投入
70|cautious:谨慎的；小心的|successive:连续的；接连的
71|marginal:微小的；边缘的|clerk:职员；店员|rein:缰绳；控制|ozone:臭氧|successor:继任者；接替者|decay:腐烂；衰退|neglect:忽视；疏忽|heap:一大堆；大量|application:申请；应用；实施|modest:谦虚的；适度的
72|residential:住宅的；居住的|orchestra:管弦乐队|depict:描绘；描述|convention:惯例；公约；大会|association:协会；联系|contempt:轻蔑；蔑视|signal:信号；表明|condense:浓缩；压缩；凝结
73|fund:资金；基金；资助|extreme:极端的；极度的|latitude:纬度；自由度|hawk:鹰；鹰派人物；叫卖|illustrate:举例说明；阐明|mass:大量；团；质量；大规模的|hum:哼唱；发嗡嗡声|suffice:足够；满足需要
74|moral:道德的；道德规范|discard:丢弃；抛弃|plunge:猛冲；暴跌|explicit:明确的；直言不讳的|slick:光滑的；圆滑的；制作精巧的|approve:赞成；批准
75|random:随机的|prolong:延长；拖长|fundamental:根本的；基本的|quench:解渴；熄灭|lease:租约；租用|howl:嚎叫；呼啸|sufficient:足够的|revenue:收入；财政收入
76|behave:表现；举止；运转|banquet:宴会；盛宴|divine:神圣的；极好的|donate:捐赠；赠送|longevity:长寿；寿命|margin:页边空白；差额；余地|immune:免疫的；不受影响的|destructive:破坏性的；毁灭性的
77|climate:气候；氛围|impact:影响；冲击|precedent:先例；惯例|suite:套房；一套成组的东西|disorder:混乱；紊乱；疾病|sulfur:硫|refrain:克制；避免；叠句|skeptical:怀疑的|defeat:击败；失败|endure:忍受；持续
78|outward:外部的；表面的；向外|summit:山顶；峰会|activate:激活；启动|summon:召唤；传唤；鼓起|aggravate:加重；使恶化；激怒|annoy:使恼怒；打扰|designate:指定；标明；任命
79|gorgeous:华丽的；极美的|reform:改革；改造|proclaim:宣告；声明|preferable:更可取的|handicap:障碍；不利条件；妨碍
80|superficial:表面的；肤浅的|paperback:平装书
81|fascinate:使着迷；深深吸引
82|accustomed:习惯于……的|merit:优点；价值；值得|shark:鲨鱼|superintendent:主管；监督人|manuscript:手稿；原稿|orthodox:正统的；传统的|original:最初的；原创的；原件|misery:痛苦；悲惨
83|precious:珍贵的|regime:政权；制度|negotiate:谈判；协商|superior:较好的；上级|inventory:库存；清单|smuggle:走私；偷偷运入|superiority:优势；优越|supersonic:超音速的
84|pole:杆；极点；电极|cape:披肩；斗篷；海角|additional:额外的；附加的|latent:潜在的；隐伏的|curb:控制；约束；路缘|supervise:监督；管理；指导
85|notorious:臭名昭著的|concern:关心；担忧；涉及|shove:猛推；乱塞|supplement:补充；补充物|supplementary:补充的；附加的|brisk:轻快的；生意兴隆的
86|planet:行星|suppress:压制；抑制；查禁|bang:巨响；猛撞；砰地关上|bandage:绷带；用绷带包扎|supreme:最高的；至高无上的|surge:激增；涌动|confirm:证实；确认|scrap:碎片；废料；废弃
87|radiant:容光焕发的；光芒四射的|sacred:神圣的；不可侵犯的|exhibit:展示；展品|fort:堡垒；要塞|surgeon:外科医生|inspire:鼓舞；激发|fossil:化石
88|interim:临时的；过渡时期|entitle:给……命名；使享有权利|compromise:妥协；危及|pitch:音高；场地；投掷|eclipse:日食；月食；使黯然失色|dine:进餐；用餐
89|perception:感知；看法|identification:识别；身份证明|exclude:排除；不包括|surgery:外科手术；外科学|monster:怪物；巨大的可怕事物
90|deteriorate:恶化；变坏|burden:负担；使负重|fold:折叠；褶皱|gauge:估计；测量；仪表|outline:提纲；轮廓；概述|junction:交汇处；连接点|literal:字面上的；逐字的|surpass:超过；胜过
91|racket:球拍；喧闹声|haul:拖；拉；搬运|identify:识别；确定|athlete:运动员|peculiar:奇怪的；特有的|pessimistic:悲观的|console:安慰；慰藉
92|species:物种（单复数同形）|author:作者；著者|deficiency:缺乏；不足；缺陷|radioactive:放射性的|surplus:剩余；盈余；过剩的
93|survival:生存；幸存|survive:幸存；继续存在
94|definitely:肯定地；明确地|criticism:批评；批判|susceptible:易受影响的；易感染的|sue:起诉；控告|peg:钉；挂钩；固定|suspension:暂停；悬挂；悬浮|dart:飞奔；猛冲；飞镖|imperative:极重要的；紧急的；必要的事|breakdown:故障；崩溃；明细分析
95|oriental:东方的（部分语境中已显陈旧）|sanction:制裁；批准|notable:值得注意的；显著的|restraint:克制；限制；约束|alternative:替代方案；可供选择的|fatigue:疲劳；疲惫|impetus:推动力；促进因素
96|suspicion:怀疑；猜疑|manufacture:制造；生产|opaque:不透明的；难以理解的|safeguard:保护；保障措施|juvenile:青少年的；幼年的；青少年|erect:建立；竖起；直立的
97|subtle:微妙的；不易察觉的|autonomous:自主的；自治的|majesty:威严；雄伟；陛下|budget:预算；编列预算|destruction:破坏；毁灭|emotion:情感；情绪|reserve:预订；保留；储备|passive:被动的；消极的
98|grin:咧嘴笑；露齿笑|suspicious:怀疑的；可疑的|elapse:（时间）流逝|innovation:创新；新方法
99|reap:收获；获得|preference:偏爱；优先选择|emphasis:强调；重点|retain:保留；保持；记住|award:奖项；授予|bound:必然的；受约束的；跳跃|sequence:顺序；序列|medieval:中世纪的|majority:大多数；多数|napkin:餐巾；餐巾纸
100|proximity:接近；邻近|preside:主持；主管|settlement:解决；协议；定居点|aesthetic:美学的；审美的|prospect:前景；可能性；景象|sustain:维持；支撑；承受|nickname:绰号；昵称|evolution:进化；演变
101|patriot:爱国者|swamp:沼泽；使不堪承受|infinite:无限的；无穷的|adequate:足够的；适当的|probability:概率；可能性|brand:品牌；商标；打烙印|pursuit:追求；追赶；事业
102|recognition:认出；认可；承认|resultant:作为结果产生的；因而发生的|resident:居民；居住的|swap:交换；互换|nil:零；无|issue:问题；期号；发布|leaflet:传单；小册子
103|coward:胆小鬼；懦夫|cozy:舒适的；温暖的|symbol:象征；符号|periodic:周期性的；定期的|articulate:清楚表达；善于表达的|nonetheless:尽管如此；然而
104|deliberate:故意的；深思熟虑的；仔细考虑|destination:目的地；终点
105|enthusiasm:热情；热忱|substitute:替代品；代替|symmetry:对称；对称性|adjacent:邻近的；毗连的|scent:气味；香味；踪迹|sympathetic:同情的；赞同的|chapel:小教堂；礼拜堂|intensify:加强；加剧|colleague:同事；同僚
106|productive:富有成效的；多产的|conclude:得出结论；结束|cord:绳索；电线|ambitious:有雄心的；目标远大的|doubtless:无疑地；肯定地|factor:因素；要素|mortal:终有一死的；致命的；凡人|momentum:动力；势头；动量
107|substantial:大量的；实质性的|gland:腺；腺体|agony:极度痛苦；苦恼|clone:克隆体；克隆
108|interfere:干涉；妨碍|denote:表示；意味着|register:登记；注册；登记簿|perpetual:永久的；持续不断的|shaft:轴；杆；竖井|sympathy:同情；同情心|contemplate:沉思；考虑|feast:盛宴；宴会；尽情享用
109|irritate:激怒；使烦躁；刺激|diagnose:诊断；判断问题|dominate:支配；占主导地位|installment:分期付款；一期；一集
110|response:回答；反应；响应|enhance:提高；增强|poisonous:有毒的；恶毒的|implicit:含蓄的；暗含的|hound:猎犬；不断烦扰|pore:毛孔；小孔；仔细研读|alert:警觉的；警报；提醒
111|sophisticated:复杂精密的；老练的|principal:主要的；校长；负责人|envisage:设想；展望|emphasize:强调；着重指出|handbook:手册；指南|infant:婴儿；婴儿的；初期的|calcium:钙|symphony:交响乐；交响曲
112|questionnaire:问卷；调查表|protest:抗议|glide:滑行；滑翔|erosion:侵蚀；腐蚀；逐渐削弱|bust:打破；突击搜查；半身像；破产|hysterical:歇斯底里的；情绪失控的|alcohol:酒精；酒|symposium:专题讨论会；研讨会|manual:手工的；使用手册
`;

const historicalSpelling: Record<string,string> = {dilemma:"dilema",subsequent:"subsquent",subscribe:"subsccribe"};

export function dailyVocabulary(): {key:string; kind:"note"; fields:Fields}[] {
  return pages.trim().split("\n").flatMap(line => {
    const [page,...items] = line.split("|");
    const batch = dailyBatches.find(group=>Number(page)>=group.first && Number(page)<=group.last);
    if (!batch) throw new Error("Unknown vocabulary page: "+page);
    return items.map(item => {
      const [title,body] = item.split(":");
      const previousSpelling = historicalSpelling[title];
      const detail = batch.day === "4" ? dayFourDetails[title] : undefined;
      return {
        key:previousSpelling ? "conversation:c269190020:spelling:"+title : "conversation:c269190020:daily:"+page+":"+title,
        kind:"note",
        fields:{title,body:detail ? "/"+detail[0]+"/\n"+detail[1] : body,category:"单词",origin:"词书复习",batch:batch.day,page,...(previousSpelling?{previousSpelling}:{}),...(detail?{example:detail[2]+"\n"+detail[3]}:{})},
      };
    });
  });
}
