"use client";

import { useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { AlertTriangle, ArrowDownWideNarrow, Brain, CalendarDays, Check, Flame, RotateCcw, Search, ShieldCheck, Sparkles, TrendingUp, Volume2, X } from "lucide-react";
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
type ForgettingTier = "critical" | "warning" | "fading" | "solid" | "fresh";
type SortMode = "forgetting" | "error" | "due";

type CardMetric = {
  card: Card;
  reviewed: boolean;
  stage: number;
  interval: number;
  nextInterval: number;
  elapsed: number;
  retention: number | null;     // 0-100, null if never reviewed
  forgettingPct: number | null; // 0-100 (100 - retention), null if never reviewed
  riskScore: number;            // composite forgetting urgency score
  tier: ForgettingTier;
  daysToThreshold: number;      // <0 overdue, 0 today, >0 days remaining to 60% line
  attempts: number;
  passCount: number;
  failCount: number;
  accuracyPct: number | null;
  lastFailed: boolean;
  dueNow: boolean;
  atRisk: boolean;
  solidStage: boolean;
  diagnosis: string;
};

const tierMeta: Record<ForgettingTier, { label: string; short: string; desc: string }> = {
  critical: { label: "重度遗忘", short: "重度", desc: "遗忘 ≥48% 或逾期 ≥2 天" },
  warning:  { label: "临界遗忘", short: "临界", desc: "遗忘 32–47% 或今日到期" },
  fading:   { label: "轻度衰减", short: "轻度", desc: "遗忘 15–31%，正常衰减" },
  solid:    { label: "记忆稳固", short: "稳固", desc: "遗忘 <15%，保持率高" },
  fresh:    { label: "尚未初学", short: "未学", desc: "还未建立首条记忆曲线" },
};

const tierOrder: ForgettingTier[] = ["critical", "warning", "fading", "solid", "fresh"];

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
  const chartRef = useRef<HTMLElement>(null);
  const today = dateKey();
  const [radarTab, setRadarTab] = useState<RadarTab>("risk");
  const [tierFilter, setTierFilter] = useState<ForgettingTier | null>(null);
  const [stageFilter, setStageFilter] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("forgetting");
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
      const nextStage = Math.min(reviewed ? stage + 1 : 0, reviewIntervals.length - 1);
      const nextInterval = reviewIntervals[nextStage] ?? 2;
      const elapsed = reviewed ? Math.max(0, daysBetween(entry.reviewed, today)) : 0;
      const retention = reviewed ? Math.round(exampleRetention(elapsed, scheduled) * 100) : null;
      const forgettingPct = retention !== null ? Math.max(0, 100 - retention) : null;

      const log = entry.reviewLog ?? [];
      const attempts = log.length > 0 ? log.length : (reviewed ? 1 : 0);
      const passCount = log.length > 0 ? log.filter(item => item.passed).length : (reviewed && stage > 0 ? 1 : 0);
      const failCount = log.length > 0 ? log.filter(item => !item.passed).length : (reviewed && stage === 0 ? 1 : 0);
      const accuracyPct = attempts > 0 ? Math.round((passCount / attempts) * 100) : null;
      const lastFailed = log.length > 0 ? !log[log.length - 1].passed : false;

      const daysToThreshold = reviewed && entry.due ? daysBetween(today, entry.due) : 0;
      const dueNow = !entry.due || entry.due <= today;

      let tier: ForgettingTier = "fresh";
      if (reviewed) {
        if ((forgettingPct ?? 0) >= 48 || daysToThreshold <= -2 || (lastFailed && daysToThreshold <= 0)) {
          tier = "critical";
        } else if ((forgettingPct ?? 0) >= 32 || dueNow || lastFailed) {
          tier = "warning";
        } else if ((forgettingPct ?? 0) >= 15) {
          tier = "fading";
        } else {
          tier = "solid";
        }
      }

      const riskScore = reviewed
        ? Math.min(
            100,
            Math.round(
              (forgettingPct ?? 0) +
              (lastFailed ? 14 : 0) +
              Math.min(18, failCount * 6) +
              (daysToThreshold < 0 ? Math.min(15, Math.abs(daysToThreshold) * 3) : 0),
            ),
          )
        : -1;

      const atRisk = tier === "critical" || tier === "warning";
      const solidStage = reviewed && stage >= 3 && (retention ?? 0) > 65;

      let diagnosis = "尚未完成首次记忆，建议加入今日新词组建立第一条艾宾浩斯记忆轨迹。";
      if (tier === "critical") {
        diagnosis = `遗忘程度已达 ${forgettingPct}%（${daysToThreshold < 0 ? `逾期 ${Math.abs(daysToThreshold)} 天` : "已跌破 60% 临界线"}）${failCount ? `，历史曾错 ${failCount} 次` : ""}，建议立刻抢救巩固！`;
      } else if (tier === "warning") {
        diagnosis = `已遗忘 ${forgettingPct}%，正处 60% 黄金抗遗忘窗口${failCount ? `（历史错 ${failCount} 次）` : ""}，今天复习 1 次可将记忆周期拉长至 ${nextInterval} 天。`;
      } else if (tier === "fading") {
        diagnosis = `当前轻度衰减（已遗忘 ${forgettingPct}%），距 60% 临界复习线还有 ${Math.max(1, daysToThreshold)} 天，按计划到期复习即可。`;
      } else if (tier === "solid") {
        diagnosis = `记忆状态非常稳固（仅遗忘 ${forgettingPct}%，保持率 ${retention}%），${accuracyPct !== null ? `历史正确率 ${accuracyPct}%，` : ""}距下次巩固还有 ${Math.max(1, daysToThreshold)} 天。`;
      }

      return {
        card,
        reviewed,
        stage,
        interval: scheduled,
        nextInterval,
        elapsed,
        retention,
        forgettingPct,
        riskScore,
        tier,
        daysToThreshold,
        attempts,
        passCount,
        failCount,
        accuracyPct,
        lastFailed,
        dueNow,
        atRisk,
        solidStage,
        diagnosis,
      };
    });
  }, [cards, today]);

  const learnedMetrics = useMemo(() => metrics.filter(m => m.reviewed), [metrics]);
  const tierCounts = useMemo(() => {
    const counts: Record<ForgettingTier, number> = { critical: 0, warning: 0, fading: 0, solid: 0, fresh: 0 };
    for (const item of metrics) counts[item.tier]++;
    return counts;
  }, [metrics]);

  const atRiskMetrics = useMemo(
    () => metrics.filter(m => m.atRisk).sort((a, b) => b.riskScore - a.riskScore),
    [metrics],
  );
  const solidStageMetrics = useMemo(() => metrics.filter(m => m.solidStage), [metrics]);

  const avgRetention = useMemo(() => {
    if (!learnedMetrics.length) return null;
    const sum = learnedMetrics.reduce((acc, item) => acc + (item.retention ?? 0), 0);
    return Math.round(sum / learnedMetrics.length);
  }, [learnedMetrics]);

  const avgForgetting = avgRetention !== null ? 100 - avgRetention : null;

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

  const selectedMetric = useMemo(
    () => metrics.find(m => m.card.entry.id === selectedId),
    [metrics, selectedId],
  );

  // Rescue candidates (prioritize critical/warning learned cards, fallback to due fresh cards)
  const rescuePool = useMemo(() => {
    const urgent = atRiskMetrics.map(m => m.card).filter(c => eligible(c, "recognize"));
    if (urgent.length) return urgent;
    return metrics
      .filter(m => m.dueNow)
      .map(m => m.card)
      .filter(c => eligible(c, "recognize"))
      .slice(0, 25);
  }, [atRiskMetrics, metrics]);

  // Filtered & sorted per-word forgetting list
  const radarItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics
      .filter(item => {
        if (tierFilter !== null && item.tier !== tierFilter) return false;
        if (stageFilter !== null && (!item.reviewed || item.stage !== stageFilter)) return false;
        if (tierFilter === null) {
          if (radarTab === "risk" && !item.atRisk) return false;
          if (radarTab === "learned" && !item.reviewed) return false;
          if (radarTab === "fresh" && item.reviewed) return false;
        }
        if (!q) return true;
        return (item.card.term + " " + item.card.meaning).toLowerCase().includes(q);
      })
      .sort((a, b) => {
        if (a.reviewed !== b.reviewed) return Number(b.reviewed) - Number(a.reviewed);
        if (!a.reviewed && !b.reviewed) return a.card.term.localeCompare(b.card.term);
        if (sortMode === "error") {
          const accDiff = (a.accuracyPct ?? 100) - (b.accuracyPct ?? 100);
          if (accDiff !== 0) return accDiff;
          if (b.failCount !== a.failCount) return b.failCount - a.failCount;
          return b.riskScore - a.riskScore;
        }
        if (sortMode === "due") {
          if (a.daysToThreshold !== b.daysToThreshold) return a.daysToThreshold - b.daysToThreshold;
          return b.riskScore - a.riskScore;
        }
        return b.riskScore - a.riskScore || (b.forgettingPct ?? 0) - (a.forgettingPct ?? 0);
      });
  }, [metrics, radarTab, tierFilter, stageFilter, sortMode, search]);

  function selectWordForDiagnosis(id: string) {
    onSelect(id);
    setActionToast("");
    if (typeof window !== "undefined" && window.innerWidth <= 1150) {
      window.requestAnimationFrame(() => {
        chartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  async function quickReview(card: Card, passed: boolean) {
    setActionToast("");
    const ok = await onRate(card.entry, passed);
    if (ok) {
      const nextStage = passed ? Math.min(card.entry.reviewed ? card.entry.stage + 1 : 0, reviewIntervals.length - 1) : 0;
      const nextDays = reviewIntervals[nextStage];
      setActionToast(
        passed
          ? `已巩固「${card.term}」，遗忘度清零，记忆周期跃升至 ${nextDays} 天 (S${nextStage})！`
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
  const singleNextInterval = selectedMetric?.nextInterval ?? 2;
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
          <span className="metric-icon purple"><Brain size={19}/></span>
          <dd>{avgForgetting !== null ? `${avgForgetting}%` : "待首练"}</dd>
          <dt>{avgRetention !== null ? `平均遗忘度 · 保持 ${avgRetention}%` : `已学 ${learnedMetrics.length} / ${cards.length} 词`}</dt>
        </div>
        <div className={"v-panel rc-kpi " + (atRiskMetrics.length > 0 ? "alert" : "")}>
          <span className="metric-icon orange"><AlertTriangle size={19}/></span>
          <dd>{atRiskMetrics.length}</dd>
          <dt>重度 {tierCounts.critical} · 临界 {tierCounts.warning}</dt>
        </div>
        <div className="v-panel rc-kpi">
          <span className="metric-icon mint"><ShieldCheck size={19}/></span>
          <dd>{tierCounts.solid}</dd>
          <dt>记忆稳固 · S3+ {solidStageMetrics.length} 词</dt>
        </div>
        <div className="v-panel rc-kpi">
          <span className="metric-icon blue"><CalendarDays size={19}/></span>
          <dd>{peakForecast.count > 0 ? `${peakForecast.count} 条` : `${Math.max(1, Math.ceil(cards.length / Math.max(1, daysUntilExam)))} 条/天`}</dd>
          <dt>{peakForecast.count > 0 ? `7 日高峰（${peakForecast.label}）` : "考前日均推荐"}</dt>
        </div>
      </dl>

      {/* 5-Tier Per-Word Forgetting Degree Distribution Bar */}
      <section className="v-panel rc-tier-card" aria-label="逐词遗忘程度分布">
        <div className="rc-tier-head">
          <div>
            <strong>逐词遗忘程度全景分布</strong>
            <span className="v-muted">共分析 {cards.length} 个词条 · 点击任意分级筛选对应词单</span>
          </div>
          {tierFilter !== null && (
            <button type="button" className="rc-clear-btn" onClick={() => setTierFilter(null)}>
              清除分级筛选 <X size={12}/>
            </button>
          )}
        </div>

        <div className="rc-tier-bar" role="presentation">
          {tierOrder.map(tier => {
            const count = tierCounts[tier];
            if (!count) return null;
            return (
              <button
                key={tier}
                type="button"
                className={"rc-tier-seg " + tier + (tierFilter === tier ? " active" : "")}
                style={{ flexGrow: count }}
                title={`${tierMeta[tier].label}：${count} 词（${Math.round((count / Math.max(1, cards.length)) * 100)}%）`}
                onClick={() => { setTierFilter(prev => (prev === tier ? null : tier)); setShowLimit(24); }}
              />
            );
          })}
        </div>

        <div className="rc-tier-pills">
          {tierOrder.map(tier => {
            const count = tierCounts[tier];
            const pct = cards.length ? Math.round((count / cards.length) * 100) : 0;
            const active = tierFilter === tier;
            return (
              <button
                key={tier}
                type="button"
                className={"rc-tier-pill " + tier + (active ? " active" : "")}
                onClick={() => { setTierFilter(prev => (prev === tier ? null : tier)); setShowLimit(24); }}
                title={tierMeta[tier].desc}
              >
                <i className={"rc-tier-dot " + tier}/>
                <span>{tierMeta[tier].label}</span>
                <b>{count}</b>
                <small>{pct}%</small>
              </button>
            );
          })}
        </div>
      </section>

      <div className="rc-bento">
        {/* Left Column: Interactive Curve + Per-Word Diagnosis Spotlight + 7-Day Forecast */}
        <div className="rc-main-col">
          <section className="v-panel rc-chart-card" ref={chartRef}>
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
                    <Sparkles size={14}/>单字遗忘诊断
                  </button>
                </div>
                {selectedMetric && (
                  <button type="button" className="rc-clear-btn" onClick={() => { onSelect(""); setActionToast(""); }}>
                    <X size={13}/>返回整库
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
                    <span><i className="leg-dot boost"/>今日巩固预测 ({singleNextInterval} 天)</span>
                  </>
                )}
              </div>
            </div>

            {/* Per-Word Deep Forgetting Diagnosis Spotlight */}
            {selectedMetric && (
              <div className="rc-spotlight diag" key={selectedMetric.card.entry.id}>
                <div className="rc-spot-top">
                  <div className="rc-spot-info">
                    <div className="rc-spot-word">
                      <strong>{selectedMetric.card.term}</strong>
                      {selectedMetric.card.pronunciation && <span className="rc-spot-ipa">{selectedMetric.card.pronunciation}</span>}
                      <span className={"rc-tier-badge " + selectedMetric.tier}>{tierMeta[selectedMetric.tier].label}</span>
                    </div>
                    <p className="rc-spot-meaning">{selectedMetric.card.meaning.replace(/\n+/g, " · ")}</p>
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

                {/* 4 Per-Word Diagnostic Metrics */}
                <div className="rc-spot-stats">
                  <div className={"rc-spot-stat " + selectedMetric.tier}>
                    <span>遗忘程度</span>
                    <strong>{selectedMetric.forgettingPct !== null ? `${selectedMetric.forgettingPct}%` : "未学"}</strong>
                  </div>
                  <div className="rc-spot-stat">
                    <span>记忆保持率</span>
                    <strong>{selectedMetric.retention !== null ? `${selectedMetric.retention}%` : "—"}</strong>
                  </div>
                  <div className="rc-spot-stat">
                    <span>历史正确率</span>
                    <strong>
                      {selectedMetric.accuracyPct !== null
                        ? `${selectedMetric.accuracyPct}%`
                        : "待首练"}
                    </strong>
                    {selectedMetric.attempts > 0 && <small>{selectedMetric.passCount}/{selectedMetric.attempts} 次</small>}
                  </div>
                  <div className="rc-spot-stat">
                    <span>距 60% 临界</span>
                    <strong>
                      {!selectedMetric.reviewed
                        ? "未开启"
                        : selectedMetric.daysToThreshold < 0
                          ? `逾期 ${Math.abs(selectedMetric.daysToThreshold)} 天`
                          : selectedMetric.daysToThreshold === 0
                            ? "今日到期"
                            : `剩 ${selectedMetric.daysToThreshold} 天`}
                    </strong>
                    {selectedMetric.reviewed && <small>S{selectedMetric.stage} · {selectedMetric.interval}天周期</small>}
                  </div>
                </div>

                <div className={"rc-diagnosis-note " + selectedMetric.tier}>
                  <Brain size={15}/>
                  <span>{selectedMetric.diagnosis}</span>
                </div>
              </div>
            )}

            {actionToast && <p className="v-notice rc-toast" role="status">{actionToast}</p>}

            {/* Live Hover / Touch Scrubbing Readout Strip */}
            <div className="rc-probe-bar">
              {hoverDisplayDay !== null ? (
                !selectedMetric ? (
                  <>
                    <span className="rc-probe-day">第 {hoverDisplayDay} 天</span>
                    <span>不复习已忘 <b>{100 - Math.round(exampleRetention(hoverDisplayDay, 1) * 100)}%</b></span>
                    <span>·</span>
                    <span>按节律巩固可保持 <b className="mint">{Math.round(reinforcedRetentionAt(hoverDisplayDay) * 100)}%</b></span>
                  </>
                ) : (
                  <>
                    <span className="rc-probe-day">第 {hoverDisplayDay} 天</span>
                    <span>已遗忘 <b>{100 - Math.round(exampleRetention(hoverDisplayDay, singleInterval) * 100)}%</b>（保持 {Math.round(exampleRetention(hoverDisplayDay, singleInterval) * 100)}%）</span>
                    {hoverDisplayDay >= (selectedMetric.reviewed ? singleElapsed : 0) && (
                      <>
                        <span>·</span>
                        <span>今日巩固后保持 <b className="mint">{Math.round(exampleRetention(hoverDisplayDay - (selectedMetric.reviewed ? singleElapsed : 0), singleNextInterval) * 100)}%</b></span>
                      </>
                    )}
                  </>
                )
              ) : (
                <span className="v-muted">
                  {selectedMetric
                    ? "手指或鼠标滑过曲线可查看任意天数的遗忘比例；点上方「记住了」可原地拉升本词曲线。"
                    : "点击右侧（下方）任意词条，可展开该词的遗忘程度诊断、历史正确率与专属衰减曲线。"}
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
                onPointerDown={handleSvgPointer(activeHorizon)}
                onPointerMove={handleSvgPointer(activeHorizon)}
                onPointerLeave={() => setHoverDay(null)}
              >
                <title id={chartId}>
                  {selectedMetric ? `${selectedMetric.card.term} 的遗忘与记忆保持曲线` : "六级词库艾宾浩斯多轮巩固记忆曲线"}
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
                  60% 临界线（遗忘 40%）
                </text>

                {!selectedMetric ? (
                  <>
                    <path
                      fill="none"
                      stroke="#f28482"
                      strokeWidth="2.2"
                      strokeDasharray="6 5"
                      opacity="0.82"
                      d={overviewNaturalPath}
                    />
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
                    {overviewMilestones.slice(1).map(m => (
                      <g key={m.day}>
                        <line x1={xOf(m.day, overviewHorizon)} x2={xOf(m.day, overviewHorizon)} y1={yOf(1)} y2={bottom} stroke="rgba(124,93,250,0.18)" strokeDasharray="3 4"/>
                        <circle cx={xOf(m.day, overviewHorizon)} cy={yOf(1)} r="5.5" fill="#7c5dfa" stroke="#ffffff" strokeWidth="2"/>
                        <circle cx={xOf(m.day, overviewHorizon)} cy={yOf(0.6)} r="4" fill="#ea7535" stroke="#ffffff" strokeWidth="1.5"/>
                      </g>
                    ))}
                    {[0, 1, 3, 7, 14].map(d => (
                      <text key={d} x={xOf(d, overviewHorizon)} y={bottom + 20} textAnchor={d === 0 ? "start" : d === 14 ? "end" : "middle"}>
                        第 {d} 天
                      </text>
                    ))}
                  </>
                ) : (
                  <>
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
                    <path
                      className="v-curve-line"
                      fill="none"
                      stroke={`url(#${chartId}-boost)`}
                      strokeWidth="2.6"
                      strokeDasharray="6 5"
                      d={singleBoostPath}
                    />
                    <line x1={xOf(singleInterval, singleHorizon)} x2={xOf(singleInterval, singleHorizon)} y1={yOf(0.6)} y2={bottom} stroke="#7c5dfa" strokeDasharray="3 4"/>
                    <circle cx={xOf(singleInterval, singleHorizon)} cy={yOf(0.6)} r="6" fill="#7c5dfa" stroke="#ffffff" strokeWidth="2"/>

                    {selectedMetric.reviewed && (
                      <g>
                        <circle
                          className="rc-radar-ping"
                          cx={xOf(singleElapsed, singleHorizon)}
                          cy={yOf(exampleRetention(singleElapsed, singleInterval))}
                          r="12"
                          fill={selectedMetric.tier === "critical" ? "rgba(225,29,72,0.28)" : selectedMetric.tier === "warning" ? "rgba(234,117,53,0.28)" : "rgba(32,164,114,0.26)"}
                        />
                        <circle
                          cx={xOf(singleElapsed, singleHorizon)}
                          cy={yOf(exampleRetention(singleElapsed, singleInterval))}
                          r="6.5"
                          fill={selectedMetric.tier === "critical" ? "#e11d48" : selectedMetric.tier === "warning" ? "#ea7535" : "#189c68"}
                          stroke="#ffffff"
                          strokeWidth="2.4"
                        />
                      </g>
                    )}

                    {[...new Set([0, singleInterval, singleHorizon])].map(d => (
                      <text key={d} x={xOf(d, singleHorizon)} y={bottom + 20} textAnchor={d === 0 ? "start" : d === singleHorizon ? "end" : "middle"}>
                        {d} 天
                      </text>
                    ))}
                  </>
                )}

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
                <text x={right} y={height - 4} textAnchor="end">纵轴：记忆保持度</text>
              </svg>
            </div>

            {/* 7-Stage Memory Pyramid */}
            <div className="rc-stages-wrap">
              <div className="rc-stages-head">
                <strong>7 阶艾宾浩斯记忆金字塔（S0–S6）</strong>
                <span className="v-muted">
                  {stageFilter !== null ? `已筛选 S${stageFilter} · 再点取消` : "点击阶段筛选对应词条"}
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
                        if (stageFilter !== stageIdx) {
                          setTierFilter(null);
                          setRadarTab("learned");
                        }
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

            {selectedMetric?.card.entry.reviewLog?.length ? (
              <ul className="v-review-log" aria-label="本词最近复习记录">
                {selectedMetric.card.entry.reviewLog.slice(-5).reverse().map((attempt, index) => (
                  <li key={attempt.at + index}>
                    <time dateTime={attempt.at}>{dateKey(new Date(attempt.at))}</time>
                    <strong className={"v-tag " + (attempt.passed ? "mint" : "peach")}>{attempt.passed ? "记住了" : "待巩固"}</strong>
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
                    ? "提前看见复习高峰日，优先抢救重度与临界遗忘词条。"
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

        {/* Right Column: Per-Word Forgetting Degree Diagnostic List */}
        <aside className="v-panel rc-radar-card">
          <div className="rc-radar-head">
            <div>
              <h2>逐词遗忘诊断榜</h2>
              <p className="v-muted">每个词的实时遗忘比例、正确率与到期状态</p>
            </div>
            {(stageFilter !== null || tierFilter !== null) && (
              <button
                type="button"
                className="rc-clear-btn"
                onClick={() => { setStageFilter(null); setTierFilter(null); }}
              >
                {tierFilter ? tierMeta[tierFilter].short : `S${stageFilter}`} <X size={12}/>
              </button>
            )}
          </div>

          <label className="v-search rc-radar-search">
            <Search size={15}/>
            <input
              aria-label="在逐词遗忘榜中搜索词条"
              placeholder="搜英文单词或中文释义"
              value={search}
              onChange={e => { setSearch(e.target.value); setShowLimit(24); }}
            />
          </label>

          <div className="rc-radar-tabs" role="tablist" aria-label="词条范围">
            {[
              { id: "risk" as const, label: "需抢救", count: atRiskMetrics.length },
              { id: "learned" as const, label: "已学追踪", count: learnedMetrics.length },
              { id: "fresh" as const, label: "待初学", count: tierCounts.fresh },
              { id: "all" as const, label: "全部词", count: cards.length },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={tierFilter === null && radarTab === tab.id}
                className={"rc-radar-tab " + (tierFilter === null && radarTab === tab.id ? "active" : "")}
                onClick={() => { setRadarTab(tab.id); setTierFilter(null); setStageFilter(null); setShowLimit(24); }}
              >
                <span>{tab.label}</span>
                <i>{tab.count}</i>
              </button>
            ))}
          </div>

          <div className="rc-sort-bar" aria-label="排序方式">
            <span className="rc-sort-label"><ArrowDownWideNarrow size={13}/>排序</span>
            {([
              { id: "forgetting", label: "遗忘度最高" },
              { id: "error", label: "错误率最高" },
              { id: "due", label: "最快到期" },
            ] as const).map(opt => (
              <button
                key={opt.id}
                type="button"
                className={"rc-sort-pill " + (sortMode === opt.id ? "active" : "")}
                onClick={() => setSortMode(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="rc-radar-list">
            {radarItems.slice(0, showLimit).map(item => {
              const isSelected = selectedMetric?.card.entry.id === item.card.entry.id;
              const forgetVal = item.forgettingPct;
              const barWidth = forgetVal === null ? 8 : Math.max(6, forgetVal);
              const dueText = !item.reviewed
                ? item.card.source
                : item.daysToThreshold < 0
                  ? `逾期 ${Math.abs(item.daysToThreshold)} 天`
                  : item.daysToThreshold === 0
                    ? "今日到期"
                    : `剩 ${item.daysToThreshold} 天`;
              return (
                <div
                  key={item.card.entry.id}
                  className={"rc-radar-item " + (isSelected ? "selected" : "")}
                >
                  <button
                    type="button"
                    className="rc-radar-item-main"
                    onClick={() => selectWordForDiagnosis(item.card.entry.id)}
                  >
                    <div className="rc-radar-row-top">
                      <strong>{item.card.term}</strong>
                      <div className="rc-radar-badges">
                        <span className={"rc-tier-badge compact " + item.tier}>{tierMeta[item.tier].short}</span>
                        <span className={"rc-ret-pill " + item.tier}>
                          {forgetVal !== null ? `忘 ${forgetVal}%` : "未学"}
                        </span>
                      </div>
                    </div>
                    <p className="rc-radar-row-sub">{item.card.meaning.replace(/\n+/g, " · ")}</p>
                    <div className="rc-radar-row-bar">
                      <span className="rc-mini-track" title={forgetVal !== null ? `已遗忘 ${forgetVal}% · 保持 ${item.retention}%` : "尚未首次学习"}>
                        <i className={"rc-mini-fill " + item.tier} style={{ width: `${barWidth}%` }}/>
                      </span>
                      <small>
                        {item.reviewed
                          ? `保持 ${item.retention}%${item.accuracyPct !== null ? ` · 对${item.accuracyPct}%` : ""} · ${dueText}`
                          : dueText}
                      </small>
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
                  {radarTab === "risk" && tierFilter === null
                    ? "目前没有重度或临界遗忘的词条，记忆很稳！点上方「待初学」或「全部词」可查看其他词。"
                    : "当前筛选条件下没有匹配的词条。"}
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
