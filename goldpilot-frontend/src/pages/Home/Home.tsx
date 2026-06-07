import { useState, useEffect, useMemo } from 'react';
import { Alert, Button, Card, Space, Tag, message } from 'antd';
import { RobotOutlined, LoadingOutlined, WarningOutlined } from '@ant-design/icons';
import { PageHeader } from '@/components/PageHeader';
import { PriceCard } from '@/components/PriceCard';
import { Chart } from '@/components/Chart';
import { SignalPanel } from '@/components/SignalPanel';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { ActionPanel } from '@/components/ActionPanel';
import { EventList } from '@/components/EventList';
import { createDefaultDecisionData } from '@/types/decision';
import type { PriceData, Candle, Signal, DailyStats, Event, Flash } from '@/types';
import {
  fetchCandles,
  createRealtimeConnection,
  fetchRefreshInterval,
  refreshIntervalToMs,
} from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import type { Period } from '@/services/marketData';
import {
  dataApi,
  type EventDataMeta,
  type ImportantCalendarItem,
  type ImportantEventsPayload,
  type MarketFlash,
} from '@/services/data';
import { aiService, type AIAnalysisResult } from '@/services/ai';

const EVENT_DATA_REFRESH_MS = 60 * 60 * 1000;
const MARKET_SNAPSHOT_KEY = 'goldpilot:last-market-snapshot:v1';

interface MarketSnapshot {
  updatedAt?: string;
  priceData?: PriceData;
  candlesByPeriod?: Partial<Record<Period, Candle[]>>;
}

function isWeekendMarketDate(date: Date = new Date()): boolean {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

function getNextTradingDayText(date: Date = new Date()): string {
  const next = new Date(date);
  do {
    next.setDate(next.getDate() + 1);
  } while (isWeekendMarketDate(next));

  return next.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
}

function readMarketSnapshot(): MarketSnapshot | null {
  try {
    const raw = window.localStorage.getItem(MARKET_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MarketSnapshot;
    return {
      ...parsed,
      priceData: parsed.priceData
        ? { ...parsed.priceData, timestamp: new Date(parsed.priceData.timestamp) }
        : undefined,
    };
  } catch {
    return null;
  }
}

function saveMarketSnapshot(update: { priceData?: PriceData; period?: Period; candles?: Candle[] }): string | null {
  try {
    const current = readMarketSnapshot() || {};
    const next: MarketSnapshot = {
      ...current,
      updatedAt: new Date().toISOString(),
      priceData: update.priceData || current.priceData,
      candlesByPeriod: {
        ...(current.candlesByPeriod || {}),
      },
    };

    if (update.period && update.candles) {
      next.candlesByPeriod = {
        ...(next.candlesByPeriod || {}),
        [update.period]: update.candles,
      };
    }

    window.localStorage.setItem(MARKET_SNAPSHOT_KEY, JSON.stringify(next));
    return next.updatedAt || null;
  } catch {
    return null;
  }
}

function getSnapshotTimeText(value: string | null): string {
  if (!value) return '暂无本地行情缓存';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '暂无本地行情缓存';
  return `最后行情 ${date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

function getReferencePrice(priceData: PriceData | null, candles: Candle[]): number {
  if (priceData?.price) return priceData.price;
  const latest = candles[candles.length - 1];
  return Number(latest?.close || 0);
}

function getCandleLimit(period: Period): number {
  if (period === '1d') return 220;
  if (period === '4h' || period === '1h') return 260;
  return 360;
}

function getClosedMarketHistoryLimit(period: Period): number {
  if (period === '1d') return 180;
  if (period === '4h') return 360;
  if (period === '1h') return 720;
  if (period === '15m') return 1200;
  return 500;
}

function getClosedMarketChartMessage(period: Period, candleCount: number): string {
  if (candleCount <= 0) return '休市中，暂无可用历史K线数据';
  const periodLabel: Record<Period, string> = {
    '1m': '1分钟',
    '5m': '5分钟',
    '15m': '15分钟',
    '1h': '1小时',
    '4h': '4小时',
    '1d': '日线',
  };
  return `休市复盘：显示最近 ${candleCount} 根${periodLabel[period]}历史K线`;
}

function formatRefreshLabel(intervalMs: number | null): string {
  if (!intervalMs) return '手动刷新';
  const minutes = Math.max(1, Math.round(intervalMs / 60000));
  return `${minutes}分钟刷新`;
}

function getDataMetaLabel(meta: EventDataMeta | null, fallback: string): string {
  if (!meta) return fallback;
  if (meta.source === 'live') return '实时';
  if (meta.source === 'cache') return '缓存';
  return '模拟';
}

function getDataMetaColor(meta: EventDataMeta | null, fallback: 'blue' | 'amber' | 'red' | 'green') {
  if (!meta) return fallback;
  if (meta.source === 'live') return 'green';
  if (meta.source === 'cache') return 'amber';
  return 'red';
}

function formatLocalDateParam(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function countVisibleChars(value: string): number {
  return Array.from(value.replace(/\s/g, '')).length;
}

function formatStreamResult(result: AIAnalysisResult): string {
  return [
    '',
    '--- 结构化报告 ---',
    `结论：${result.decision.headline}`,
    `摘要：${result.decision.summary}`,
    `重点：${result.decision.eventCountdown}`,
    `依据：${result.decision.aiReason}`,
    `上涨概率：${result.probability.upProb}%`,
    `下跌概率：${result.probability.downProb}%`,
    `概率依据：${result.probability.reason}`,
    `风险：${result.risk.risk} / ${result.risk.riskLevel}`,
    `建议仓位：${result.risk.positionAdvice}%`,
    `止损：${result.risk.stopLoss}%`,
    `风险依据：${result.risk.reason}`,
    ...result.actions.map((action) => `${action.title}：${action.text}`),
  ].join('\n');
}

function createClosedMarketStats(): DailyStats {
  return {
    date: new Date(),
    signalCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
    upProb: 0,
    downProb: 0,
    risk: 0,
    riskLevel: 'low',
    positionAdvice: 0,
    stopLoss: 0,
  };
}

type ClientDecisionLevel = 'closed' | 'observe' | 'prepare' | 'action';
type ClientTone = 'blue' | 'green' | 'amber' | 'red' | 'neutral';

interface ClientDecisionPoint {
  label: string;
  value: string;
  tone?: ClientTone;
}

interface ClientDecisionView {
  level: ClientDecisionLevel;
  badge: string;
  badgeTone: ClientTone;
  title: string;
  summary: string;
  confidenceText: string;
  confidenceLabel: string;
  riskText: string;
  riskTone: ClientTone;
  positionText: string;
  actionText: string;
  plan: ClientDecisionPoint[];
  reasons: ClientDecisionPoint[];
  watchItems: ClientDecisionPoint[];
}

function formatPriceValue(value?: number): string {
  if (!value || !Number.isFinite(value)) return '--';
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getRiskText(level?: DailyStats['riskLevel']): string {
  if (level === 'high') return '高风险';
  if (level === 'medium') return '中风险';
  if (level === 'low') return '低风险';
  return '待评估';
}

function getRiskTone(level?: DailyStats['riskLevel']): ClientTone {
  if (level === 'high') return 'red';
  if (level === 'medium') return 'amber';
  if (level === 'low') return 'green';
  return 'neutral';
}

function getPrimaryCalendarItem(payload: ImportantEventsPayload | null, useWeekItems: boolean): ImportantCalendarItem | null {
  if (!payload) return null;
  const rows = useWeekItems
    ? [...payload.weekData, ...payload.weekEvents]
    : [...payload.todayData, ...payload.todayEvents, ...payload.weekData, ...payload.weekEvents];
  return rows[0] || null;
}

function getPrimaryCalendarText(payload: ImportantEventsPayload | null, useWeekItems: boolean): string {
  const item = getPrimaryCalendarItem(payload, useWeekItems);
  if (!item) return useWeekItems ? '暂无下周高重要性事件' : '暂无今日高重要性事件';
  return `${formatEventDate(item.date)} ${item.time} ${item.event}`;
}

function buildClientDecisionView(params: {
  aiAnalysis: AIAnalysisResult | null;
  isWeekendMarketClosed: boolean;
  stats: DailyStats;
  priceData: PriceData | null;
  candles: Candle[];
  signals: Signal[];
  importantEvents: ImportantEventsPayload | null;
  flashes: Flash[];
  nextTradingDayText: string;
  marketSnapshotText: string;
}): ClientDecisionView {
  const {
    aiAnalysis,
    isWeekendMarketClosed,
    stats,
    priceData,
    candles,
    signals,
    importantEvents,
    flashes,
    nextTradingDayText,
    marketSnapshotText,
  } = params;
  const currentPrice = getReferencePrice(priceData, candles);
  const hasPrice = currentPrice > 0;
  const support1 = priceData?.support1;
  const support2 = priceData?.support2;
  const resistance1 = priceData?.resistance1;
  const primaryEventText = getPrimaryCalendarText(importantEvents, isWeekendMarketClosed);
  const latestFlash = flashes[0]?.text || '暂无重要快讯';

  if (isWeekendMarketClosed) {
    return {
      level: 'closed',
      badge: '休市',
      badgeTone: 'amber',
      title: '周末休市，暂停新交易判断',
      summary: '周六、周日不读取实时行情和K线，不生成新的入场信号。当前页面用于复盘、检查风险和准备下周事件窗口。',
      confidenceText: '暂停',
      confidenceLabel: '开盘后重算',
      riskText: '隔周风险',
      riskTone: 'amber',
      positionText: '0%',
      actionText: '不追单，不开新仓，只做复盘和下周准备。',
      plan: [
        { label: '今日动作', value: '暂停实时交易', tone: 'amber' },
        { label: '下次评估', value: nextTradingDayText, tone: 'blue' },
        { label: '行情参考', value: marketSnapshotText, tone: 'neutral' },
        { label: '重点事件', value: primaryEventText, tone: 'amber' },
      ],
      reasons: [
        { label: '市场状态', value: '现货黄金周末无连续交易行情，报价和K线不作为实时决策依据。' },
        { label: '风险重点', value: '检查隔周持仓、止损、保证金和周一跳空风险。' },
        { label: '下周准备', value: primaryEventText },
      ],
      watchItems: [
        { label: '客户提醒', value: '不要把周末缓存报价当成可成交价格。', tone: 'amber' },
        { label: '交易动作', value: '周一开盘后先观察价差、流动性和第一小时方向。', tone: 'blue' },
        { label: '风险控制', value: '若有隔周持仓，提前确认止损和保证金余量。', tone: 'red' },
      ],
    };
  }

  if (aiAnalysis) {
    const upProb = Number(aiAnalysis.probability.upProb || 0);
    const downProb = Number(aiAnalysis.probability.downProb || 0);
    const dominantProb = Math.max(upProb, downProb);
    const isLongBias = upProb >= downProb;
    const riskTone = getRiskTone(aiAnalysis.risk.riskLevel);
    const allowAction = dominantProb >= 58 && aiAnalysis.risk.riskLevel !== 'high' && aiAnalysis.risk.positionAdvice >= 15;
    const level: ClientDecisionLevel = allowAction ? 'prepare' : 'observe';

    return {
      level,
      badge: allowAction ? '可等待执行' : '观察确认',
      badgeTone: allowAction ? 'green' : riskTone === 'red' ? 'red' : 'blue',
      title: aiAnalysis.decision.headline,
      summary: aiAnalysis.decision.summary,
      confidenceText: `${dominantProb.toFixed(0)}%`,
      confidenceLabel: isLongBias ? `偏多 ${upProb.toFixed(0)}%` : `偏空 ${downProb.toFixed(0)}%`,
      riskText: getRiskText(aiAnalysis.risk.riskLevel),
      riskTone,
      positionText: `${Math.max(0, aiAnalysis.risk.positionAdvice).toFixed(0)}%以内`,
      actionText: allowAction
        ? '等待价格到计划区间并再次确认，再小仓执行。'
        : '先观察，等待AI结论、事件窗口和价格形态进一步确认。',
      plan: [
        { label: '方向判断', value: isLongBias ? '偏多观察' : '偏空观察', tone: isLongBias ? 'green' : 'red' },
        { label: '参考现价', value: hasPrice ? formatPriceValue(currentPrice) : '等待实时行情', tone: 'blue' },
        {
          label: '计划区间',
          value: isLongBias
            ? (support1 ? `靠近支撑 ${formatPriceValue(support1)} 后确认` : '等待支撑位刷新后确认')
            : (resistance1 ? `靠近压力 ${formatPriceValue(resistance1)} 后确认` : '等待压力位刷新后确认'),
          tone: 'neutral',
        },
        { label: '失效条件', value: aiAnalysis.decision.eventCountdown || '事件前后重新评估', tone: 'red' },
      ],
      reasons: [
        { label: 'AI判断', value: aiAnalysis.decision.aiReason },
        { label: '概率依据', value: aiAnalysis.probability.reason },
        { label: '风险依据', value: aiAnalysis.risk.reason },
      ],
      watchItems: aiAnalysis.actions.map((action, index) => ({
        label: action.title,
        value: action.text,
        tone: index === 2 ? 'red' : index === 1 ? 'blue' : 'green',
      })),
    };
  }

  const latestSignal = signals[signals.length - 1];
  const hasSignals = signals.length > 0;
  const upProb = Number(stats.upProb || 0);
  const downProb = Number(stats.downProb || 0);
  const isNeutral = Math.abs(upProb - downProb) < 8;
  const isLongBias = latestSignal?.direction === 'long' || (!latestSignal && upProb > downProb);
  const confidenceText = isNeutral || (!hasSignals && upProb === 50 && downProb === 50)
    ? '待AI'
    : `${Math.max(upProb, downProb).toFixed(0)}%`;
  const riskText = getRiskText(stats.riskLevel);

  return {
    level: hasSignals && !isNeutral ? 'prepare' : 'observe',
    badge: hasSignals ? '待确认' : '观察',
    badgeTone: hasSignals ? 'blue' : 'neutral',
    title: hasSignals ? '已有技术信号，等待事件和AI二次确认' : '等待关键确认，暂不追单',
    summary: '当前先用实时行情、短线信号、重要事件和快讯做观察。未生成AI分析前，不给客户强执行建议。',
    confidenceText,
    confidenceLabel: hasSignals ? (isLongBias ? '技术偏多' : '技术偏空') : '等待AI分析',
    riskText,
    riskTone: getRiskTone(stats.riskLevel),
    positionText: hasSignals ? `${Math.max(0, stats.positionAdvice || 0).toFixed(0)}%以内` : '0-轻仓',
    actionText: hasSignals ? '只在价格到计划位且风险可控时小仓试探。' : '先观察，不追单，点击 AI 智能分析后生成更完整解释。',
    plan: [
      { label: '参考现价', value: hasPrice ? formatPriceValue(currentPrice) : '等待实时行情', tone: 'blue' },
      { label: '第一支撑', value: formatPriceValue(support1), tone: 'green' },
      { label: '第一压力', value: formatPriceValue(resistance1), tone: 'red' },
      { label: '失效条件', value: support2 ? `跌破 ${formatPriceValue(support2)} 后重评` : '事件公布前后重评', tone: 'red' },
    ],
    reasons: [
      { label: '技术面', value: hasSignals ? `最近信号为${isLongBias ? '做多' : '做空'}，仍需事件和风险确认。` : '暂无足够明确的新信号。' },
      { label: '事件面', value: primaryEventText },
      { label: '消息面', value: latestFlash },
    ],
    watchItems: [
      { label: '客户提醒', value: '未完成AI分析前，不把概率当成最终交易指令。', tone: 'amber' },
      { label: '交易动作', value: '等待价格接近支撑/压力后，再结合事件窗口确认。', tone: 'blue' },
      { label: '风险控制', value: '单笔风险先控制在账户净值小比例，避免事件前追单。', tone: 'red' },
    ],
  };
}

/**
 * 计算信号统计数据
 */
function calculateSignalStats(signals: Signal[]): DailyStats {
  // 获取今天的信号
  const today = new Date().setHours(0, 0, 0, 0);
  const todaySignals = signals.filter(s => new Date(s.timestamp).getTime() >= today);

  // 计算统计数据
  const signalCount = todaySignals.length;
  const completedSignals = todaySignals.filter(s => s.status === 'profit' || s.status === 'loss');
  const winSignals = completedSignals.filter(s => s.status === 'profit');
  const lossSignals = completedSignals.filter(s => s.status === 'loss');
  const winCount = winSignals.length;
  const lossCount = lossSignals.length;
  const winRate = completedSignals.length > 0 ? (winSignals.length / completedSignals.length) * 100 : 0;
  const totalProfit = winSignals.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalLoss = Math.abs(lossSignals.reduce((sum, s) => sum + (s.profit || 0), 0));
  const netProfit = todaySignals.reduce((sum, s) => sum + (s.profit || 0), 0);

  return {
    date: new Date(),
    signalCount,
    winCount,
    lossCount,
    winRate,
    totalProfit,
    totalLoss,
    netProfit,
    upProb: 50,
    downProb: 50,
    risk: 50,
    riskLevel: 'medium',
    positionAdvice: 50,
    stopLoss: 2.5,
  };
}

function buildImportantEventRows(payload: ImportantEventsPayload | null): Event[] {
  if (!payload) return [];
  const rows = [
    ...payload.todayData,
    ...payload.todayEvents,
    ...payload.weekData,
    ...payload.weekEvents,
  ];

  const seen = new Set<string>();
  return rows
    .filter((item) => {
      const key = `${item.date}|${item.time}|${item.event}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12)
    .map((item) => ({
      date: item.date,
      time: item.time,
      star: item.importanceLabel || '★'.repeat(item.importance),
      text: `${item.country} ${item.event}`,
      source: item.source,
      sourceUrl: item.sourceUrl,
    }));
}

function hasImportantRows(payload: ImportantEventsPayload | null, meta: EventDataMeta | null): boolean {
  if (!payload || meta?.source === 'mock') return false;
  return [
    payload.todayData,
    payload.todayEvents,
    payload.weekData,
    payload.weekEvents,
  ].some((items) => items.length > 0);
}

function formatEventDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}` : date;
}

function formatFieldValue(value?: string): string {
  return value && value.trim() ? value : '--';
}

function getImportanceBadge(item: ImportantCalendarItem): string {
  return item.importanceLabel || '★'.repeat(Math.max(1, Math.min(5, item.importance)));
}

interface ImportantCalendarCardProps {
  title: string;
  items: ImportantCalendarItem[];
  meta: EventDataMeta | null;
  badge: string;
  showValues?: boolean;
  emptyText: string;
  sourceLinks?: ImportantEventsPayload['sourceLinks'];
}

function ImportantCalendarCard({
  title,
  items,
  meta,
  badge,
  showValues = false,
  emptyText,
  sourceLinks = [],
}: ImportantCalendarCardProps) {
  const sourcePill = meta?.source === 'mock' ? '待核对' : getDataMetaLabel(meta, badge);
  const pillColor = getDataMetaColor(meta, 'amber');

  return (
    <article className={`card important-calendar-card ${items.length === 0 ? 'is-empty' : ''}`}>
      <div className="card-title">
        <strong>{title}</strong>
        <span className={`pill ${pillColor}`}>{sourcePill}</span>
      </div>

      {items.length > 0 ? (
        <div className="important-calendar-list">
          {items.slice(0, 4).map((item) => (
            <a
              key={`${item.date}-${item.time}-${item.event}`}
              href={item.sourceUrl || sourceLinks[0]?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="important-calendar-row source-row-link"
              title="打开源信息"
            >
              <div className="important-calendar-time">
                <span>{formatEventDate(item.date)}</span>
                <strong>{item.time}</strong>
              </div>
              <div className="important-calendar-body">
                <div className="important-calendar-head">
                  <span className="importance-stars">{getImportanceBadge(item)}</span>
                  <span>{item.event}</span>
                </div>
                {showValues && (
                  <div className="important-calendar-values">
                    <span>前值 {formatFieldValue(item.previous)}</span>
                    <span>预测 {formatFieldValue(item.forecast)}</span>
                    {item.actual && <span>实际 {formatFieldValue(item.actual)}</span>}
                  </div>
                )}
                <div className="mini-source">{item.source || '源信息'}</div>
              </div>
            </a>
          ))}
        </div>
      ) : (
        <div className="important-calendar-empty">
          <span>{emptyText}</span>
          <div className="important-source-links">
            {sourceLinks.slice(0, 2).map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name}
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

interface WeekendMarketPanelProps {
  snapshotText: string;
  nextTradingDayText: string;
}

function WeekendMarketPanel({ snapshotText, nextTradingDayText }: WeekendMarketPanelProps) {
  return (
    <article className="card weekend-market-panel">
      <div className="card-title">
        <strong>周末休市模式</strong>
        <span className="pill amber">暂停实时交易</span>
      </div>
      <div className="weekend-market-status">
        <div>
          <span className="sub">市场状态</span>
          <strong>黄金休市</strong>
        </div>
        <div>
          <span className="sub">下个交易日</span>
          <strong>{nextTradingDayText}</strong>
        </div>
      </div>
      <div className="weekend-market-note">
        周六、周日不读取实时行情和K线API，不生成新信号、不计算实时仓位建议。
        页面只保留最后可用行情参考、下周重要事件和客户服务提醒。
      </div>
      <div className="weekend-market-snapshot">{snapshotText}</div>
    </article>
  );
}

interface WeekendBriefCardProps {
  snapshotText: string;
  nextTradingDayText: string;
  sourceLinks?: ImportantEventsPayload['sourceLinks'];
}

function WeekendBriefCard({
  snapshotText,
  nextTradingDayText,
  sourceLinks = [],
}: WeekendBriefCardProps) {
  return (
    <article className="card weekend-brief-card">
      <div className="card-title">
        <strong>周末整理</strong>
        <span className="pill amber">休市</span>
      </div>

      <div className="weekend-brief-stack">
        <div className="weekend-brief-primary">
          <span className="sub">今日处理</span>
          <strong>不读取今日日历</strong>
          <p>过滤周六、周日的实时行情和今日事件，只保留复盘与下周准备。</p>
        </div>

        <div className="weekend-brief-metrics">
          <div>
            <span className="sub">下个交易日</span>
            <strong>{nextTradingDayText}</strong>
          </div>
          <div title={snapshotText}>
            <span className="sub">行情缓存</span>
            <strong>{snapshotText}</strong>
          </div>
        </div>

        {sourceLinks.length > 0 && (
          <div className="weekend-brief-links">
            {sourceLinks.slice(0, 2).map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

interface ClientDecisionBoardProps {
  view: ClientDecisionView;
  analyzing: boolean;
  canAnalyze: boolean;
  onAnalyze: () => void;
  onReset: () => void;
  hasAnalysis: boolean;
  isWeekendMarketClosed: boolean;
}

function ClientDecisionBoard({
  view,
  analyzing,
  canAnalyze,
  onAnalyze,
  onReset,
  hasAnalysis,
  isWeekendMarketClosed,
}: ClientDecisionBoardProps) {
  return (
    <section className={`client-decision-board level-${view.level}`} aria-label="客户决策摘要">
      <div className="client-decision-main">
        <div className="client-decision-topline">
          <span className={`pill ${view.badgeTone === 'neutral' ? '' : view.badgeTone}`}>{view.badge}</span>
          <span className="client-decision-mode">{isWeekendMarketClosed ? '复盘模式' : '实时辅助'}</span>
        </div>
        <h2>{view.title}</h2>
        <p>{view.summary}</p>
        <div className="client-decision-action">{view.actionText}</div>
      </div>

      <div className="client-kpi-grid" aria-label="决策指标">
        <div className="client-kpi">
          <span>置信度</span>
          <strong>{view.confidenceText}</strong>
          <em>{view.confidenceLabel}</em>
        </div>
        <div className={`client-kpi tone-${view.riskTone}`}>
          <span>风险</span>
          <strong>{view.riskText}</strong>
          <em>先看失效条件</em>
        </div>
        <div className="client-kpi">
          <span>建议仓位</span>
          <strong>{view.positionText}</strong>
          <em>客户展示口径</em>
        </div>
      </div>

      <div className="client-plan-panel">
        <div className="client-panel-head">
          <strong>交易计划</strong>
          <span>先确认，再执行</span>
        </div>
        <div className="client-plan-grid">
          {view.plan.map((item) => (
            <div key={item.label} className={`client-plan-item tone-${item.tone || 'neutral'}`}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="client-reason-panel">
        <div className="client-panel-head">
          <strong>为什么这样判断</strong>
          <span>{hasAnalysis ? 'AI已生成' : '待AI确认'}</span>
        </div>
        <div className="client-reason-list">
          {view.reasons.slice(0, 3).map((item) => (
            <div key={item.label} className="client-reason-item">
              <span>{item.label}</span>
              <p>{item.value}</p>
            </div>
          ))}
        </div>
        <div className="client-board-actions">
          {hasAnalysis ? (
            <Button onClick={onReset}>重新分析</Button>
          ) : (
            <Button
              type="primary"
              icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
              onClick={onAnalyze}
              disabled={analyzing || !canAnalyze}
            >
              {analyzing ? 'AI分析中...' : isWeekendMarketClosed ? 'AI周末复盘' : '生成AI解释'}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

interface ClientEventTimelineProps {
  importantEvents: ImportantEventsPayload | null;
  flashes: Flash[];
  isWeekendMarketClosed: boolean;
}

function ClientEventTimeline({ importantEvents, flashes, isWeekendMarketClosed }: ClientEventTimelineProps) {
  const calendarRows = isWeekendMarketClosed
    ? [...(importantEvents?.weekData || []), ...(importantEvents?.weekEvents || [])]
    : [
        ...(importantEvents?.todayData || []),
        ...(importantEvents?.todayEvents || []),
        ...(importantEvents?.weekData || []),
        ...(importantEvents?.weekEvents || []),
      ];
  const rows = [
    ...calendarRows.slice(0, 3).map((item) => ({
      key: `${item.date}-${item.time}-${item.event}`,
      time: `${formatEventDate(item.date)} ${item.time}`,
      title: item.event,
      source: item.source || '源信息',
      sourceUrl: item.sourceUrl,
      hot: item.importance >= 4,
    })),
    ...flashes.slice(0, 2).map((flash) => ({
      key: `${flash.date}-${flash.time}-${flash.text}`,
      time: `${flash.date ? `${formatEventDate(flash.date)} ` : ''}${flash.time}`,
      title: flash.text,
      source: flash.source || '市场快讯',
      sourceUrl: flash.sourceUrl,
      hot: flash.hot,
    })),
  ].slice(0, 5);

  return (
    <article className="client-side-card client-event-timeline">
      <div className="client-panel-head">
        <strong>{isWeekendMarketClosed ? '下周关键时间线' : '关键时间线'}</strong>
        <span>可追源</span>
      </div>
      {rows.length > 0 ? (
        <div className="client-timeline-list">
          {rows.map((row) => {
            const rowContent = (
              <>
                <span>{row.time}</span>
                <strong>{row.title}</strong>
                <em>{row.source}</em>
              </>
            );

            if (!row.sourceUrl) {
              return (
                <div key={row.key} className={`client-timeline-row ${row.hot ? 'hot' : ''}`}>
                  {rowContent}
                </div>
              );
            }

            return (
              <a
                key={row.key}
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`client-timeline-row ${row.hot ? 'hot' : ''}`}
              >
                {rowContent}
              </a>
            );
          })}
        </div>
      ) : (
        <div className="client-empty-note">暂无可追源的重要事件或快讯</div>
      )}
    </article>
  );
}

interface ClientRiskChecklistProps {
  items: ClientDecisionPoint[];
}

function ClientRiskChecklist({ items }: ClientRiskChecklistProps) {
  return (
    <article className="client-side-card client-risk-checklist">
      <div className="client-panel-head">
        <strong>客户沟通要点</strong>
        <span>服务动作</span>
      </div>
      <div className="client-check-list">
        {items.slice(0, 3).map((item) => (
          <div key={item.label} className={`client-check-item tone-${item.tone || 'neutral'}`}>
            <span>{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

export function Home() {
  const [period, setPeriod] = useState<Period>(() => (isWeekendMarketDate(new Date()) ? '1d' : '1m'));
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [candlesError, setCandlesError] = useState<string | null>(null);
  const [marketRefreshMs, setMarketRefreshMs] = useState<number | null>(5 * 60 * 1000);
  const [marketSnapshotAt, setMarketSnapshotAt] = useState<string | null>(null);
  const isWeekendMarketClosed = useMemo(() => isWeekendMarketDate(new Date()), []);
  const nextTradingDayText = useMemo(() => getNextTradingDayText(new Date()), []);
  const marketSnapshotText = useMemo(() => getSnapshotTimeText(marketSnapshotAt), [marketSnapshotAt]);

  // 真实数据状态
  const [events, setEvents] = useState<Event[]>([]);
  const [flashes, setFlashes] = useState<Flash[]>([]);
  const [importantEvents, setImportantEvents] = useState<ImportantEventsPayload | null>(null);
  const [importantMeta, setImportantMeta] = useState<EventDataMeta | null>(null);
  const [newsMeta, setNewsMeta] = useState<EventDataMeta | null>(null);
  const hasCalendarData = useMemo(
    () => hasImportantRows(importantEvents, importantMeta),
    [importantEvents, importantMeta]
  );
  const showCalendarDetail = hasCalendarData && !isWeekendMarketClosed;

  // AI分析相关状态
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [showAnalysisButton, setShowAnalysisButton] = useState(true);
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState('等待发起分析');
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0);
  const [lastStreamResult, setLastStreamResult] = useState<AIAnalysisResult | null>(null);
  const todayText = useMemo(() => new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }), []);

  // 计算统计数据（优先使用AI分析结果）
  const stats = useMemo(() => {
    if (aiAnalysis) {
      return {
        date: new Date(),
        signalCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        netProfit: 0,
        upProb: aiAnalysis.probability.upProb,
        downProb: aiAnalysis.probability.downProb,
        risk: aiAnalysis.risk.risk,
        riskLevel: aiAnalysis.risk.riskLevel,
        positionAdvice: aiAnalysis.risk.positionAdvice,
        stopLoss: aiAnalysis.risk.stopLoss,
      };
    }
    if (isWeekendMarketClosed) {
      return createClosedMarketStats();
    }
    return calculateSignalStats(signals);
  }, [signals, aiAnalysis, isWeekendMarketClosed]);

  // 决策数据（优先使用AI分析结果）
  const decisionData = useMemo(() => {
    if (aiAnalysis) {
      return {
        headline: aiAnalysis.decision.headline,
        summary: aiAnalysis.decision.summary,
        eventCountdown: aiAnalysis.decision.eventCountdown,
        aiReason: aiAnalysis.decision.aiReason,
      };
    }
    if (isWeekendMarketClosed) {
      return {
        headline: '周末休市，暂停实时交易判断',
        summary: '现货黄金周末无连续成交行情，今日信号、概率和仓位建议不生成；重点转为复盘、风险检查和下周事件准备。',
        eventCountdown: `下个交易日 ${nextTradingDayText} 开盘后恢复实时判断`,
        aiReason: '系统已暂停行情/K线轮询，仅保留最后行情参考和下周重要日历。',
      };
    }
    return createDefaultDecisionData();
  }, [aiAnalysis, isWeekendMarketClosed, nextTradingDayText]);

  useEffect(() => {
    let mounted = true;

    const loadRefreshSetting = async () => {
      try {
        const interval = await fetchRefreshInterval();
        if (mounted) {
          setMarketRefreshMs(refreshIntervalToMs(interval));
        }
      } catch (error) {
        console.warn('读取行情刷新间隔失败，使用默认5分钟:', error);
      }
    };

    loadRefreshSetting();

    const handleRefreshIntervalChange: EventListener = (event) => {
      const interval = (event as unknown as CustomEvent).detail;
      if (interval === '1m' || interval === '5m' || interval === '10m' || interval === 'never') {
        setMarketRefreshMs(refreshIntervalToMs(interval));
      }
    };

    window.addEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    return () => {
      mounted = false;
      window.removeEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    };
  }, []);

  useEffect(() => {
    if (!analyzing || !streamStartedAt) {
      return undefined;
    }

    const updateElapsed = () => {
      setStreamElapsedSeconds(Math.max(0, Math.floor((Date.now() - streamStartedAt) / 1000)));
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [analyzing, streamStartedAt]);

  const streamCharCount = useMemo(() => countVisibleChars(streamText), [streamText]);
  const streamSpeed = streamCharCount > 0 && streamElapsedSeconds > 0
    ? Number((streamCharCount / streamElapsedSeconds).toFixed(1))
    : 0;
  const streamProgressText = streamCharCount > 0
    ? `已输出 ${streamCharCount} 字，${streamElapsedSeconds > 0 ? `用时 ${streamElapsedSeconds} 秒，约 ${streamSpeed} 字/秒` : '用时不足 1 秒'}`
    : `等待首字中，用时 ${streamElapsedSeconds} 秒`;
  const streamTimeText = streamCharCount > 0 && streamElapsedSeconds > 0
    ? `${streamElapsedSeconds}s / ${streamSpeed} 字/秒`
    : `${streamElapsedSeconds}s`;

  // AI建议（优先使用AI分析结果）
  const aiActions = useMemo(() => {
    if (aiAnalysis) {
      return aiAnalysis.actions;
    }
    if (isWeekendMarketClosed) {
      return [
        { title: '客户提醒', text: '周末黄金休市，不提示追单和新开仓，只提醒下周关键数据窗口。' },
        { title: '交易动作', text: '暂停新信号执行，复盘本周信号质量，整理周一开盘后的支撑压力观察位。' },
        { title: '风险控制', text: '检查隔周持仓、止损和保证金余量，防范周一跳空风险。' },
      ];
    }
    return [
      { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
      { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
      { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
    ];
  }, [aiAnalysis, isWeekendMarketClosed]);
  const canRunAIAnalysis = !analyzing && (!isWeekendMarketClosed || candles.length > 0 || Boolean(priceData));
  const clientDecisionView = useMemo(
    () => buildClientDecisionView({
      aiAnalysis,
      isWeekendMarketClosed,
      stats,
      priceData,
      candles,
      signals,
      importantEvents,
      flashes,
      nextTradingDayText,
      marketSnapshotText,
    }),
    [
      aiAnalysis,
      isWeekendMarketClosed,
      stats,
      priceData,
      candles,
      signals,
      importantEvents,
      flashes,
      nextTradingDayText,
      marketSnapshotText,
    ]
  );

  // 获取K线数据
  useEffect(() => {
    const loadCandles = async () => {
      if (isWeekendMarketClosed) {
        const snapshot = readMarketSnapshot();
        setMarketSnapshotAt(snapshot?.updatedAt || null);
        setSignals([]);

        try {
          const data = await fetchCandles(period, getClosedMarketHistoryLimit(period), { mode: 'history' });
          setCandles(data);
          setCandlesError(null);
          setMarketSnapshotAt(saveMarketSnapshot({ period, candles: data }) || snapshot?.updatedAt || null);
        } catch (error) {
          console.warn('周末历史K线读取失败，回退本地缓存:', error);
          const cachedCandles = snapshot?.candlesByPeriod?.[period] || [];
          setCandles(cachedCandles);
          setCandlesError(cachedCandles.length ? null : '历史K线数据暂不可用');
        }
        return;
      }

      try {
        const data = await fetchCandles(period, getCandleLimit(period));
        setCandles(data);
        setCandlesError(null);
        setMarketSnapshotAt(saveMarketSnapshot({ period, candles: data }));

        console.log(`📊 [信号检测] K线数据: ${data.length} 条`);
        console.log(`📊 [信号检测] 前5条:`, data.slice(0, 5));
        console.log(`📊 [信号检测] 后5条:`, data.slice(-5));

        // 调试：打印最新K线时间
        if (data.length > 0) {
          const latest = data[data.length - 1];
          const latestTime = typeof latest.time === 'number'
            ? new Date(latest.time * 1000)
            : new Date(latest.time);
          const now = new Date();
          console.log('🕐 [K线时间] 最新K线:', latestTime.toLocaleString('zh-CN', { hour12: false }));
          console.log('🕐 [K线时间] 当前时间:', now.toLocaleString('zh-CN', { hour12: false }));
          console.log('🕐 [K线时间] 时间差:', Math.floor((now.getTime() - latestTime.getTime()) / 1000), '秒');
        }

        // 计算信号（需要至少233根K线）
        if (data.length >= 233) {
          console.log('🔍 [信号检测] 开始计算 EMA...');
          const detectedSignals = detectSignals(data);
          console.log(`✅ [信号检测] 检测到 ${detectedSignals.length} 个信号:`, detectedSignals);
          setSignals(detectedSignals);
        } else {
          console.warn(`⚠️ K线数据不足（${data.length}条），需要至少233条`);
          setSignals([]);
        }
      } catch (error) {
        console.error('❌ [信号检测] 失败:', error);
        const errorMessage = error instanceof Error ? error.message : 'K线数据获取失败';
        setCandlesError(errorMessage);
        setCandles([]); // 清空K线数据
        setSignals([]); // 清空信号数据
      }
    };

    // 初始加载
    loadCandles();

    if (!marketRefreshMs || isWeekendMarketClosed) {
      return undefined;
    }

    const interval = setInterval(loadCandles, marketRefreshMs);

    return () => clearInterval(interval);
  }, [period, marketRefreshMs, isWeekendMarketClosed]);

  // 加载事件和快讯数据
  useEffect(() => {
    const loadEventData = async () => {
      try {
        // 格式化今天日期
        const today = formatLocalDateParam(new Date());

        // 并行请求重要日历聚合和市场快讯
        const [importantRes, newsRes] = await Promise.all([
          dataApi.getImportantEvents(today).catch(() => null),
          dataApi.getMarketNews().catch(() => null),
        ]);

        const nextImportantMeta = importantRes?.meta || null;
        const nextNewsMeta = newsRes?.meta || null;

        if (importantRes?.success && importantRes.data) {
          setImportantEvents(importantRes.data);
          setEvents(nextImportantMeta?.source === 'mock' ? [] : buildImportantEventRows(importantRes.data));
        } else {
          setImportantEvents(null);
          setEvents([]);
        }
        setImportantMeta(nextImportantMeta);

        // 转换市场快讯数据格式
        if (newsRes?.success && newsRes.data.length > 0 && nextNewsMeta?.source !== 'mock') {
          const convertedFlashes: Flash[] = newsRes.data
            .slice(0, 10) // 只取前10条
            .map((item: MarketFlash) => ({
              date: item.date,
              time: item.time,
              hot: item.hot || false,
              text: item.content,
              source: item.source,
              sourceUrl: item.sourceUrl,
          }));
          setFlashes(convertedFlashes);
        } else {
          setFlashes([]);
        }
        setNewsMeta(nextNewsMeta);

        console.log('✅ [事件数据] 加载成功');
      } catch (error) {
        console.error('❌ [事件数据] 加载失败:', error);
        setEvents([]);
        setImportantEvents(null);
        setFlashes([]);
        setImportantMeta(null);
        setNewsMeta(null);
      }
    };

    // 初始加载
    loadEventData();

    // 每小时刷新一次事件和快讯，减少外部数据源压力
    const interval = setInterval(loadEventData, EVENT_DATA_REFRESH_MS);

    return () => clearInterval(interval);
  }, []);

  // 实时价格更新
  useEffect(() => {
    if (isWeekendMarketClosed) {
      const snapshot = readMarketSnapshot();
      setMarketSnapshotAt(snapshot?.updatedAt || null);
      setPriceData(snapshot?.priceData || null);
      return undefined;
    }

    const cleanup = createRealtimeConnection(
      (price) => {
        const nextPriceData = {
          symbol: price.symbol,
          price: price.price,
          change: price.change,
          changePct: price.changePct,
          high: price.high,
          low: price.low,
          support1: price.price * 0.995,
          support2: price.price * 0.99,
          resistance1: price.price * 1.005,
          timestamp: price.timestamp,
        };
        setPriceData(nextPriceData);
        setMarketSnapshotAt(saveMarketSnapshot({ priceData: nextPriceData }));
      },
      (error) => {
        console.error('Real-time price error:', error);
      },
      marketRefreshMs
    );

    return cleanup;
  }, [marketRefreshMs, isWeekendMarketClosed]);

  /**
   * 执行AI分析
   */
  const handleAIAnalyze = async () => {
    try {
      if (isWeekendMarketClosed && candles.length === 0 && !priceData) {
        message.warning('周末休市且暂无本地行情缓存，暂不能生成复盘分析');
        return;
      }

      setAnalyzing(true);
      setStreamText('');
      setLastStreamResult(null);
      setStreamStatus('准备行情、事件和信号数据...');
      setStreamStartedAt(Date.now());
      setStreamElapsedSeconds(0);
      message.loading({ content: 'AI正在流式分析市场...', key: 'ai-analysis', duration: 0 });

      const result = await aiService.analyzeMarketStream(
        {
          candles: candles.slice(-100), // 最近100根K线
          currentPrice: getReferencePrice(priceData, candles),
          events: events.slice(0, 10),
          flashes: flashes.slice(0, 10),
          signals: signals.slice(-5),
        },
        {
          onStatus: (status) => setStreamStatus(status),
          onToken: (token) => setStreamText((prev) => `${prev}${token}`),
          onResult: (nextResult) => {
            setLastStreamResult(nextResult);
            setStreamText((prev) => `${prev}${formatStreamResult(nextResult)}`);
          },
          onDone: () => setStreamStatus('分析完成，报告已保存'),
        }
      );

      setAiAnalysis(result);
      setLastStreamResult(result);
      setShowAnalysisButton(false);

      message.success({
        content: result.paperTrading ? 'AI分析完成，四个模拟账号已自动评估！' : 'AI分析完成！',
        key: 'ai-analysis',
        duration: 2,
      });
    } catch (error) {
      console.error('AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : 'AI分析失败';

      if (errorMessage.includes('未配置AI服务')) {
        message.error({
          content: '请先在"AI账号"页面配置DeepSeek API Key',
          key: 'ai-analysis',
          duration: 4,
        });
      } else {
        message.error({ content: errorMessage, key: 'ai-analysis', duration: 3 });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 重置为默认数据
   */
  const handleResetAnalysis = () => {
    setAiAnalysis(null);
    setStreamText('');
    setStreamStatus('等待发起分析');
    setStreamStartedAt(null);
    setStreamElapsedSeconds(0);
    setLastStreamResult(null);
    setShowAnalysisButton(true);
    message.info('已重置为默认数据');
  };

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Trading Desk"
        title="客户决策辅助"
        description={isWeekendMarketClosed ? '周末休市，保留复盘、事件准备和风险检查' : '当前建议、风险、关键事件和交易计划'}
        meta={(
          <Space size={8}>
            <span className={`pill ${isWeekendMarketClosed ? 'amber' : 'green'}`}>
              {isWeekendMarketClosed ? '周末休市' : `行情${formatRefreshLabel(marketRefreshMs)}`}
            </span>
            <span className="pill blue">消息1小时刷新</span>
            <span className="date-text">{todayText}</span>
          </Space>
        )}
        actions={showAnalysisButton ? (
          <Button
            type="primary"
            icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
            onClick={handleAIAnalyze}
            disabled={!canRunAIAnalysis}
          >
            {analyzing ? '分析中...' : isWeekendMarketClosed ? 'AI 周末复盘' : 'AI 智能分析'}
          </Button>
        ) : (
          <Button onClick={handleResetAnalysis}>
            重新分析
          </Button>
        )}
      />

      <ClientDecisionBoard
        view={clientDecisionView}
        analyzing={analyzing}
        canAnalyze={canRunAIAnalysis}
        onAnalyze={handleAIAnalyze}
        onReset={handleResetAnalysis}
        hasAnalysis={Boolean(aiAnalysis)}
        isWeekendMarketClosed={isWeekendMarketClosed}
      />

      {/* 主内容区 - 左边行情佐证，右边事件和风险 */}
      <main className="main home-main">
        {/* 左侧区域：实时行情K线图 */}
        <section className="left" aria-label="实时行情K线图">
          {/* 市场卡片 - 报价条 + K线图 */}
          <article className={`market-card chart-panel ${isWeekendMarketClosed && candles.length === 0 ? 'weekend-compact' : ''}`}>
            {/* 报价条 */}
            <div className="quote-strip">
              <PriceCard
                priceData={priceData}
                marketClosed={isWeekendMarketClosed}
                snapshotText={marketSnapshotText}
              />
            </div>

            {/* K线图 */}
            {candlesError && !isWeekendMarketClosed ? (
              <div style={{
                height: '500px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ef4444',
                fontSize: '16px'
              }}>
                <WarningOutlined style={{ fontSize: '38px', marginBottom: '16px' }} />
                <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>K线数据获取失败</div>
                <div style={{ color: '#666' }}>{candlesError}</div>
                <div style={{ marginTop: '16px', fontSize: '14px', color: '#888' }}>
                  请检查数据源设置或稍后重试
                </div>
              </div>
            ) : (
              <Chart
                candles={candles}
                signals={signals}
                period={period}
                currentPrice={priceData?.price}
                marketClosed={isWeekendMarketClosed}
                closedMessage={getClosedMarketChartMessage(period, candles.length)}
                onPeriodChange={(p) => setPeriod(p as Period)}
              />
            )}
          </article>

          <div className="home-under-chart" aria-label="市场信息流">
            {isWeekendMarketClosed ? (
              <div className="home-weekend-brief-grid">
                <WeekendBriefCard
                  snapshotText={marketSnapshotText}
                  nextTradingDayText={nextTradingDayText}
                  sourceLinks={importantEvents?.sourceLinks}
                />
                <ImportantCalendarCard
                  title="下周重要数据"
                  badge="未来7天"
                  meta={importantMeta}
                  showValues
                  items={importantEvents?.weekData || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无下周交易日美国四星以上真实数据"
                />
                <ImportantCalendarCard
                  title="下周重要事项"
                  badge="未来7天"
                  meta={importantMeta}
                  items={importantEvents?.weekEvents || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无下周交易日美国三星以上真实事项"
                />
                <MiniCard
                  title="市场快讯"
                  pillText={getDataMetaLabel(newsMeta, '1小时刷新')}
                  pillColor={getDataMetaColor(newsMeta, 'red')}
                  items={flashes.slice(0, 3).map(f => ({
                    date: f.date,
                    time: f.time,
                    text: f.text,
                    hot: f.hot,
                    source: f.source,
                    sourceUrl: f.sourceUrl,
                  }))}
                />
              </div>
            ) : (
              <div className="home-important-grid">
                <ImportantCalendarCard
                  title="今日重要数据"
                  badge="四星以上"
                  meta={importantMeta}
                  showValues
                  items={importantEvents?.todayData || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无18:00后美国四星以上真实数据"
                />
                <ImportantCalendarCard
                  title="今日重要事项"
                  badge="三星以上"
                  meta={importantMeta}
                  items={importantEvents?.todayEvents || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无18:00-05:00美国三星以上真实事项"
                />
                <ImportantCalendarCard
                  title="本周重要数据"
                  badge="未来7天"
                  meta={importantMeta}
                  showValues
                  items={importantEvents?.weekData || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无本周美国四星以上真实数据"
                />
                <ImportantCalendarCard
                  title="本周重要事项"
                  badge="未来7天"
                  meta={importantMeta}
                  items={importantEvents?.weekEvents || []}
                  sourceLinks={importantEvents?.sourceLinks}
                  emptyText="暂无本周美国三星以上真实事项"
                />
                <MiniCard
                  title="实时市场快讯"
                  pillText={getDataMetaLabel(newsMeta, '1小时刷新')}
                  pillColor={getDataMetaColor(newsMeta, 'red')}
                  items={flashes.slice(0, 3).map(f => ({
                    date: f.date,
                    time: f.time,
                    text: f.text,
                    hot: f.hot,
                    source: f.source,
                    sourceUrl: f.sourceUrl,
                  }))}
                />
              </div>
            )}

            <div className={`home-feed-grid ${showCalendarDetail ? '' : 'no-calendar'}`}>
              {showCalendarDetail && (
                <EventList
                  events={events}
                  flashes={[]}
                  showFlashes={false}
                  title="本周美国重要日历明细"
                />
              )}
              <EventList events={[]} flashes={flashes} showEvents={false} />
              <ActionPanel actions={aiActions} />
            </div>
          </div>
        </section>

        {/* 右侧区域：客户关注点 */}
        <section className="right" aria-label="客户关注点">
          <ClientEventTimeline
            importantEvents={importantEvents}
            flashes={flashes}
            isWeekendMarketClosed={isWeekendMarketClosed}
          />

          <ClientRiskChecklist items={clientDecisionView.watchItems} />

          {(analyzing || streamText || lastStreamResult) && (
            <Card
              className="workspace-card"
              title="AI回复看板"
              extra={(
                <Space wrap size={6}>
                  <Tag color={analyzing ? 'processing' : 'success'}>{streamStatus}</Tag>
                  <Tag color={streamCharCount > 0 ? 'blue' : 'default'}>已输出 {streamCharCount} 字</Tag>
                  <Tag color="geekblue">{streamTimeText}</Tag>
                </Space>
              )}
            >
              <Alert
                type={streamCharCount > 0 ? 'success' : 'info'}
                showIcon
                message={streamProgressText}
                style={{ marginBottom: 12 }}
              />
              {lastStreamResult && (
                <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>
                    {lastStreamResult.decision.headline}
                  </div>
                  <div style={{ color: '#475569', lineHeight: 1.7 }}>
                    {lastStreamResult.decision.summary}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">上涨概率</div>
                      <div className="metric-tile-value red" style={{ fontSize: 18 }}>{lastStreamResult.probability.upProb}%</div>
                    </div>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">下跌概率</div>
                      <div className="metric-tile-value green" style={{ fontSize: 18 }}>{lastStreamResult.probability.downProb}%</div>
                    </div>
                    <div className="metric-tile" style={{ padding: 10 }}>
                      <div className="metric-tile-label">风险</div>
                      <div className="metric-tile-value" style={{ fontSize: 18 }}>{lastStreamResult.risk.risk}</div>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    {lastStreamResult.actions.map((action) => (
                      <div key={action.title} className="action-item">
                        <strong>{action.title}</strong>
                        <div className="sub">{action.text}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details open={analyzing || !lastStreamResult}>
                <summary style={{ cursor: 'pointer', color: '#2563eb', fontWeight: 600, marginBottom: 8 }}>
                  {lastStreamResult ? '查看原始模型输出' : '模型输出'}
                </summary>
                <div
                  style={{
                    minHeight: 140,
                    maxHeight: 260,
                    overflow: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    lineHeight: 1.72,
                    border: '1px solid #dbe6f2',
                    borderRadius: 8,
                    background: '#f8fbff',
                    padding: 16,
                  }}
                >
                  {streamText || `等待模型开始输出...\n${streamProgressText}`}
                </div>
              </details>
            </Card>
          )}

          <details className="client-detail-toggle">
            <summary>专业指标</summary>
            <div className="client-detail-stack">
              {isWeekendMarketClosed ? (
                <WeekendMarketPanel
                  snapshotText={marketSnapshotText}
                  nextTradingDayText={nextTradingDayText}
                />
              ) : (
                <SignalPanel signals={signals} stats={stats} />
              )}

              <DecisionCard
                headline={decisionData.headline}
                summary={decisionData.summary}
                eventCountdown={decisionData.eventCountdown}
                aiReason={decisionData.aiReason}
              />

              {!isWeekendMarketClosed && (
                <div className="info-grid">
                  <ProbCard
                    upProb={stats.upProb || 50}
                    downProb={stats.downProb || 50}
                  />

                  <RiskCard
                    risk={stats.risk || 50}
                    riskLevel={stats.riskLevel || 'medium'}
                    positionAdvice={stats.positionAdvice || 0}
                    stopLoss={stats.stopLoss || 0}
                  />

                  {priceData?.support1 && priceData?.support2 && priceData?.resistance1 ? (
                    <SupportCard
                      support1={priceData.support1}
                      support2={priceData.support2}
                      resistance1={priceData.resistance1}
                    />
                  ) : (
                    <article className="card support-empty-card">
                      <div className="card-title">
                        <strong>当前行情支撑压力</strong>
                        <span className="pill amber">待行情</span>
                      </div>
                      <div className="empty-state">暂无真实支撑压力数据，等待实时行情恢复后显示。</div>
                    </article>
                  )}
                </div>
              )}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
