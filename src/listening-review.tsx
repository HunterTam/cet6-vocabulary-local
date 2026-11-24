import { useEffect, useState } from "react";
import { Check, ChevronRight, Search, Volume2 } from "lucide-react";
import { dateKey, searchable, type Entry } from "./data";
import { listeningCategories } from "./listening-data";

type Props = {
  entries: Entry[];
  busy: boolean;
  rate: (entry: Entry, passed: boolean) => Promise<boolean>;
};

export function ListeningReview({ entries, busy, rate }: Props) {
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const today = dateKey();
  const isDue = (entry: Entry) => !entry.due || entry.due <= today;
  const listening = entries.filter(entry => entry.kind === "listening");
  const visible = listening.filter(entry =>
    (!category || entry.fields.category === category) &&
    (!dueOnly || isDue(entry)) &&
    searchable(entry.fields).includes(query.trim().toLowerCase())
  );

  function speak(english: string) {
    const synth = window.speechSynthesis;
    if (!synth || typeof SpeechSynthesisUtterance === "undefined") {
      setAudioError("当前浏览器无法播放英文朗读。");
      return;
    }
    setAudioError("");
    const utterance = new SpeechSynthesisUtterance(english);
    utterance.lang = "en-US";
    utterance.rate = 0.9;
    utterance.onerror = ({ error }) => {
      if (error !== "canceled" && error !== "interrupted") setAudioError("当前浏览器无法播放英文朗读。");
    };
    synth.cancel();
    synth.speak(utterance);
  }

  async function save(entry: Entry, passed: boolean) {
    setReviewMessage("");
    if (await rate(entry, passed)) setReviewMessage(`已记录「${entry.fields.title}」的复习结果。`);
  }

  function tagTone(cat?: string, prio?: string) {
    if (prio) return "peach";
    if (cat === "错题") return "rose";
    if (cat === "猜对题") return "peach";
    if (cat === "推断正确") return "mint";
    return "sky";
  }

  return <>
    <div className="v-heading"><div>
      <h1>听力复盘</h1>
      <p className="v-muted">展开卡片核对答案、错因和词块释义，再标记掌握程度。</p>
    </div></div>

    <div className="v-pill-tabs" role="tablist" aria-label="听力分类快捷筛选">
      <button type="button" className={"v-pill-tab " + (category === "" ? "active" : "")} onClick={() => setCategory("")}>
        全部 ({listening.length})
      </button>
      {listeningCategories.map(value => {
        const count = listening.filter(item => item.fields.category === value).length;
        return <button key={value} type="button" className={"v-pill-tab " + (category === value ? "active" : "")} onClick={() => setCategory(value)}>
          {value} ({count})
        </button>;
      })}
    </div>

    <div className="v-filters">
      <label className="v-search"><Search size={18}/>
        <input aria-label="搜索听力记录" placeholder="搜索 S01–S05、题号、关键词或词块" value={query} onChange={event => setQuery(event.target.value)}/>
      </label>
      <select aria-label="听力类型" value={category} onChange={event => setCategory(event.target.value)}>
        <option value="">全部类型</option>
        {listeningCategories.map(value => <option key={value}>{value}</option>)}
      </select>
      <label className="listening-due">
        <input type="checkbox" checked={dueOnly} onChange={event => setDueOnly(event.target.checked)}/>
        只看今日待复习
      </label>
    </div>

    <p className="v-muted">{visible.length} 条记录 · {listening.filter(isDue).length} 条待复习</p>
    {audioError && <p className="v-error" role="alert">{audioError}</p>}
    {reviewMessage && <p className="v-notice" role="status">{reviewMessage}</p>}

    <div className="v-catalog">
      {visible.map(entry => {
        const { title, category: cat, paper, section, prompt, answer, correct, evidence, body, example, audio, origin, tags, priority } = entry.fields;
        const dueNow = isDue(entry);
        return <details key={entry.id} className="v-panel">
          <summary>
            <div className="v-summary-main">
              <strong>{title}</strong>
              <div className="v-summary-meta">
                <span className={"v-tag " + tagTone(cat, priority)}>{priority || cat}</span>
                {dueNow ? <span className="v-tag">待复习</span> : <span className="v-tag mint">下次复习 {entry.due}</span>}
                <span>{[paper, section].filter(Boolean).join(" · ")}</span>
              </div>
            </div>
            <span className="v-chevron-pill" aria-hidden="true"><ChevronRight size={15}/></span>
          </summary>
          <div className="v-card-content">
            {prompt && <p>{prompt}</p>}
            {(answer || correct) && <div className="v-answer-diff">
              {answer && <div className="v-diff-box mine"><small>原作答</small><strong>{answer}</strong></div>}
              {correct && <div className="v-diff-box correct"><small>正确答案</small><strong>{correct}</strong></div>}
            </div>}
            {evidence && <p className="v-example">{evidence}</p>}
            <p>{body}</p>
            {tags && <p className="v-muted">复盘标签 · {tags}</p>}
            {example && <p className="v-example">{example}</p>}
            {origin && <p className="v-muted">{origin}</p>}
            <div className="v-actions">
              {audio && <button type="button" className="v-secondary" onClick={() => speak(audio)}><Volume2 size={17}/>英文朗读</button>}
              <button type="button" className="v-primary" disabled={busy} onClick={() => void save(entry, true)}><Check size={16}/>已掌握</button>
              <button type="button" className="v-secondary" disabled={busy} onClick={() => void save(entry, false)}>还不熟</button>
            </div>
          </div>
        </details>;
      })}
    </div>
    {!visible.length && <p className="v-panel v-empty">没有符合当前筛选条件的听力记录。</p>}
  </>;
}
