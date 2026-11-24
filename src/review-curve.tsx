"use client";

import { useId, useState } from "react";
import { dateKey, type Entry } from "./data";
import { daysBetween, exampleRetention, reviewIntervals } from "./review-schedule";

export function ReviewCurve({entry}:{entry?:Entry}) {
  const [step,setStep] = useState(0);
  const chartId = useId();
  const scheduledDays = entry?.reviewed && entry.due ? daysBetween(entry.reviewed,entry.due) : 0;
  const interval = scheduledDays > 0 ? scheduledDays : reviewIntervals[entry?.stage ?? step] ?? 1;
  const elapsed = entry?.reviewed ? Math.max(0,daysBetween(entry.reviewed,dateKey())) : 0;
  const horizon = Math.max(2,interval*2, elapsed);
  const width = 640, height = 232, left = 54, bottom = 184, top = 20, right = 612;
  const x = (day:number) => left+(right-left)*day/horizon;
  const y = (fraction:number) => bottom-(bottom-top)*fraction;
  const coords = Array.from({length:65},(_,i)=>{
    const day = horizon*i/64;
    return [x(day),y(exampleRetention(day,interval))];
  });
  const line = coords.map(([a,b],i)=>(i===0?"M":"L")+a.toFixed(1)+","+b.toFixed(1)).join(" ");
  const days = [...new Set([0,interval,horizon])];
  const label = entry ? entry.reviewed ? "当前复习间隔" : "首次练习后的示意" : "选择复习间隔";
  return <div className="v-curve">
    {!entry && <div className="v-curve-steps" aria-label={label}>{reviewIntervals.map((days,i)=>
      <button key={days} className={step===i?"selected":""} aria-pressed={step===i} onClick={()=>setStep(i)}>{days} 天</button>)}</div>}
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={chartId}>
      <title id={chartId}>{label}：复习后随时间下降的记忆保持度示意，计划在第 {interval} 天复习</title>
      <defs>
        <linearGradient id={chartId+"-shade"} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#a78bfa" stopOpacity=".42"/>
          <stop offset="1" stopColor="#ddd6fe" stopOpacity=".04"/>
        </linearGradient>
        <linearGradient id={chartId+"-stroke"} x1="0" y1="0" x2="1" y2="0">
          <stop stopColor="#8b5cf6"/>
          <stop offset="1" stopColor="#6d4aff"/>
        </linearGradient>
      </defs>
      {[1,.6,0].map(f=><g key={f}><line x1={left} x2={right} y1={y(f)} y2={y(f)} stroke="#e3def5" strokeDasharray={f===.6?"4 5":undefined}/><text x={left-8} y={y(f)+4} textAnchor="end">{Math.round(f*100)}%</text></g>)}
      <path fill={`url(#${chartId}-shade)`} d={line+` L ${right},${bottom} L ${left},${bottom} Z`}/>
      <path className="v-curve-line" fill="none" stroke={`url(#${chartId}-stroke)`} strokeWidth="3.5" d={line}/>
      <line x1={x(interval)} x2={x(interval)} y1={y(.6)} y2={bottom} stroke="#7c5dfa" strokeDasharray="3 4"/>
      <circle cx={x(interval)} cy={y(.6)} r="6" fill="#7c5dfa" stroke="#ffffff" strokeWidth="2"/>
      {entry?.reviewed && <circle cx={x(elapsed)} cy={y(exampleRetention(elapsed,interval))} r="6" fill="#189c68" stroke="#ffffff" strokeWidth="2.2"/>}
      {days.map(day=><text key={day} x={x(day)} y={bottom+20} textAnchor={day===horizon?"end":"middle"}>{day} 天</text>)}
      <text x={left} y={height-3}>距上次复习</text><text x={right} y={height-3} textAnchor="end">纵轴：记忆保持度示意</text>
    </svg>
    <p className="v-muted">{entry?.due ? "下次复习 "+entry.due+" · 绿点表示距上次复习的天数。" : "当前示意的复习间隔为 "+interval+" 天。"} 曲线是模型示意，实际表现以答题记录为准。</p>
    {entry?.reviewLog?.length ? <ul className="v-review-log" aria-label="本词最近复习记录">{entry.reviewLog.slice(-5).reverse().map((attempt,index)=>
      <li key={attempt.at+index}><time dateTime={attempt.at}>{dateKey(new Date(attempt.at))}</time><strong className={"v-tag "+(attempt.passed?"mint":"peach")}>{attempt.passed?"答对":"待巩固"}</strong><span>下次 {attempt.due}</span></li>)}</ul> : null}
  </div>;
}
