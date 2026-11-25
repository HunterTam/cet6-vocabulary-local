import type { Card } from "./vocabulary";

export type ConfusableItem = {
  term: string;
  meaning: string;
  source: "cet6" | "library";
};

// High-frequency CET-6 visually similar / easily confused word groups: [word, concise Chinese meaning].
const confusableGroups: readonly (readonly (readonly [string, string])[])[] = [
  [["adapt", "适应；改编"], ["adopt", "采纳；收养"], ["adept", "熟练的；内行的"]],
  [["consecutive", "连续不断的"], ["successive", "接连的；相继的"], ["subsequent", "随后的；后来的"]],
  [["subscribe", "订阅；赞同"], ["prescribe", "开处方；规定"], ["describe", "描述"], ["inscribe", "铭刻；题写"]],
  [["imply", "暗示；意味着"], ["infer", "推断；推论"], ["apply", "申请；应用"], ["comply", "遵守；顺从"]],
  [["implicit", "含蓄的；暗含的"], ["explicit", "明确的；直白的"], ["elicit", "引出；诱出"], ["illicit", "非法的"]],
  [["principal", "主要的；校长"], ["principle", "原则；原理"]],
  [["supplement", "补充；增刊"], ["complement", "补足；相辅相成"], ["compliment", "赞美；恭维"], ["implement", "实施；执行"]],
  [["proponent", "支持者；倡导者"], ["opponent", "反对者；对手"], ["component", "组成部分；元件"]],
  [["contempt", "轻蔑；蔑视"], ["contemplate", "沉思；考虑"], ["attempt", "尝试；企图"], ["exempt", "豁免的"]],
  [["surpass", "超过；胜过"], ["suppress", "压制；抑制"], ["compress", "压缩"], ["depress", "使沮丧；压低"], ["oppress", "压迫"]],
  [["sustain", "维持；承受"], ["retain", "保留；记住"], ["attain", "达到；获得"], ["obtain", "获得"], ["maintain", "维护；保持"], ["contain", "包含；克制"]],
  [["exclude", "排除；不包括"], ["include", "包含"], ["conclude", "得出结论；结束"], ["preclude", "阻止；排除"]],
  [["precedent", "先例；惯例"], ["president", "总统；校长"], ["precede", "先于；领先"], ["proceed", "继续进行"]],
  [["preside", "主持；主管"], ["reside", "居住"], ["subside", "平息；减弱"]],
  [["erosion", "侵蚀；削弱"], ["corrosion", "腐蚀；锈蚀"], ["illusion", "错觉；幻觉"]],
  [["perception", "感知；看法"], ["reception", "接待；反响"], ["deception", "欺骗"], ["conception", "概念；构想"]],
  [["compel", "迫使；强迫"], ["expel", "驱逐；开除"], ["repel", "击退；使厌恶"], ["propel", "推动；推进"]],
  [["autonomy", "自主权；自治"], ["anatomy", "解剖学；剖析"], ["astronomy", "天文学"], ["economy", "经济；节约"]],
  [["intrusive", "侵扰性的"], ["exclusive", "排外的；独有的"], ["inclusive", "包容的；包含的"], ["elusive", "难以捉摸的"]],
  [["diminish", "减弱；减少"], ["distinguish", "区分；辨别"], ["extinguish", "熄灭；扑灭"]],
  [["conducive", "有助于……的"], ["decisive", "决定性的"], ["persuasive", "有说服力的"]],
  [["detrimental", "有害的；不利的"], ["fundamental", "根本的；基础的"], ["sentimental", "多愁善感的"]],
  [["deteriorate", "恶化；变坏"], ["deliberate", "故意的；深思熟虑的"], ["decorate", "装饰"]],
  [["perpetual", "永久的；持续的"], ["superficial", "表面的；肤浅的"], ["artificial", "人造的；虚假的"]],
  [["evolution", "进化；演变"], ["revolution", "革命；变革"], ["evaluation", "评估；评价"]],
  [["stimulus", "刺激；刺激物"], ["simulate", "模拟；假装"], ["simultaneous", "同时发生的"]],
  [["suspicion", "怀疑；猜疑"], ["suspicious", "可疑的；怀疑的"], ["superstition", "迷信"]],
  [["implication", "含义；潜在影响"], ["application", "应用；申请"], ["complication", "复杂情况；并发症"]],
  [["crave", "渴望；热望"], ["carve", "雕刻；切开"], ["curb", "控制；约束"], ["curve", "曲线；弯曲"]],
  [["discrete", "离散的；分离的"], ["discreet", "谨慎的；审慎的"]],
  [["stationary", "静止的；固定的"], ["stationery", "文具；信纸"]],
  [["affect", "影响；感动"], ["effect", "效果；实现"], ["defect", "缺陷；缺点"]],
  [["reserve", "预订；保留；储备"], ["preserve", "保护；保存"], ["deserve", "值得；应得"], ["conserve", "节约；保护"], ["observe", "观察；遵守"]],
  [["console", "安慰；控制台"], ["counsel", "劝告；律师"], ["council", "委员会；议会"]],
  [["literal", "字面上的"], ["literary", "文学的"], ["literate", "有读写能力的"]],
  [["mortal", "终有一死的；致命的"], ["moral", "道德的"], ["morale", "士气；斗志"]],
  [["alert", "警觉的；警报"], ["alter", "改变；修改"], ["altar", "祭坛"]],
  [["affection", "喜爱；感情"], ["infection", "感染；传染"], ["reflection", "反映；反思"]],
  [["appraisal", "评价；估价"], ["praise", "赞扬；称赞"], ["apprise", "通知；告知"]],
  [["confidential", "机密的；保密的"], ["confident", "自信的"], ["potential", "潜在的；潜力"]],
  [["collapse", "倒塌；崩溃"], ["elapse", "（时间）流逝"], ["relapse", "旧病复发；故态复萌"]],
  [["commodity", "商品；日用品"], ["community", "社区；群体"], ["immunity", "免疫力；豁免权"]],
  [["condense", "浓缩；压缩"], ["consent", "同意；许可"], ["contend", "竞争；主张"]],
  [["discard", "丢弃；抛弃"], ["disregard", "漠视；不理会"], ["safeguard", "保护；保障措施"]],
  [["plunge", "猛冲；暴跌"], ["pledge", "发誓；承诺"], ["plague", "瘟疫；困扰"]],
  [["prolong", "延长；拖长"], ["belong", "属于"]],
  [["quench", "解渴；熄灭"], ["clench", "紧握；咬紧"], ["wrench", "猛扭；扳手"]],
  [["banquet", "宴会；盛宴"], ["bouquet", "花束"], ["blanket", "毯子；全面覆盖"]],
  [["margin", "边缘；差额；余地"], ["marginal", "微小的；边缘的"], ["marine", "海洋的"]],
  [["skeptical", "怀疑的"], ["spectacle", "奇观；景象"], ["spectacular", "壮观的"]],
  [["summit", "峰会；山顶"], ["submit", "提交；屈服"], ["summon", "召唤；鼓起"]],
  [["aggravate", "加重；使恶化"], ["aggregate", "总计；聚集"], ["exaggerate", "夸大；夸张"]],
  [["proclaim", "宣告；声明"], ["exclaim", "惊呼；呼喊"], ["reclaim", "收回；开垦"], ["acclaim", "称赞；喝彩"]],
  [["orthodox", "正统的；传统的"], ["paradox", "悖论；自相矛盾"]],
  [["regime", "政权；制度"], ["region", "地区；区域"], ["regimen", "养生法；方案"]],
  [["superior", "较好的；上级"], ["inferior", "较差的；下级"], ["interior", "内部的"], ["exterior", "外部的"]],
  [["notorious", "臭名昭著的"], ["glorious", "光荣的；辉煌的"], ["victorious", "胜利的"]],
  [["surge", "激增；涌动"], ["urge", "敦促；强烈愿望"], ["merge", "合并；融合"], ["emerge", "浮现；出现"]],
  [["sacred", "神圣的"], ["scared", "害怕的"], ["scarce", "稀缺的；罕见的"]],
  [["interim", "临时的；过渡的"], ["internal", "内部的"], ["eternal", "永恒的"], ["external", "外部的"]],
  [["compromise", "妥协；危及"], ["comprise", "包含；由……组成"], ["premise", "前提；假设"]],
  [["eclipse", "日食；使黯然失色"], ["ellipse", "椭圆"], ["collapse", "崩溃；倒塌"]],
  [["peculiar", "奇怪的；特有的"], ["particular", "特定的；挑剔的"], ["popular", "流行的；受欢迎的"]],
  [["deficiency", "缺乏；缺陷"], ["efficiency", "效率"], ["proficiency", "熟练；精通"], ["sufficient", "足够的"]],
  [["surplus", "剩余；盈余"], ["surface", "表面；浮现"], ["surpass", "超过；胜过"]],
  [["susceptible", "易受影响的"], ["acceptable", "可接受的"], ["perceptive", "敏锐的"]],
  [["imperative", "极重要的；迫切的"], ["comparative", "比较的"], ["cooperative", "合作的"]],
  [["restraint", "克制；限制"], ["constraint", "约束；限制条件"], ["refrain", "克制；避免"]],
  [["impetus", "推动力；促进因素"], ["impulse", "冲动；脉冲"], ["impact", "影响；冲击"], ["implant", "植入"]],
  [["subtle", "微妙的；不易察觉的"], ["shuttle", "穿梭；班车"], ["settle", "解决；定居"], ["brittle", "脆弱的；易碎的"]],
  [["passive", "被动的；消极的"], ["massive", "巨大的；大规模的"], ["passion", "热情；激情"]],
  [["reap", "收获；获得"], ["leap", "跳跃；剧增"], ["heap", "一大堆；堆积"]],
  [["proximity", "接近；邻近"], ["approximate", "近似的；大约"], ["priority", "优先事项"]],
  [["settlement", "解决；协议；定居点"], ["sentiment", "情绪；观点"], ["segment", "部分；片段"]],
  [["aesthetic", "美学的；审美的"], ["athletic", "运动的；体格健壮的"], ["sympathetic", "同情的；赞同的"]],
  [["prospect", "前景；可能性"], ["inspect", "检查；视察"], ["respect", "尊重；方面"], ["suspect", "怀疑；嫌疑人"]],
  [["patriot", "爱国者"], ["patron", "赞助人；老顾客"], ["portrait", "肖像；描绘"], ["pattern", "模式；图案"]],
  [["swamp", "沼泽；使不堪承受"], ["swap", "交换；互换"], ["sweep", "横扫；清扫"]],
  [["infinite", "无限的；无穷的"], ["definite", "明确的；肯定的"], ["finite", "有限的"], ["confine", "限制；禁闭"]],
  [["adequate", "足够的；适当的"], ["advocate", "提倡；拥护者"], ["delicate", "精致的；微妙的"], ["dedicate", "奉献；致力于"]],
  [["pursuit", "追求；事业"], ["persuade", "说服；劝说"], ["suite", "套房；套件"]],
  [["coward", "胆小鬼；懦夫"], ["outward", "外部的；表面的"], ["awkward", "尴尬的；笨拙的"], ["award", "奖项；授予"]],
  [["articulate", "清楚表达；善于表达的"], ["calculate", "计算；估算"], ["circulate", "循环；流传"]],
  [["substitute", "替代品；代替"], ["constitute", "构成；组成"], ["institute", "机构；制定"]],
  [["symmetry", "对称；对称性"], ["cemetery", "墓地；公墓"], ["geometry", "几何学"]],
  [["adjacent", "邻近的；毗连的"], ["decent", "体面的；像样的"], ["recent", "最近的"]],
  [["scent", "气味；香味"], ["scene", "场景；现场"], ["sense", "感觉；意识"], ["ascend", "上升；攀登"]],
  [["intensify", "加强；加剧"], ["identify", "识别；确认"], ["justify", "证明……正当"], ["verify", "核实；验证"]],
  [["colleague", "同事；同僚"], ["college", "学院；大学"], ["collect", "收集；聚集"]],
  [["cord", "绳索；电线"], ["chord", "和弦；弦"], ["core", "核心；要点"], ["cork", "软木塞"]],
  [["ambitious", "有雄心的"], ["ambiguous", "模棱两可的"], ["cautious", "谨慎的"]],
  [["momentum", "动力；势头"], ["moment", "片刻；时刻"], ["monument", "纪念碑；丰碑"]],
  [["substantial", "大量的；实质性的"], ["essential", "本质的；必不可少的"], ["influential", "有影响力的"]],
  [["gland", "腺；腺体"], ["grand", "宏伟的；盛大的"], ["glare", "强光；怒视"], ["glide", "滑行；滑翔"]],
  [["agony", "极度痛苦"], ["agency", "机构；代理处"], ["irony", "反讽；讽刺"]],
  [["interfere", "干涉；妨碍"], ["interpret", "解释；理解"], ["intervene", "介入；干预"], ["interact", "互动；交流"]],
  [["denote", "表示；意味着"], ["devote", "奉献；投入"], ["promote", "促进；晋升"], ["remote", "遥远的；远程的"]],
  [["shaft", "轴；杆；竖井"], ["shift", "转移；轮班"], ["swift", "迅速的；敏捷的"]],
  [["feast", "盛宴；尽情享用"], ["beast", "野兽"], ["least", "最少的"]],
  [["irritate", "激怒；使烦躁"], ["imitate", "模仿；仿效"], ["initiate", "发起；启动"], ["isolate", "隔离；孤立"]],
  [["diagnose", "诊断；判断问题"], ["dialogue", "对话"], ["diagram", "图表；示意图"]],
  [["dominate", "支配；占主导"], ["donate", "捐赠；赠送"], ["nominate", "提名；任命"], ["eliminate", "消除；淘汰"]],
  [["enhance", "提高；增强"], ["advance", "前进；进步"], ["glance", "一瞥；扫视"]],
  [["hound", "猎犬；不断烦扰"], ["bound", "必然的；受约束的"], ["wound", "伤口；伤害"]],
  [["pore", "毛孔；仔细研读"], ["pour", "倾倒；涌流"], ["poor", "贫穷的；差的"]],
  [["envisage", "设想；展望"], ["revise", "修订；复习"], ["devise", "设计；想出"], ["supervise", "监督；指导"]],
  [["infant", "婴儿；初期的"], ["instant", "即时的；瞬间"], ["constant", "持续的；恒定的"]],
  [["symphony", "交响乐；交响曲"], ["sympathy", "同情；同情心"], ["symposium", "专题讨论会"]],
  [["protest", "抗议"], ["protect", "保护"], ["project", "项目；投射"], ["pretext", "借口；托词"]],
  [["hysterical", "歇斯底里的"], ["historical", "历史的；有关历史的"], ["theoretical", "理论上的"]],
  [["manual", "手工的；手册"], ["annual", "每年的；年度的"], ["mutual", "相互的；共同的"]],
  [["tumble", "跌倒；翻滚；暴跌"], ["stumble", "绊倒；磕绊"], ["humble", "谦逊的；卑微的"], ["crumble", "崩溃；碎裂"]],
  [["tutor", "导师；辅导"], ["mentor", "导师；顾问"], ["monitor", "监控；班长"]],
  [["hindrance", "阻碍；妨碍"], ["tolerance", "宽容；耐受度"], ["endurance", "忍耐力；持久力"]],
  [["badge", "徽章；工作牌"], ["budget", "预算"], ["bridge", "桥梁；弥合"]],
  [["belittle", "贬低；轻视"], ["battle", "战斗；搏斗"], ["brittle", "易碎的；脆弱的"]],
  [["hostility", "敌意"], ["hospitality", "热情好客"], ["humility", "谦逊；谦卑"]],
  [["inherent", "内在的；固有的"], ["coherent", "连贯的；一致的"], ["adherent", "追随者；黏附的"]],
  [["insecurity", "不安全感"], ["sincerity", "真诚；诚挚"], ["scarcity", "稀缺；不足"]],
  [["initiative", "措施；倡议；主动性"], ["initial", "最初的；首字母"], ["intuitive", "直觉的"], ["innovative", "创新的"]],
  [["prevalence", "流行程度；发生率"], ["relevance", "相关性；切题"], ["equivalence", "等价；相等"]],
  [["relentless", "持续不断的"], ["restless", "坐立不安的"], ["reckless", "鲁莽的；不顾后果的"], ["ruthless", "无情的；冷酷的"]],
  [["retaliate", "报复；反击"], ["radiate", "辐射；散发"], ["validate", "证实；使生效"]],
  [["scheme", "方案；计划"], ["theme", "主题；题材"], ["scene", "场景；景象"]],
  [["variability", "可变性；变化性"], ["availability", "可用性；有效性"], ["reliability", "可靠性"]],
  [["atypical", "非典型的"], ["typical", "典型的"], ["topical", "时事的；热门话题的"], ["optical", "光学的；视觉的"]],
  [["readily", "容易地；欣然地"], ["steadily", "稳步地；持续地"], ["deadly", "致命的"]],
  [["reconstruct", "重构；重建"], ["construct", "建造；构建"], ["instruct", "指导；命令"], ["destruct", "破坏"]],
  [["serve", "发球；服务；起作用"], ["swerve", "突然转向"], ["nerve", "神经；勇气"]],
  [["harassment", "骚扰"], ["embarrassment", "尴尬；窘迫"]],
  [["disrespect", "不尊重"], ["respective", "各自的；分别的"], ["retrospect", "回顾；追溯"]],
  [["empower", "赋予权力或能力"], ["embody", "体现；包含"], ["employ", "雇用；采用"]],
  [["underlying", "潜在的；深层的"], ["undermine", "暗中破坏；削弱"], ["undergo", "经历；经受"]],
  [["voluntary", "自愿的"], ["solitary", "孤独的；独自的"], ["contemporary", "当代的；同时代的"]],
  [["rude", "粗鲁的"], ["crude", "粗糙的；粗略的"], ["nude", "裸体的"]],
  [["wit", "机智；诙谐"], ["knit", "编织；紧密结合"], ["grit", "毅力；砂砾"]],
  [["glare", "强光；怒视"], ["flare", "耀斑；爆发"], ["stare", "凝视；盯着看"]],
  [["dictate", "口授；决定"], ["dedicate", "奉献；致力于"], ["indicate", "表明；指示"]],
  [["dilemma", "进退两难的困境"], ["diploma", "文凭；毕业证书"]],
  [["prominent", "杰出的；显著的"], ["permanent", "永久的；长期的"], ["eminent", "著名的；卓越的"]],
  [["magnitude", "巨大；重要性；量级"], ["attitude", "态度"], ["aptitude", "天资；才能"], ["altitude", "海拔；高度"]],
  [["convene", "召集；开会"], ["intervene", "干预；介入"], ["convention", "惯例；大会"]],
  [["affiliate", "使隶属；分支机构"], ["alleviate", "缓解；减轻"], ["allocate", "分配；拨出"]],
  [["inertia", "惯性；惰性"], ["criteria", "标准；准则"]],
  [["slump", "暴跌；萧条"], ["stump", "树桩；难住"], ["clump", "丛；块"]],
  [["diligent", "勤奋的"], ["intelligent", "聪明的；智能的"], ["negligent", "疏忽的；粗心的"]],
  [["erroneous", "错误的"], ["enormous", "庞大的；巨大的"], ["nervous", "紧张的"]],
  [["subsidiary", "子公司；辅助的"], ["subsidy", "补贴；津贴"], ["auxiliary", "辅助的；备用的"]],
  [["substance", "物质；实质"], ["instance", "例子；情况"], ["stance", "立场；姿态"]],
  [["edible", "可食用的"], ["audible", "听得见的"], ["credible", "可信的"], ["eligible", "有资格的"]],
  [["distinct", "明显不同的；清楚的"], ["extinct", "灭绝的"], ["instinct", "本能；直觉"]],
  [["indifferent", "漠不关心的"], ["different", "不同的"], ["deferent", "恭顺的"]],
  [["instantaneous", "瞬间的；即时的"], ["spontaneous", "自发的；自然的"], ["simultaneous", "同时的"]],
  [["evaluate", "评价；评估"], ["evacuate", "撤离；疏散"], ["elevate", "提升；抬高"]],
  [["subtract", "减去；扣除"], ["abstract", "抽象的；摘要"], ["extract", "提取；摘录"], ["distract", "使分心"]],
  [["cautious", "谨慎的；小心的"], ["conscious", "有意识的"], ["curious", "好奇的"]],
  [["rein", "缰绳；控制"], ["reign", "统治；盛行"], ["vein", "静脉；纹理"]],
  [["decay", "腐烂；衰退"], ["delay", "延迟；耽搁"], ["decade", "十年"]],
  [["neglect", "忽视；疏忽"], ["select", "选择；挑选"], ["reflect", "反映；反思"]],
  [["modest", "谦虚的；适度的"], ["modern", "现代的"], ["moderate", "适度的；温和的"]],
  [["depict", "描绘；描述"], ["predict", "预测；预言"], ["verdict", "裁决；定论"]],
  [["latitude", "纬度；自由度"], ["altitude", "海拔；高度"], ["attitude", "态度"], ["gratitude", "感激"]],
  [["illustrate", "举例说明；阐明"], ["frustrate", "使沮丧；挫败"], ["demonstrate", "证明；演示"]],
  [["suffice", "足够；满足需要"], ["surface", "表面"], ["sacrifice", "牺牲"]],
  [["preferable", "更可取的"], ["profitable", "有利可图的"], ["portable", "便携的"]],
  [["fascinate", "使着迷；吸引"], ["vaccinate", "接种疫苗"], ["accelerate", "加速"]],
  [["accustomed", "习惯于……的"], ["customary", "习惯的；惯例的"], ["consumed", "消耗的；沉迷的"]],
  [["merit", "优点；价值"], ["inherit", "继承；遗传"], ["spirit", "精神"]],
  [["manuscript", "手稿；原稿"], ["transcript", "成绩单；文字记录"], ["postscript", "附言"]],
  [["misery", "痛苦；悲惨"], ["mystery", "神秘；谜团"], ["ministry", "（政府的）部"]],
  [["precious", "珍贵的"], ["previous", "先前的"], ["precocious", "早熟的"]],
  [["negotiate", "谈判；协商"], ["navigate", "导航；应对"]],
  [["inventory", "库存；清单"], ["invention", "发明；创造"], ["investment", "投资"]],
  [["smuggle", "走私；偷运"], ["struggle", "挣扎；奋斗"], ["snuggle", "依偎"]],
  [["latent", "潜在的；隐伏的"], ["patent", "专利；明显的"], ["talent", "天赋；人才"]],
  [["brisk", "轻快的；兴隆的"], ["risk", "风险；冒险"], ["crisp", "清脆的；利落的"]],
  [["scrap", "碎片；废弃"], ["scrape", "刮；擦伤"], ["strap", "带子；捆扎"]],
  [["radiant", "容光焕发的"], ["gradient", "梯度；坡度"], ["ingredient", "成分；要素"]],
  [["exhibit", "展示；展品"], ["inhibit", "抑制；阻止"], ["prohibit", "禁止"]],
  [["surgeon", "外科医生"], ["sergeant", "中士；警官"], ["surgery", "外科手术"]],
  [["inspire", "鼓舞；激发"], ["aspire", "渴望；立志"], ["expire", "到期；失效"], ["conspire", "密谋"]],
  [["entitle", "使享有权利；命名"], ["subtitle", "字幕；副标题"]],
  [["gauge", "估计；测量；仪表"], ["vague", "模糊的；含糊的"], ["plague", "瘟疫；困扰"]],
  [["racket", "球拍；喧闹声"], ["rocket", "火箭；猛增"], ["bracket", "括号；档次"]],
  [["haul", "拖；拉；搬运"], ["halt", "停止；暂停"], ["hall", "大厅；礼堂"]],
  [["pessimistic", "悲观的"], ["optimistic", "乐观的"], ["realistic", "现实的"]],
  [["sanction", "制裁；批准"], ["section", "部分；章节"], ["function", "功能；运转"]],
  [["fatigue", "疲劳；疲惫"], ["intrigue", "激起兴趣；阴谋"], ["plague", "困扰；瘟疫"]],
  [["opaque", "不透明的；难懂的"], ["unique", "独特的"], ["antique", "古董；古老的"]],
  [["erect", "建立；竖起；直立的"], ["elect", "选举；推选"], ["direct", "直接的；指导"]],
  [["grin", "咧嘴笑"], ["grip", "紧握；掌控"], ["grim", "严峻的；冷酷的"]],
  [["sequence", "顺序；序列"], ["consequence", "后果；结果"], ["frequency", "频率"]],
  [["medieval", "中世纪的"], ["remedial", "补救的；治疗的"], ["immediate", "立即的"]],
  [["napkin", "餐巾；餐巾纸"], ["kin", "亲属；家属"]],
  [["dignity", "尊严"], ["dehumanizing", "缺乏人性化的"]],
];

// Build fast lookup map: lowercase word -> list of confusable peers
const curatedMap = new Map<string, ConfusableItem[]>();
for (const group of confusableGroups) {
  for (const [word] of group) {
    const key = word.toLowerCase();
    const list = curatedMap.get(key) ?? [];
    for (const [peer, meaning] of group) {
      if (peer.toLowerCase() === key) continue;
      if (!list.some(item => item.term.toLowerCase() === peer.toLowerCase())) {
        list.push({ term: peer, meaning, source: "cet6" });
      }
    }
    curatedMap.set(key, list);
  }
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 4) return 99;
  const prev = new Uint16Array(n + 1);
  const curr = new Uint16Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    prev.set(curr);
  }
  return prev[n];
}

function commonPrefixLen(a: string, b: string): number {
  const lim = Math.min(a.length, b.length);
  let i = 0;
  while (i < lim && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLen(a: string, b: string): number {
  const lim = Math.min(a.length, b.length);
  let i = 0;
  while (i < lim && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

function shortMeaning(raw: string): string {
  const firstLine = raw.split(/\r?\n/)[0] || raw;
  return firstLine.length > 22 ? firstLine.slice(0, 21) + "…" : firstLine;
}

/**
 * Finds 2–4 visually similar / easily confused CET-6 words for a card.
 * Combines curated CET-6 confusable families with live similarity matching across the user's vocabulary library.
 */
export function findLookAlikes(card: Card, allCards: Card[], limit = 4): ConfusableItem[] {
  if (card.category === "关键句" || card.category === "同义改写") return [];

  const primaryRaw = card.term.split("/")[0].trim().toLowerCase();
  const stopWords = new Set(["be", "to", "of", "in", "on", "at", "from", "by", "for", "more", "do", "sb.", "sth.", "one’s", "one's", "make", "take", "put", "go", "turn", "out", "down", "away", "big", "task", "hand"]);
  const words = primaryRaw
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s-]+/)
    .filter(w => w.length >= 3 && !stopWords.has(w));
  const lookupTargets = primaryRaw.includes(" ") ? words.slice(0, 2) : [primaryRaw];

  const results: ConfusableItem[] = [];
  const seen = new Set<string>([primaryRaw]);

  // 1) Curated high-value CET-6 confusable families first
  for (const target of lookupTargets) {
    const curated = curatedMap.get(target);
    if (!curated) continue;
    for (const peer of curated) {
      const k = peer.term.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      results.push(peer);
      if (results.length >= limit) return results;
    }
  }

  // 2) Algorithmic visual look-alike discovery from user's own vocabulary library
  const anchor = lookupTargets[0];
  if (!anchor || anchor.length < 3) return results;

  const scored: { item: ConfusableItem; score: number }[] = [];
  for (const other of allCards) {
    if (other.entry.id === card.entry.id) continue;
    if (other.category !== "单词") continue;
    const cand = other.term.split("/")[0].trim().toLowerCase();
    if (!/^[a-z]{3,22}$/.test(cand) || seen.has(cand)) continue;
    const dist = levenshtein(anchor, cand);
    const maxLen = Math.max(anchor.length, cand.length);
    const sim = 1 - dist / maxLen;
    const pre = commonPrefixLen(anchor, cand);
    const suf = commonSuffixLen(anchor, cand);
    const score = sim + (pre >= 3 ? 0.16 : pre === 2 ? 0.06 : 0) + (suf >= 3 ? 0.12 : 0);
    if (score >= 0.56 && dist <= 4) {
      seen.add(cand);
      scored.push({
        score,
        item: { term: other.term.split("/")[0].trim(), meaning: shortMeaning(other.meaning), source: "library" },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  for (const entry of scored) {
    results.push(entry.item);
    if (results.length >= limit) break;
  }

  return results;
}
