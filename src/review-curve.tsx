"use client";

import { useId, useMemo, useState, type PointerEvent } from "react";
import { AlertTriangle, Brain, CalendarDays, Check, Flame, RotateCcw, Search, ShieldCheck, Sparkles, TrendingUp, Volume2, X } from "lucide-react";
import { dateKey, nextDate, type Entry } from "./data";
import { daysBetween, exampleRetention, reviewIntervals } from "./review-schedule";
import { eligible, type Card, type Mode } from "./vocabulary";

type Props = {
  cards: Card[];
  selectedId: string;
  onSelect: (id: string) => void;
  onSpeak: (card: Card) => void;
  onRate: (entry: Entry, passed: boolean) => Promise<boolean>;
  onStartRescue: (rescueCards: Card[], mode: Mode) => void;
  busy: boolean;
  daysUntilExam: number;
};

type RadarTab = "risk" | "learned" | "fresh" | "all";

type CardMetric = {
  card: Card;
  reviewed: boolean;
  stage: number;
  interval: number;
  elapsed: number;
  retention: number | null; // 0-100, null if never reviewed
  dueNow: boolean;
  atRisk: boolean;
  solid: boolean;
};

function shortMonthDay(iso: string) {
  const parts = iso.split("-");
  return parts.length === 3 ? `${Number(parts[1])}.${parts[2]}` : iso;
}

// Multi-stage sawtooth reinforcement curve over 15 days (reviews at day 1, 3, 7, 14)
const overviewMilestones = [
  { day: 0, interval: 1, stage: 0, label: "初次学习" },
  { day: 1, interval: 2, stage: 1, label: "第 1 次巩固 (1天)" },
  { day: 3, interval: 4, stage: 2, label: "第 2 次巩固 (2天)" },
  { day: 7, interval: 7, stage: 3, label: "第 3 次巩固 (4天)" },
  { day: 14, interval: 15, stage: 4, label: "第 4 次巩固 (7天)" },
] as const;

function reinforcedRetentionAt(day: number) {
  let active: (typeof overviewMilestones)[number] = overviewMilestones[0];
  for (const m of overviewMilestones) {
    if (day >= m.day) active = m;
  }
  const elapsed = Math.max(0, day - active.day);
  return exampleRetention(elapsed, active.interval);
}

export function ReviewCurve({
  cards,
  selectedId,
  onSelect,
  onSpeak,
  onRate,
  onStartRescue,
  busy,
  daysUntilExam,
}: Props) {
  const chartId = useId();
  const today = dateKey();
  const [radarTab, setRadarTab] = useState<RadarTab>("risk");
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [showLimit, setShowLimit] = useState(24);
  const [hoverDay, setHoverDay] = useState<number | null>(null);
  const [actionToast, setActionToast] = useState("");

  const metrics = useMemo<CardMetric[]>(() => {
    return cards.map(card => {
      const entry = card.entry;
      const reviewed = Boolean(entry.reviewed);
      const stage = entry.stage ?? 0;
      const scheduled = reviewed && entry.due ? Math.max(1, daysBetween(entry.reviewed, entry.due)) : (reviewIntervals[stage] ?? 1);
      const elapsed = reviewed ? Math.max(0, daysBetween(entry.reviewed, today)) : 0;
      const retention = reviewed ? Math.round(exampleRetention(elapsed, scheduled) * 100) : null;
      const dueNow = !entry.due || entry.due <= today;
      const atRisk = reviewed && (dueNow || (retention !== null && retention <= 65));
      const solid = reviewed && stage >= 3 && (retention ?? 0) > 65;
      return { card, reviewed, stage, interval: scheduled, elapsed, retention, dueNow, atRisk, solid };
    });
  }, [cards, today]);

  const learnedMetrics = useMemo(() => metrics.filter(m => m.reviewed), [metrics]);
  const atRiskMetrics = useMemo(
    () => metrics.filter(m => m.atRisk).sort((a, b) => (a.retention ?? 100) - (b.retention ?? 100)),
    [metrics],
  );
  const solidMetrics = useMemo(() => metrics.filter(m => m.solid), [metrics]);
  const avgRetention = useMemo(() => {
    if (!learnedMetrics.length) return null;
    const sum = learnedMetrics.reduce((acc, item) => acc + (item.retention ?? 0), 0);
    return Math.round(sum / learnedMetrics.length);
  }, [learnedMetrics]);

  // 7-stage distribution (S0..S6) for learned items
  const stageCounts = useMemo(() => {
    const counts = reviewIntervals.map(() => 0);
    for (const item of learnedMetrics) {
      const idx = Math.min(Math.max(0, item.stage), counts.length - 1);
      counts[idx]++;
    }
    return counts;
  }, [learnedMetrics]);
  const maxStageCount = Math.max(1, ...stageCounts);

  // Next 7 days due workload forecast
  const forecast = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 7 }, (_, offset) => {
      const iso = nextDate(offset, now);
      const label = offset === 0 ? "今日/逾期" : offset === 1 ? "明天" : `+${offset}天`;
      return { offset, iso, label, shortDate: shortMonthDay(iso), count: 0 };
    });
    for (const item of learnedMetrics) {
      const due = item.card.entry.due;
      if (!due || due <= today) {
        buckets[0].count++;
      } else {
        const diff = daysBetween(today, due);
        if (diff >= 1 && diff < 7) buckets[diff].count++;
      }
    }
    return buckets;
  }, [learnedMetrics, today]);

  const peakForecast = useMemo(
    () => forecast.reduce((best, cur) => (cur.count > best.count ? cur : best), forecast[0]),
    [forecast],
  );
  const maxForecastCount = Math.max(1, ...forecast.map(b => b.count));

  // Selected card metric
  const selectedMetric = useMemo(
    () => metrics.find(m => m.card.entry.id === selectedId),
    [metrics, selectedId],
  );

  // Rescue candidates (prioritize atRisk learned cards, fallback to unlearned cards if none learned yet)
  const rescuePool = useMemo(() => {
    const urgent = atRiskMetrics.map(m => m.card).filter(c => eligible(c, "recognize"));
    if (urgent.length) return urgent;
    return metrics
      .filter(m => m.dueNow)
      .map(m => m.card)
      .filter(c => eligible(c, "recognize"))
      .slice(0, 25);
  }, [atRiskMetrics, metrics]);

  // Radar right-column filtered items
  const radarItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics
      .filter(item => {
        if (stageFilter !== null && (!item.reviewed || item.stage !== stageFilter)) return false;
        if (radarTab === "risk" && !item.atRisk) return false;
        if (radarTab === "learned" && !item.reviewed) return false;
        if (radarTab === "fresh" && item.reviewed) return false;
        if (!q) return true;
        return (item.card.term + " " + item.card.meaning).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.reviewed !== b.reviewed) return Number(b.reviewed) - Number(a.reviewed);
        return (a.retention ?? 101) - (b.retention ?? 101);
      });
  }, [metrics, radarTab, stageFilter, search]);

  async function quickReview(card: Card, passed: boolean) {
    setActionToast("");
    const ok = await onRate(card.entry, passed);
    if (ok) {
      const nextStage = passed ? Math.min(card.entry.reviewed ? card.entry.stage + 1 : 0, reviewIntervals.length - 1) : 0;
      const nextDays = reviewIntervals[nextStage];
      setActionToast(
        passed
          ? `已巩固「${card.term}」，记忆周期跃升至 ${nextDays} 天 (S${nextStage})！`
          : `已标记「${card.term}」为还不熟，明日安排重新强化。`,
      );
    }
  }

  // Chart geometry
  const width = 660, height = 252, left = 48, right = 636, top = 22, bottom = 200;
  const xOf = (day: number, horizon: number) => left + ((right - left) * Math.min(Math.max(0, day), horizon)) / horizon;
  const yOf = (frac: number) => bottom - (bottom - top) * Math.min(Math.max(0, frac), 1);

  const handleSvgPointer = (horizon: number) => (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratioX = ((event.clientX - rect.left) / rect.width) * width;
    const clamped = Math.min(Math.max(ratioX, left), right);
    const day = ((clamped - left) / (right - left)) * horizon;
    setHoverDay(day);
  };

  // Single-card mode calculations
  const singleInterval = selectedMetric?.interval ?? 1;
  const singleElapsed = selectedMetric?.elapsed ?? 0;
  const singleNextStage = selectedMetric
    ? Math.min(selectedMetric.reviewed ? selectedMetric.stage + 1 : 0, reviewIntervals.length - 1)
    : 1;
  const singleNextInterval = reviewIntervals[singleNextStage] ?? 2;
  const singleHorizon = selectedMetric ? Math.max(4, singleInterval * 2, singleElapsed + 2, singleNextInterval) : 15;

  // Build SVG paths
  const overviewHorizon = 15;
  const overviewNaturalPath = useMemo(() => {
    return Array.from({ length: 76 }, (_, i) => {
      const d = (overviewHorizon * i) / 75;
      return `${i === 0 ? "M" : "L"}${xOf(d, overviewHorizon).toFixed(1)},${yOf(exampleRetention(d, 1)).toFixed(1)}`;
    }).join(" ");
  }, []);

  const overviewReinforcedPath = useMemo(() => {
    const pts: string[] = [];
    for (let seg = 0; seg < overviewMilestones.length; seg++) {
      const start = overviewMilestones[seg].day;
      const end = seg < overviewMilestones.length - 1 ? overviewMilestones[seg + 1].day : overviewHorizon;
      const iv = overviewMilestones[seg].interval;
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const d = start + ((end - start) * i) / steps;
        const val = exampleRetention(d - start, iv);
        const cmd = seg === 0 && i === 0 ? "M" : "L";
        pts.push(`${cmd}${xOf(d, overviewHorizon).toFixed(1)},${yOf(val).toFixed(1)}`);
      }
      if (seg < overviewMilestones.length - 1) {
        // Vertical boost line on review day
        pts.push(`L${xOf(end, overviewHorizon).toFixed(1)},${yOf(1).toFixed(1)}`);
      }
    }
    return pts.join(" ");
  }, []);

  const singleCurvePath = useMemo(() => {
    if (!selectedMetric) return "";
    return Array.from({ length: 65 }, (_, i) => {
      const d = (singleHorizon * i) / 64;
      return `${i === 0 ? "M" : "L"}${xOf(d, singleHorizon).toFixed(1)},${yOf(exampleRetention(d, singleInterval)).toFixed(1)}`;
    }).join(" ");
  }, [selectedMetric, singleHorizon, singleInterval]);

  const singleBoostPath = useMemo(() => {
    if (!selectedMetric) return "";
    const startDay = selectedMetric.reviewed ? singleElapsed : 0;
    const span = Math.max(1, singleHorizon - startDay);
    return Array.from({ length: 41 }, (_, i) => {
      const d = startDay + (span * i) / 40;
      const frac = exampleRetention(d - startDay, singleNextInterval);
      return `${i === 0 ? "M" : "L"}${xOf(d, singleHorizon).toFixed(1)},${yOf(frac).toFixed(1)}`;
    }).join(" ");
  }, [selectedMetric, singleElapsed, singleHorizon, singleNextInterval]);

  const activeHorizon = selectedMetric ? singleHorizon : overviewHorizon;
  const hoverDisplayDay = hoverDay !== null ? Number(hoverDay.toFixed(1)) : null;

  return (
    <div className="rc-shell">
      {/* 4 Live Memory Health KPI Cards */}
      <dl className="rc-kpis">
        <div className="v-panel rc-kpi">
          <span className="metric-icon purple"><Brain size={20}/></span>
          <dd>{avgRetention !== null ? `${avgRetention}%` : "待首练"}</dd>
          <dt>平均记忆保持率 · 已学 {learnedMetrics.length} 条</dt>
        </div>
        <div className={"v-panel rc-kpi " + (atRiskMetrics.length > 0 ? "alert" : "")}>
          <span className="metric-icon orange"><AlertTriangle size={20}/></span>
          <dd>{atRiskMetrics.length}</dd>
          <dt>临界遗忘（≤65% 或已到期）</dt>
        </div>
        <div className="v-panel rc-kpi">
          <span className="metric-icon mint"><ShieldCheck size={20}/></span>
          <dd>{solidMetrics.length}</dd>
          <dt>长时稳固记忆（S3–S6 阶段）</dt>
        </div>
        <div className="v-panel rc-kpi">
          <span className="metric-icon blue"><CalendarDays size={20}/></span>
          <dd>{peakForecast.count > 0 ? `${peakForecast.count} 条` : `${Math.max(1, Math.ceil(cards.length / Math.max(1, daysUntilExam)))} 条/天`}</dd>
          <dt>{peakForecast.count > 0 ? `未来 7 天峰值（${peakForecast.label}）` : "考前每日稳步推荐量"}</dt>
        </div>
      </dl>

      <div className="rc-bento">
        {/* Left Column: Interactive Curve + 7-Day Workload Forecast */}
        <div className="rc-main-col">
          <section className="v-panel rc-chart-card">
            <div className="rc-card-head">
              <div className="rc-head-title">
                <div className="rc-mode-switch" role="tablist" aria-label="曲线视图模式">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!selectedMetric}
                    className={"rc-switch-btn " + (!selectedMetric ? "active" : "")}
                    onClick={() => { onSelect(""); setHoverDay(null); setActionToast(""); }}
                  >
                    <TrendingUp size={14}/>整库巩固态势
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={Boolean(selectedMetric)}
                    className={"rc-switch-btn " + (selectedMetric ? "active" : "")}
                    onClick={() => {
                      const target = selectedMetric?.card ?? atRiskMetrics[0]?.card ?? learnedMetrics[0]?.card ?? cards[0];
                      if (target) onSelect(target.entry.id);
                      setHoverDay(null);
                    }}
                  >
                    <Sparkles size={14}/>单条词句追踪
                  </button>
                </div>
                {selectedMetric && (
                  <button type="button" className="rc-clear-btn" onClick={() => { onSelect(""); setActionToast(""); }}>
                    <X size={13}/>返回整库视图
                  </button>
                )}
              </div>

              <div className="rc-legend">
                {!selectedMetric ? (
                  <>
                    <span><i className="leg-dot reinforced"/>按间隔巩固曲线</span>
                    <span><i className="leg-dot natural"/>不复习自然遗忘</span>
                  </>
                ) : (
                  <>
                    <span><i className="leg-dot reinforced"/>当前周期 ({singleInterval} 天)</span>
                    <span><i className="leg-dot boost"/>今日巩固后预测 ({singleNextInterval} 天)</span>
                  </>
                )}
              </div>
            </div>

            {/* Single-card Spotlight Header & In-place Review Actions */}
            {selectedMetric && (
              <div className="rc-spotlight" key={selectedMetric.card.entry.id}>
                <div className="rc-spot-info">
                  <div className="rc-spot-word">
                    <strong>{selectedMetric.card.term}</strong>
                    {selectedMetric.card.pronunciation && <span className="rc-spot-ipa">{selectedMetric.card.pronunciation}</span>}
                  </div>
                  <p className="rc-spot-meaning">{selectedMetric.card.meaning.replace(/\n+/g, " · ")}</p>
                  <div className="rc-spot-tags">
                    <span className="v-tag">S{selectedMetric.stage} · {selectedMetric.interval} 天周期</span>
                    <span className="v-tag sky">{selectedMetric.card.source}</span>
                    <span className={"v-tag " + (selectedMetric.retention === null ? "peach" : selectedMetric.retention <= 65 ? "rose" : "mint")}>
                      {selectedMetric.retention !== null ? `当前保持率 ${selectedMetric.retention}%` : "尚未首次练习"}
                    </span>
                    {selectedMetric.card.entry.due && <span className="v-muted">下次复习 {selectedMetric.card.entry.due}</span>}
                  </div>
                </div>
                <div className="rc-spot-actions">
                  <button type="button" className="v-secondary rc-mini-btn" onClick={() => onSpeak(selectedMetric.card)}>
                    <Volume2 size={15}/>朗读
                  </button>
                  <button type="button" className="v-primary rc-mini-btn" disabled={busy} onClick={() => void quickReview(selectedMetric.card, true)}>
                    <Check size={15}/>记住了
                  </button>
                  <button type="button" className="v-secondary rc-mini-btn" disabled={busy} onClick={() => void quickReview(selectedMetric.card, false)}>
                    <RotateCcw size={14}/>还不熟
                  </button>
                </div>
              </div>
            )}

            {actionToast && <p className="v-notice rc-toast" role="status">{actionToast}</p>}

            {/* Live Hover Readout Strip */}
            <div className="rc-probe-bar">
              {hoverDisplayDay !== null ? (
                !selectedMetric ? (
                  <>
                    <span className="rc-probe-day">第 {hoverDisplayDay} 天</span>
                    <span>不复习仅剩 <b>{Math.round(exampleRetention(hoverDisplayDay, 1) * 100)}%</b></span>
                    <span>·</span>
                    <span>按节律巩固可保持 <b className="mint">{Math.round(reinforcedRetentionAt(hoverDisplayDay) * 100)}%</b></span>
                  </>
                ) : (
                  <>
                    <span className="rc-probe-day">距上次复习 {hoverDisplayDay} 天</span>
                    <span>当前曲线保持 <b>{Math.round(exampleRetention(hoverDisplayDay, singleInterval) * 100)}%</b></span>
                    {hoverDisplayDay >= (selectedMetric.reviewed ? singleElapsed : 0) && (
                      <>
                        <span>·</span>
                        <span>今日巩固后可达 <b className="mint">{Math.round(exampleRetention(hoverDisplayDay - (selectedMetric.reviewed ? singleElapsed : 0), singleNextInterval) * 100)}%</b></span>
                      </>
                    )}
                  </>
                )
              ) : (
                <span className="v-muted">
                  {selectedMetric
                    ? "移动鼠标到曲线上可对比「当前遗忘速度」与「今日打卡后的跃升预测」；直接点上方「记住了」即可原地拉升曲线。"
                    : "移动鼠标到曲线上查看任意天数的记忆保留率对比；点击下方阶段柱或右侧词条，可追踪单个词的遗忘曲线。"}
                </span>
              )}
            </div>

            {/* Interactive Animated SVG Chart */}
            <div className="v-curve rc-svg-wrap">
              <svg
                key={selectedMetric ? selectedMetric.card.entry.id + "-" + selectedMetric.card.entry.version : "overview"}
                viewBox={`0 0 ${width} ${height}`}
                role="img"
                aria-labelledby={chartId}
                onPointerMove={handleSvgPointer(activeHorizon)}
                onPointerLeave={() => setHoverDay(null)}
              >
                <title id={chartId}>
                  {selectedMetric ? `${selectedMetric.card.term} 的记忆保持度曲线` : "六级词库艾宾浩斯多轮巩固记忆曲线"}
                </title>
                <defs>
                  <linearGradient id={chartId + "-area"} x1="0" y1="0" x2="0" y2="1">
                    <stop stopColor="#8b5cf6" stopOpacity=".28"/>
                    <stop offset="1" stopColor="#ddd6fe" stopOpacity=".02"/>
                  </linearGradient>
                  <linearGradient id={chartId + "-stroke"} x1="0" y1="0" x2="1" y2="0">
                    <stop stopColor="#8b5cf6"/>
                    <stop offset=".6" stopColor="#6d4aff"/>
                    <stop offset="1" stopColor="#20a472"/>
                  </linearGradient>
                  <linearGradient id={chartId + "-boost"} x1="0" y1="0" x2="1" y2="0">
                    <stop stopColor="#20a472"/>
                    <stop offset="1" stopColor="#34d399"/>
                  </linearGradient>
                </defs>

                {/* Horizontal Grid & Threshold */}
                {[1, 0.6, 0.2, 0].map(f => (
                  <g key={f}>
                    <line
                      x1={left}
                      x2={right}
                      y1={yOf(f)}
                      y2={yOf(f)}
                      stroke={f === 0.6 ? "#f3b389" : "#e5e0f6"}
                      strokeDasharray={f === 0.6 ? "5 5" : f === 0.2 ? "2 4" : undefined}
                      strokeWidth={f === 0.6 ? 1.4 : 1}
                    />
                    <text x={left - 8} y={yOf(f) + 4} textAnchor="end">{Math.round(f * 100)}%</text>
                  </g>
                ))}
                <text x={right - 4} y={yOf(0.6) - 6} textAnchor="end" className="rc-threshold-label">
                  60% 临界复习线
                </text>

                {!selectedMetric ? (
                  <>
                    {/* Natural decay without review */}
                    <path
                      fill="none"
                      stroke="#f28482"
                      strokeWidth="2.2"
                      strokeDasharray="6 5"
                      opacity="0.82"
                      d={overviewNaturalPath}
                    />
                    {/* Multi-review sawtooth area & animated stroke */}
                    <path
                      fill={`url(#${chartId}-area)`}
                      d={`${overviewReinforcedPath} L ${right},${bottom} L ${left},${bottom} Z`}
                    />
                    <path
                      className="v-curve-line rc-draw-line"
                      fill="none"
                      stroke={`url(#${chartId}-stroke)`}
                      strokeWidth="3.4"
                      d={overviewReinforcedPath}
                    />
                    {/* Milestone nodes */}
                    {overviewMilestones.slice(1).map(m => (
                      <g key={m.day}>
                        <line x1={xOf(m.day, overviewHorizon)} x2={xOf(m.day, overviewHorizon)} y1={yOf(1)} y2={bottom} stroke="rgba(124,93,250,0.18)" strokeDasharray="3 4"/>
                        <circle cx={xOf(m.day, overviewHorizon)} cy={yOf(1)} r="5.5" fill="#7c5dfa" stroke="#ffffff" strokeWidth="2"/>
                        <circle cx={xOf(m.day, overviewHorizon)} cy={yOf(0.6)} r="4" fill="#ea7535" stroke="#ffffff" strokeWidth="1.5"/>
                      </g>
                    ))}
                    {/* X-axis ticks */}
                    {[0, 1, 3, 7, 14].map(d => (
                      <text key={d} x={xOf(d, overviewHorizon)} y={bottom + 20} textAnchor={d === 0 ? "start" : d === 14 ? "end" : "middle"}>
                        第 {d} 天
                      </text>
                    ))}
                  </>
                ) : (
                  <>
                    {/* Current card decay area & animated stroke */}
                    <path
                      fill={`url(#${chartId}-area)`}
                      d={`${singleCurvePath} L ${right},${bottom} L ${left},${bottom} Z`}
                    />
                    <path
                      className="v-curve-line rc-draw-line"
                      fill="none"
                      stroke={`url(#${chartId}-stroke)`}
                      strokeWidth="3.5"
                      d={singleCurvePath}
                    />
                    {/* Predicted boost curve if reviewed today */}
                    <path
                      className="v-curve-line"
                      fill="none"
                      stroke={`url(#${chartId}-boost)`}
                      strokeWidth="2.6"
                      strokeDasharray="6 5"
                      d={singleBoostPath}
                    />
                    {/* Planned review point */}
                    <line x1={xOf(singleInterval, singleHorizon)} x2={xOf(singleInterval, singleHorizon)} y1={yOf(0.6)} y2={bottom} stroke="#7c5dfa" strokeDasharray="3 4"/>
                    <circle cx={xOf(singleInterval, singleHorizon)} cy={yOf(0.6)} r="6" fill="#7c5dfa" stroke="#ffffff" strokeWidth="2"/>

                    {/* Current position pulsing radar dot */}
                    {selectedMetric.reviewed && (
                      <g>
                        <circle
                          className="rc-radar-ping"
                          cx={xOf(singleElapsed, singleHorizon)}
                          cy={yOf(exampleRetention(singleElapsed, singleInterval))}
                          r="12"
                          fill={selectedMetric.atRisk ? "rgba(234,117,53,0.28)" : "rgba(32,164,114,0.26)"}
                        />
                        <circle
                          cx={xOf(singleElapsed, singleHorizon)}
                          cy={yOf(exampleRetention(singleElapsed, singleInterval))}
                          r="6.5"
                          fill={selectedMetric.atRisk ? "#ea7535" : "#189c68"}
                          stroke="#ffffff"
                          strokeWidth="2.4"
                        />
                      </g>
                    )}

                    {/* X-axis ticks */}
                    {[...new Set([0, singleInterval, singleHorizon])].map(d => (
                      <text key={d} x={xOf(d, singleHorizon)} y={bottom + 20} textAnchor={d === 0 ? "start" : d === singleHorizon ? "end" : "middle"}>
                        {d} 天
                      </text>
                    ))}
                  </>
                )}

                {/* Interactive hover vertical crosshair */}
                {hoverDay !== null && (
                  <g className="rc-crosshair">
                    <line
                      x1={xOf(hoverDay, activeHorizon)}
                      x2={xOf(hoverDay, activeHorizon)}
                      y1={top}
                      y2={bottom}
                      stroke="#7c5dfa"
                      strokeWidth="1.5"
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={xOf(hoverDay, activeHorizon)}
                      cy={yOf(selectedMetric ? exampleRetention(hoverDay, singleInterval) : reinforcedRetentionAt(hoverDay))}
                      r="5"
                      fill="#ffffff"
                      stroke="#6d4aff"
                      strokeWidth="2.6"
                    />
                  </g>
                )}

                <text x={left} y={height - 4}>横轴：距上次复习天数</text>
                <text x={right} y={height - 4} textAnchor="end">纵轴：记忆保持度模型</text>
              </svg>
            </div>

            {/* 7-Stage Memory Pyramid (Interactive filter) */}
            <div className="rc-stages-wrap">
              <div className="rc-stages-head">
                <strong>7 阶艾宾浩斯记忆金字塔（S0–S6）</strong>
                <span className="v-muted">
                  {stageFilter !== null ? `已筛选 S${stageFilter} 阶段 · 点击取消` : "点击任意阶段可筛选右侧词条"}
                </span>
              </div>
              <div className="rc-stages">
                {reviewIntervals.map((days, stageIdx) => {
                  const count = stageCounts[stageIdx];
                  const active = stageFilter === stageIdx;
                  const heightPct = count ? Math.max(18, Math.round((count / maxStageCount) * 100)) : 8;
                  return (
                    <button
                      key={days}
                      type="button"
                      className={"rc-stage-cell " + (active ? "active" : "")}
                      onClick={() => {
                        setStageFilter(prev => (prev === stageIdx ? null : stageIdx));
                        if (stageFilter !== stageIdx) setRadarTab("learned");
                      }}
                    >
                      <span className="rc-stage-count">{count}</span>
                      <span className="rc-stage-bar-track">
                        <i className="rc-stage-bar-fill" style={{ height: `${heightPct}%` }}/>
                      </span>
                      <strong>S{stageIdx}</strong>
                      <small>{days} 天</small>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Single-card review log if present */}
            {selectedMetric?.card.entry.reviewLog?.length ? (
              <ul className="v-review-log" aria-label="本词最近复习记录">
                {selectedMetric.card.entry.reviewLog.slice(-5).reverse().map((attempt, index) => (
                  <li key={attempt.at + index}>
                    <time dateTime={attempt.at}>{dateKey(new Date(attempt.at))}</time>
                    <strong className={"v-tag " + (attempt.passed ? "mint" : "peach")}>{attempt.passed ? "答对" : "待巩固"}</strong>
                    <span>阶段 S{attempt.stage} · 下次 {attempt.due}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* 7-Day Review Workload Forecast */}
          <section className="v-panel rc-forecast-card">
            <div className="rc-forecast-head">
              <div>
                <h2>未来 7 天复习负荷预报</h2>
                <p className="v-muted">
                  {learnedMetrics.length
                    ? "提前看见哪天会迎来复习高峰，把超载词条提前消化。"
                    : "完成首批单词练习后，这里会自动排布你未来 7 天的到期复习节奏。"}
                </p>
              </div>
              {rescuePool.length > 0 && (
                <button
                  type="button"
                  className="v-primary rc-mini-btn"
                  onClick={() => onStartRescue(rescuePool, "recognize")}
                >
                  <Flame size={15}/>立即抢救 · {rescuePool.length} 条
                </button>
              )}
            </div>

            <div className="rc-forecast-bars">
              {forecast.map((bucket, idx) => {
                const pct = bucket.count ? Math.max(16, Math.round((bucket.count / maxForecastCount) * 100)) : 8;
                const isHeavy = bucket.offset === 0 && bucket.count > 0;
                return (
                  <div className="rc-day-col" key={bucket.iso} style={{ animationDelay: `${idx * 45}ms` }}>
                    <span className="rc-day-num">{bucket.count}</span>
                    <div className="rc-day-track">
                      <div
                        className={"rc-day-fill " + (isHeavy ? "urgent" : bucket.count > 0 ? "normal" : "empty")}
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <strong>{bucket.label}</strong>
                    <small>{bucket.shortDate}</small>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Forgetting Rescue Radar Queue */}
        <aside className="v-panel rc-radar-card">
          <div className="rc-radar-head">
            <div>
              <h2>遗忘抢救雷达</h2>
              <p className="v-muted">点击任意词条追踪专属曲线</p>
            </div>
            {stageFilter !== null && (
              <button type="button" className="rc-clear-btn" onClick={() => setStageFilter(null)}>
                S{stageFilter} <X size={12}/>
              </button>
            )}
          </div>

          <label className="v-search rc-radar-search">
            <Search size={15}/>
            <input
              aria-label="在遗忘雷达中搜索词条"
              placeholder="搜英文或中文释义"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowLimit(24); }}
            />
          </label>

          <div className="rc-radar-tabs" role="tablist" aria-label="遗忘状态筛选">
            {[
              { id: "risk" as const, label: "临界抢救", count: atRiskMetrics.length },
              { id: "learned" as const, label: "已学追踪", count: learnedMetrics.length },
              { id: "fresh" as const, label: "待首练", count: cards.length - learnedMetrics.length },
              { id: "all" as const, label: "全部", count: cards.length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={radarTab === tab.id}
                className={"rc-radar-tab " + (radarTab === tab.id ? "active" : "")}
                onClick={() => { setRadarTab(tab.id); setStageFilter(null); setShowLimit(24); }}
              >
                <span>{tab.label}</span>
                <i>{tab.count}</i>
              </button>
            ))}
          </div>

          <div className="rc-radar-list">
            {radarItems.slice(0, showLimit).map(item => {
              const isSelected = selectedMetric?.card.entry.id === item.card.entry.id;
              const pct = item.retention;
              const tone = pct === null ? "fresh" : pct <= 65 ? "danger" : pct < 82 ? "warn" : "safe";
              return (
                <div
                  key={item.card.entry.id}
                  className={"rc-radar-item " + (isSelected ? "selected" : "")}
                >
                  <button
                    type="button"
                    className="rc-radar-item-main"
                    onClick={() => { onSelect(item.card.entry.id); setActionToast(""); }}
                  >
                    <div className="rc-radar-row-top">
                      <strong>{item.card.term}</strong>
                      <span className={"rc-ret-pill " + tone}>
                        {pct !== null ? `${pct}%` : "待练"}
                      </span>
                    </div>
                    <p className="rc-radar-row-sub">{item.card.meaning.replace(/\n+/g, " · ")}</p>
                    <div className="rc-radar-row-bar">
                      <span className="rc-mini-track">
                        <i className={"rc-mini-fill " + tone} style={{ width: `${pct ?? 12}%` }}/>
                      </span>
                      <small>{item.reviewed ? `S${item.stage} · ${item.card.source}` : item.card.source}</small>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="rc-radar-speak"
                    aria-label={`朗读 ${item.card.term}`}
                    title="朗读发音"
                    onClick={() => onSpeak(item.card)}
                  >
                    <Volume2 size={14}/>
                  </button>
                </div>
              );
            })}

            {!radarItems.length && (
              <div className="rc-radar-empty">
                <p>
                  {radarTab === "risk"
                    ? "目前没有临界遗忘的词条，记忆状态很稳！可以切到「待首练」或「已学追踪」查看。"
                    : "没有找到匹配的词条。"}
                </p>
              </div>
            )}

            {radarItems.length > showLimit && (
              <button type="button" className="v-secondary rc-load-more" onClick={() => setShowLimit(n => n + 24)}>
                展开更多（剩余 {radarItems.length - showLimit} 条）
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
