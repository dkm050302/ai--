import { useEffect, useMemo, useState } from 'react';
import dayjs, { type Dayjs } from 'dayjs';
import { Alert, Button, Card, Col, DatePicker, Descriptions, Input, InputNumber, Modal, Progress, Row, Select, Space, Statistic, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CopyOutlined, ExperimentOutlined, FundProjectionScreenOutlined, LoadingOutlined, ReloadOutlined, RiseOutlined, RobotOutlined, SearchOutlined, UndoOutlined } from '@ant-design/icons';
import { researchApi, type AnalysisReport, type BacktestConfig, type BacktestProfileResult, type BacktestRun, type PaperAccount, type PaperTrade, type QuantChain, type QuantInterventionMode, type ResearchSummary, type StrategyDefinition, type StrategyLabOverview, type StrategyOverride, type StrategyRuntimeResult, type StrategyRuntimeRun, type StrategyScreenRun, type StrategySettingSuggestion } from '@/services/research';
import { aiService, type AIAnalysisResult } from '@/services/ai';
import { dataApi, type EconomicEvent, type MarketFlash } from '@/services/data';
import { fetchCandles, fetchRealTimePrice } from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import { EquityCurveChart, type EquityCurveSeries } from '@/components/EquityCurveChart';
import { PageHeader } from '@/components/PageHeader';
import { GOLD_STRATEGY_LIBRARY, getStrategyDecision, type GoldStrategy } from '@/constants/goldStrategies';
import { prependStoredRobot, type TradingRobot } from '@/services/robotStore';

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;
const INITIAL_BALANCE = 1_000_000;
const STRATEGY_TRADER_CAPITAL = 1_000_000;
const STRATEGY_TRADER_TOTAL_CAPITAL = GOLD_STRATEGY_LIBRARY.length * STRATEGY_TRADER_CAPITAL;
const LONG_SCREEN_MAX_LIMIT = 600_000;
const SCREEN_PERIODS = ['5m', '15m', '1h', '4h', '1d'];
const SCREEN_PERIOD_LABELS: Record<string, string> = {
  '5m': '5分钟 / 长样本',
  '15m': '15分钟 / 长样本',
  '1h': '1小时 / 长样本',
  '4h': '4小时 / 长样本',
  '1d': '日线 / 长样本',
};
const SCREEN_PERIOD_FALLBACK_LIMITS: Record<string, number> = {
  '5m': 50000,
  '15m': 50000,
  '1h': 3000,
  '4h': 3000,
  '1d': 1825,
};
const BARS_PER_TRADING_DAY: Record<string, number> = {
  '5m': 288,
  '15m': 96,
  '1h': 24,
  '4h': 6,
  '1d': 1,
};

type HistoryCacheItem = StrategyLabOverview['historyCaches'][number];
type ScreenDateRange = [Dayjs, Dayjs] | null;
type StrategyDisplayGroup = 'profit' | 'loss' | 'watching' | 'paused';
type StrategySelectionLabel = StrategyRuntimeResult['selectionLabel'];
type StrategyRuntimeCard = GoldStrategy & {
  runtime: StrategyRuntimeResult | null;
  capital: number;
  equity: number;
  pnl: number;
  pnlPct: number;
  portfolioGroup: StrategyDisplayGroup;
  selectionLabel: StrategySelectionLabel;
  riskReason: string;
  stableForAiTrader: boolean;
  consecutiveLosses: number;
  decision: '运行' | '观察' | '暂停';
};

const strategyGroupMeta: Record<StrategyDisplayGroup, { label: string; hint: string; color: string }> = {
  profit: { label: '盈利策略', hint: '可进入AI交易员候选池', color: 'success' },
  loss: { label: '亏损策略', hint: '风控员降权观察', color: 'error' },
  watching: { label: '观察策略', hint: '样本或稳定性不足', color: 'warning' },
  paused: { label: '暂停/冻结', hint: '暂不允许开仓', color: 'default' },
};

const strategyGroupOrder: StrategyDisplayGroup[] = ['profit', 'loss', 'watching', 'paused'];

const selectionLabelText: Record<string, string> = {
  selected: 'AI精选',
  candidate: '候选',
  watching: '观察',
  downgraded: '降权',
  frozen: '冻结',
};

const selectionLabelColor: Record<string, string> = {
  selected: 'success',
  candidate: 'blue',
  watching: 'warning',
  downgraded: 'orange',
  frozen: 'default',
};

const customerRobotRiskLabel: Record<string, string> = {
  防守: '低风险',
  稳健: '稳健',
  中风险: '中风险',
  激进: '高风险',
  暴利: '高风险',
};

function formatMoney(value: number): string {
  return `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function periodLabel(period?: string): string {
  const labels: Record<string, string> = {
    '1m': '1分钟',
    '5m': '5分钟',
    '15m': '15分钟',
    '1h': '1小时',
    '4h': '4小时',
    '1d': '日线',
  };
  return labels[period || ''] || period || '-';
}

function formatRatio(value?: number): string {
  return `${((Number(value) || 0) * 100).toFixed(1)}%`;
}

function getTradableCount(history?: HistoryCacheItem): number {
  return Number(history?.session?.tradableCount || history?.candleCount || 0);
}

function describeActualSpan(history?: HistoryCacheItem): string {
  if (!history?.startTime || !history?.endTime) return '暂无跨度';
  const start = new Date(history.startTime).getTime();
  const end = new Date(history.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return '暂无跨度';

  const days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
  if (days >= 365) return `约${(days / 365).toFixed(1)}年`;
  if (days >= 30) return `约${Math.round(days / 30)}个月`;
  return `约${days}天`;
}

function describeLimitSpan(period: string, limit: number): string {
  const barsPerDay = BARS_PER_TRADING_DAY[period] || 1;
  const tradingDays = Math.max(1, limit / barsPerDay);
  if (tradingDays >= 252) return `约${(tradingDays / 252).toFixed(1)}年交易日`;
  if (tradingDays >= 25) return `约${Math.round(tradingDays / 5)}周`;
  return `约${Math.round(tradingDays)}个交易日`;
}

function getDefaultScreenLimit(period: string, history?: HistoryCacheItem): number {
  const fallback = SCREEN_PERIOD_FALLBACK_LIMITS[period] || 3000;
  const available = getTradableCount(history);
  if (!available) return fallback;
  return Math.min(available, LONG_SCREEN_MAX_LIMIT);
}

function getHistoryDateRange(history?: HistoryCacheItem): ScreenDateRange {
  if (!history?.startTime || !history?.endTime) return null;
  const start = dayjs(history.startTime);
  const end = dayjs(history.endTime);
  if (!start.isValid() || !end.isValid() || !end.isAfter(start)) return null;
  return [start, end];
}

function formatPickerRange(range: ScreenDateRange): string {
  if (!range) return '未指定时间窗口';
  return `${range[0].format('YYYY/MM/DD HH:mm')} - ${range[1].format('YYYY/MM/DD HH:mm')}`;
}

function directionTag(direction?: 'long' | 'short') {
  if (!direction) return <Tag>无方向</Tag>;
  return direction === 'long' ? <Tag color="red">做多</Tag> : <Tag color="green">做空</Tag>;
}

function statusTag(status?: PaperTrade['status']) {
  if (status === 'open') return <Tag color="processing">持仓中</Tag>;
  if (status === 'closed') return <Tag color="default">已平仓</Tag>;
  if (status === 'skipped') return <Tag color="warning">跳过</Tag>;
  if (status === 'held') return <Tag color="blue">继续持有</Tag>;
  return <Tag>未知</Tag>;
}

function quantStatusColor(status: string): string {
  if (['已接入', '已运行', '可执行', '正常运行'].includes(status)) return 'success';
  if (['待接入', '待数据', '等待报告', '待回测'].includes(status)) return 'warning';
  if (['已暂停', '暂停开新仓'].includes(status)) return 'error';
  return 'processing';
}

function riskColor(level?: string): 'success' | 'normal' | 'exception' {
  if (level === 'low') return 'success';
  if (level === 'high') return 'exception';
  return 'normal';
}

function toSeconds(value?: string): number {
  if (!value) return Math.floor(Date.now() / 1000);
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : Math.floor(Date.now() / 1000);
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

const profileOrder: Record<string, number> = {
  conservative: 0,
  balanced: 1,
  aggressive: 2,
  event: 3,
};

const profileColors: Record<string, string> = {
  conservative: '#2563eb',
  balanced: '#16a34a',
  aggressive: '#dc2626',
  event: '#7c3aed',
};

const quantPipeline = [
  {
    title: '新闻与事件 Alpha',
    tools: 'LLM / RAG / 新闻情绪',
    status: '已接入',
    text: '东方财富快讯、经济日历和AI报告形成方向、概率、风险三类输入。',
  },
  {
    title: '市场状态识别',
    tools: 'HMM / Markov / Kalman',
    status: '待接入',
    text: '识别趋势、震荡、高波动状态，决定高抛低吸或趋势跟随是否开启。',
  },
  {
    title: '资金权重优化',
    tools: 'Black-Litterman / Convex',
    status: '规划中',
    text: '把AI观点和回测表现翻译成策略权重，约束最大回撤、单笔风险和仓位上限。',
  },
  {
    title: '执行与干预',
    tools: 'MCTS / 网格拆单 / 人工确认',
    status: '规划中',
    text: '把100万拆成多份，在不同价位执行高抛低吸，允许人工或大模型暂停、减仓、换策略。',
  },
];

const allocationDraft = [
  { profileId: 'conservative', name: '保守型', weight: 20, role: '防守仓，低风险过滤' },
  { profileId: 'balanced', name: '稳健型', weight: 35, role: '主仓，趋势确认后参与' },
  { profileId: 'aggressive', name: '进取型', weight: 25, role: '弹性仓，捕捉强信号' },
  { profileId: 'event', name: '事件型', weight: 20, role: '新闻/事件驱动机会' },
];

const roadmap = [
  'V0：用现有AI报告驱动四账号模拟盘与回测，模拟资金池统一为100万。',
  'V1：增加策略参数面板，支持不同风险偏好、滑点、手续费、止盈止损组合批量回测。',
  'V2：接入HMM/马尔科夫状态识别，按趋势/震荡切换策略开关。',
  'V3：接入凸优化资金分配，基于回测收益、波动、回撤和AI观点自动给权重。',
];

interface BacktestPreset {
  id: string;
  name: string;
  description: string;
  config: Partial<BacktestConfig>;
}

const backtestPresets: BacktestPreset[] = [
  {
    id: 'baseline',
    name: '基准短线',
    description: '1分钟K线、8根K持仓，作为当前默认策略基线。',
    config: { period: '1m', limit: 360, exitBars: 8, slippagePct: 0.03, commissionPct: 0.01 },
  },
  {
    id: 'friction',
    name: '高摩擦压力',
    description: '滑点和手续费翻倍，用来筛掉纸面收益脆弱的组合。',
    config: { period: '1m', limit: 360, exitBars: 8, slippagePct: 0.08, commissionPct: 0.03 },
  },
  {
    id: 'swing',
    name: '波段持有',
    description: '5分钟K线、16根K持仓，验证稍长周期的方向稳定性。',
    config: { period: '5m', limit: 480, exitBars: 16, slippagePct: 0.04, commissionPct: 0.01 },
  },
  {
    id: 'fast',
    name: '快进快出',
    description: '更短持仓窗口，观察高抛低吸是否容易被成本吞掉。',
    config: { period: '1m', limit: 240, exitBars: 4, slippagePct: 0.03, commissionPct: 0.01 },
  },
];

interface TradeRecord extends PaperTrade {
  key: string;
  accountName: string;
  profileId: PaperAccount['profileId'];
}

export function ResearchCenter() {
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [latestReport, setLatestReport] = useState<AnalysisReport | null>(null);
  const [reports, setReports] = useState<AnalysisReport[]>([]);
  const [accounts, setAccounts] = useState<PaperAccount[]>([]);
  const [latestBacktest, setLatestBacktest] = useState<BacktestRun | null>(null);
  const [markPrice, setMarkPrice] = useState<number | null>(null);
  const [autoTrading, setAutoTrading] = useState<ResearchSummary['autoTrading']>(undefined);
  const [analyzing, setAnalyzing] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [streamStatus, setStreamStatus] = useState('等待发起分析');
  const [streamStartedAt, setStreamStartedAt] = useState<number | null>(null);
  const [streamElapsedSeconds, setStreamElapsedSeconds] = useState(0);
  const [lastStreamResult, setLastStreamResult] = useState<AIAnalysisResult | null>(null);
  const [backtestPeriod, setBacktestPeriod] = useState('1m');
  const [backtestLimit, setBacktestLimit] = useState(240);
  const [backtestExitBars, setBacktestExitBars] = useState(8);
  const [backtestSlippagePct, setBacktestSlippagePct] = useState(0.03);
  const [backtestCommissionPct, setBacktestCommissionPct] = useState(0.01);
  const [batchBacktesting, setBatchBacktesting] = useState(false);
  const [batchBacktests, setBatchBacktests] = useState<Array<{ preset: BacktestPreset; run: BacktestRun }>>([]);
  const [quantChain, setQuantChain] = useState<QuantChain | null>(null);
  const [interventionMode, setInterventionMode] = useState<QuantInterventionMode>('normal');
  const [interventionNote, setInterventionNote] = useState('');
  const [interventionSaving, setInterventionSaving] = useState(false);
  const [strategyOverview, setStrategyOverview] = useState<StrategyLabOverview | null>(null);
  const [latestStrategyRun, setLatestStrategyRun] = useState<StrategyScreenRun | null>(null);
  const [strategyRuns, setStrategyRuns] = useState<StrategyScreenRun[]>([]);
  const [strategyScreening, setStrategyScreening] = useState(false);
  const [screenPeriod, setScreenPeriod] = useState('1d');
  const [screenLimit, setScreenLimit] = useState(1825);
  const [screenDateRange, setScreenDateRange] = useState<ScreenDateRange>(null);
  const [screenDateRangeTouched, setScreenDateRangeTouched] = useState(false);
  const [strategyDefinitions, setStrategyDefinitions] = useState<StrategyDefinition[]>([]);
  const [strategyOverrides, setStrategyOverrides] = useState<Record<string, Record<string, number>>>({});
  const [strategySuggestion, setStrategySuggestion] = useState<StrategySettingSuggestion['suggestion'] | null>(null);
  const [strategySuggesting, setStrategySuggesting] = useState(false);
  const [strategyRuntimeRun, setStrategyRuntimeRun] = useState<StrategyRuntimeRun | null>(null);
  const [strategyRuntimeRunning, setStrategyRuntimeRunning] = useState(false);
  const [strategyAnalysisTarget, setStrategyAnalysisTarget] = useState<StrategyRuntimeCard | null>(null);

  const applyQuantChain = (chain: QuantChain | null) => {
    setQuantChain(chain);
    if (chain?.execution) {
      setInterventionMode(chain.execution.mode);
      setInterventionNote(chain.execution.note || '');
    }
  };

  const refreshQuantChain = async () => {
    const chain = await researchApi.getQuantChain();
    applyQuantChain(chain);
    return chain;
  };

  const loadSummary = async () => {
    try {
      setLoading(true);
      const [summary, reportList, chain, strategyLab, definitions, screenRuns] = await Promise.all([
        researchApi.getSummary(),
        researchApi.getReports(),
        researchApi.getQuantChain().catch(() => null),
        researchApi.getStrategyLabOverview().catch(() => null),
        researchApi.getStrategyDefinitions().catch(() => []),
        researchApi.getStrategyScreenRuns().catch(() => []),
      ]);
      setLatestReport(summary.latestReport);
      setReports(reportList);
      setAccounts(summary.accounts || []);
      setLatestBacktest(summary.latestBacktest);
      setMarkPrice(summary.markPrice ?? null);
      setAutoTrading(summary.autoTrading);
      applyQuantChain(chain);
      setStrategyOverview(strategyLab);
      setLatestStrategyRun(strategyLab?.latestScreenRun || null);
      setStrategyRuntimeRun(strategyLab?.latestRuntimeRun || null);
      setStrategyRuns(screenRuns);
      setStrategyDefinitions(definitions);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '加载研究中心失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSummary();
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

  const confidence = useMemo(() => {
    if (!latestReport) return 0;
    const up = Number(latestReport.result.probability.upProb || 0);
    const down = Number(latestReport.result.probability.downProb || 0);
    return Math.abs(up - down);
  }, [latestReport]);

  const orderedAccounts = useMemo(
    () => [...accounts].sort((a, b) => profileOrder[a.profileId] - profileOrder[b.profileId]),
    [accounts]
  );

  const reportById = useMemo(() => {
    const map = new Map<string, AnalysisReport>();
    reports.forEach((report) => map.set(report._id, report));
    return map;
  }, [reports]);

  const tradeRows = useMemo<TradeRecord[]>(() => {
    return orderedAccounts
      .flatMap((account) =>
        (account.tradeLog || []).map((trade, index) => ({
          ...trade,
          key: `${account.profileId}-${trade.openedAt}-${index}`,
          accountName: account.name,
          profileId: account.profileId,
        }))
      )
      .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  }, [orderedAccounts]);

  const historyCaches = useMemo(() => {
    const periodOrder: Record<string, number> = {
      '1m': 1,
      '5m': 2,
      '15m': 3,
      '1h': 4,
      '4h': 5,
      '1d': 6,
    };

    return [...(strategyOverview?.historyCaches || [])].sort((a, b) => {
      const byPeriod = (periodOrder[a.period] || 99) - (periodOrder[b.period] || 99);
      if (byPeriod !== 0) return byPeriod;
      return Number(b.candleCount || 0) - Number(a.candleCount || 0);
    });
  }, [strategyOverview]);

  const historyByPeriod = useMemo(() => {
    const map = new Map<string, HistoryCacheItem>();
    historyCaches.forEach((history) => {
      const existing = map.get(history.period);
      if (!existing || getTradableCount(history) > getTradableCount(existing)) {
        map.set(history.period, history);
      }
    });
    return map;
  }, [historyCaches]);

  const selectedScreenHistory = historyByPeriod.get(screenPeriod);
  const selectedAvailableCount = getTradableCount(selectedScreenHistory);
  const screenLimitMax = Math.max(220, Math.min(selectedAvailableCount || LONG_SCREEN_MAX_LIMIT, LONG_SCREEN_MAX_LIMIT));
  const selectedHistoryRange = useMemo(() => getHistoryDateRange(selectedScreenHistory), [selectedScreenHistory]);
  const screenPeriodOptions = useMemo(() => {
    return SCREEN_PERIODS.map((period) => {
      const history = historyByPeriod.get(period);
      const available = getTradableCount(history);
      const rangeText = history?.startTime && history?.endTime
        ? `${formatDateOnly(history.startTime)} - ${formatDateOnly(history.endTime)}`
        : '暂无历史缓存';

      return {
        value: period,
        label: SCREEN_PERIOD_LABELS[period] || periodLabel(period),
        available,
        rangeText,
        spanText: describeActualSpan(history),
        provider: history?.provider || '等待数据',
      };
    });
  }, [historyByPeriod]);

  useEffect(() => {
    if (!selectedAvailableCount) return;
    setScreenLimit((value) => Math.min(value, screenLimitMax));
  }, [selectedAvailableCount, screenLimitMax]);

  useEffect(() => {
    if (screenDateRangeTouched || !selectedHistoryRange) return;
    setScreenDateRange(selectedHistoryRange);
  }, [screenDateRangeTouched, selectedHistoryRange]);

  const screenRunRows = useMemo(
    () => [...strategyRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [strategyRuns]
  );

  const accountStats = useMemo(() => {
    return orderedAccounts.map((account) => {
      const trades = account.tradeLog || [];
      const closed = trades.filter((trade) => trade.status === 'closed');
      const opened = trades.filter((trade) => trade.status === 'open');
      const skipped = trades.filter((trade) => trade.status === 'skipped');
      const held = trades.filter((trade) => trade.status === 'held');
      const wins = closed.filter((trade) => Number(trade.pnl) > 0);

      return {
        key: account.profileId,
        name: account.name,
        balance: account.balance,
        equity: account.equity,
        realizedPnl: account.realizedPnl,
        total: trades.length,
        open: opened.length,
        skipped: skipped.length,
        held: held.length,
        closed: closed.length,
        winRate: closed.length ? Number(((wins.length / closed.length) * 100).toFixed(1)) : 0,
      };
    });
  }, [orderedAccounts]);

  const researchMetrics = useMemo(() => {
    const totalEquity = orderedAccounts.reduce((sum, account) => sum + Number(account.equity || 0), 0);
    const realizedPnl = orderedAccounts.reduce((sum, account) => sum + Number(account.realizedPnl || 0), 0);
    const openTrades = orderedAccounts.filter((account) => account.openTrade?.status === 'open').length;

    return {
      totalEquity,
      realizedPnl,
      openTrades,
      reportCount: reports.length,
    };
  }, [orderedAccounts, reports.length]);

  const autoTradingDescription = useMemo(() => {
    const intervalMinutes = Math.max(1, Math.round((autoTrading?.intervalMs || 60000) / 60000));

    if (!autoTrading?.lastRunAt) {
      return `后端已配置为每 ${intervalMinutes} 分钟自动读取一次行情，生成报告后会自动评估四个模拟账号。`;
    }

    const priceText = autoTrading.lastPrice ? `，最近结算价 ${autoTrading.lastPrice.toFixed(2)}` : '';
    const sourceText = autoTrading.lastSource ? `，来源 ${autoTrading.lastSource}` : '';
    return `后端每 ${intervalMinutes} 分钟自动盯市，最近运行 ${formatDate(autoTrading.lastRunAt)}${priceText}${sourceText}。`;
  }, [autoTrading]);

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

  const strategyLibraryRows = useMemo<StrategyRuntimeCard[]>(() => {
    const runtimeMap = new Map((strategyRuntimeRun?.strategyResults || []).map((runtime) => [runtime.strategyId, runtime]));
    return GOLD_STRATEGY_LIBRARY.map((strategy) => {
      const runtime = runtimeMap.get(strategy.id);
      const fallbackDecision = getStrategyDecision(strategy);
      const decision = runtime?.status === 'running'
        ? '运行'
        : runtime?.status === 'watching'
          ? '观察'
          : runtime?.status === 'paused'
            ? '暂停'
            : fallbackDecision;
      const capital = runtime?.allocatedCapital || STRATEGY_TRADER_CAPITAL;
      return {
        ...strategy,
        runtime: runtime || null,
        capital,
        equity: runtime?.endingEquity || capital,
        pnl: runtime?.pnl || 0,
        pnlPct: runtime?.pnlPct || 0,
        portfolioGroup: (runtime?.portfolioGroup || (decision === '暂停' ? 'paused' : 'watching')) as StrategyDisplayGroup,
        selectionLabel: (runtime?.selectionLabel || (decision === '暂停' ? 'frozen' : 'watching')) as StrategySelectionLabel,
        riskReason: runtime?.riskReason || '等待后端生成逐笔模拟交易、权益曲线和每日结算记录',
        stableForAiTrader: Boolean(runtime?.stableForAiTrader),
        consecutiveLosses: runtime?.consecutiveLosses || 0,
        decision,
      };
    });
  }, [strategyRuntimeRun]);

  const strategyRuntimeSummary = useMemo(() => {
    const summary = strategyRuntimeRun?.summary;
    const counts = strategyLibraryRows.reduce<Record<StrategyDisplayGroup, number>>((acc, strategy) => {
      acc[strategy.portfolioGroup] += 1;
      return acc;
    }, { profit: 0, loss: 0, watching: 0, paused: 0 });
    const totalStartingCapital = summary?.totalStartingCapital ?? STRATEGY_TRADER_TOTAL_CAPITAL;
    const totalEquity = summary?.totalEquity ?? totalStartingCapital;
    const totalPnl = summary?.totalPnl ?? Number((totalEquity - totalStartingCapital).toFixed(2));

    return {
      totalStartingCapital,
      strategyStartingCapital: summary?.strategyStartingCapital ?? STRATEGY_TRADER_CAPITAL,
      profitCount: summary?.profitCount ?? counts.profit,
      lossCount: summary?.lossCount ?? counts.loss,
      watchingCount: summary?.watchingCount ?? counts.watching,
      pausedCount: summary?.pausedCount ?? counts.paused,
      runningCount: summary?.runningCount || 0,
      observingCount: summary?.watchingCount ?? counts.watching,
      selectedCount: summary?.selectedCount || 0,
      downgradedCount: summary?.downgradedCount || 0,
      frozenCount: summary?.frozenCount ?? counts.paused,
      totalPnl,
      totalEquity,
      openPositions: summary?.openPositions || 0,
      totalTrades: summary?.totalTrades || 0,
      totalPnlPct: summary?.totalPnlPct ?? (totalStartingCapital > 0 ? Number(((totalPnl / totalStartingCapital) * 100).toFixed(2)) : 0),
      dataStart: strategyRuntimeRun?.dataStart,
      dataEnd: strategyRuntimeRun?.dataEnd,
      updatedAt: strategyRuntimeRun?.updatedAt || strategyRuntimeRun?.createdAt,
    };
  }, [strategyLibraryRows, strategyRuntimeRun]);

  const strategyGroupedRows = useMemo(() => {
    return strategyGroupOrder.map((group) => ({
      group,
      ...strategyGroupMeta[group],
      rows: strategyLibraryRows.filter((strategy) => strategy.portfolioGroup === group),
    }));
  }, [strategyLibraryRows]);

  const accountEquitySeries = useMemo<EquityCurveSeries[]>(() => {
    return orderedAccounts.map((account) => {
      const snapshots = [...(account.equitySnapshots || [])]
        .sort((a, b) => toSeconds(a.time) - toSeconds(b.time));

      if (snapshots.length > 0) {
        const snapshotData = snapshots.map((snapshot) => ({
          time: toSeconds(snapshot.time),
          value: Number(snapshot.equity || account.equity || INITIAL_BALANCE),
        }));

        const data = snapshotData.length === 1
          ? [{ time: snapshotData[0].time - 60, value: INITIAL_BALANCE }, ...snapshotData]
          : snapshotData;

        return {
          id: account.profileId,
          name: account.name,
          color: profileColors[account.profileId],
          data,
        };
      }

      const chronologicalTrades = [...(account.tradeLog || [])]
        .sort((a, b) => toSeconds(a.openedAt) - toSeconds(b.openedAt));
      const firstTime = chronologicalTrades[0]?.openedAt
        ? toSeconds(chronologicalTrades[0].openedAt) - 60
        : toSeconds(account.updatedAt) - 60;
      let realizedEquity = INITIAL_BALANCE;
      const data = [{ time: firstTime, value: realizedEquity }];

      chronologicalTrades.forEach((trade) => {
        if (trade.status === 'closed') {
          realizedEquity = Number((realizedEquity + Number(trade.pnl || 0)).toFixed(2));
          data.push({
            time: toSeconds(trade.closedAt || trade.openedAt),
            value: realizedEquity,
          });
        }

        if (trade.status === 'held') {
          data.push({
            time: toSeconds(trade.openedAt),
            value: Number((account.balance + Number(trade.pnl || 0)).toFixed(2)),
          });
        }
      });

      data.push({
        time: toSeconds(account.updatedAt),
        value: Number(account.equity || account.balance || INITIAL_BALANCE),
      });

      return {
        id: account.profileId,
        name: account.name,
        color: profileColors[account.profileId],
        data,
      };
    });
  }, [orderedAccounts]);

  const backtestEquitySeries = useMemo<EquityCurveSeries[]>(() => {
    return (latestBacktest?.results || [])
      .filter((result) => result.equityCurve && result.equityCurve.length > 0)
      .map((result) => ({
        id: result.profileId,
        name: result.name,
        color: profileColors[result.profileId] || '#2563eb',
        data: (result.equityCurve || []).map((point) => ({
          time: point.time,
          value: point.equity,
        })),
      }));
  }, [latestBacktest]);

  const allocationSuggestion = useMemo(() => {
    if (quantChain?.allocation?.length) {
      return quantChain.allocation.map((item) => ({
        ...item,
        weight: item.baseWeight,
        suggestedWeight: item.suggestedWeight,
        basis: item.basis,
      }));
    }

    const latestResults = latestBacktest?.results || [];
    const scored = allocationDraft.map((item) => {
      const result = latestResults.find((entry) => entry.profileId === item.profileId);
      if (!result) {
        return {
          ...item,
          suggestedWeight: item.weight,
          score: 0,
          basis: '人工初始',
        };
      }

      const robustness = Math.max(0, Number(result.robustnessScore || 0)) / 100;
      const profitFactor = Math.min(Math.max(Number(result.profitFactor || 0), 0), 3) / 3;
      const netPnlScore = Number(result.netPnl || 0) > 0 ? 1 : 0;
      const drawdownPenalty = Math.max(0.25, 1 - Math.min(Number(result.maxDrawdown || 0), 50) / 60);
      const samplePenalty = result.sampleWarning ? 0.5 : 1;
      const score = Number(((robustness * 0.45 + profitFactor * 0.35 + netPnlScore * 0.2) * drawdownPenalty * samplePenalty).toFixed(4));

      return {
        ...item,
        suggestedWeight: item.weight,
        score,
        basis: `稳健度${result.robustnessScore || 0}% / PF ${Number(result.profitFactor || 0).toFixed(2)} / 回撤${Number(result.maxDrawdown || 0).toFixed(1)}%`,
      };
    });

    const totalScore = scored.reduce((sum, item) => sum + item.score, 0);
    if (totalScore <= 0) {
      return scored;
    }

    return scored.map((item) => ({
      ...item,
      suggestedWeight: Number(((item.score / totalScore) * 100).toFixed(1)),
      basis: item.basis,
    }));
  }, [latestBacktest, quantChain]);

  const quantPipelineView = useMemo(() => {
    const alphaStatus = quantChain?.alpha.usable ? '已运行' : latestReport ? '已接入' : '等待报告';
    const marketStatus = quantChain?.marketState.state === 'insufficient_data'
      ? '待数据'
      : quantChain?.marketState
        ? '已运行'
        : '待数据';
    const allocationStatus = quantChain?.allocation?.some((item) => item.score > 0)
      ? '已运行'
      : latestBacktest
        ? '待回测'
        : '待回测';
    const executionStatus = quantChain?.execution.mode === 'paused'
      ? '已暂停'
      : quantChain?.execution.mode === 'reduce_risk'
        ? '减仓运行'
        : '可执行';

    return [
      {
        ...quantPipeline[0],
        status: alphaStatus,
        text: quantChain?.alpha.usable
          ? `${quantChain.alpha.headline}；方向 ${quantChain.alpha.direction === 'long' ? '做多' : quantChain.alpha.direction === 'short' ? '做空' : '中性'}，置信差 ${quantChain.alpha.confidence}，风险 ${quantChain.alpha.riskScore}。`
          : quantPipeline[0].text,
      },
      {
        ...quantPipeline[1],
        status: marketStatus,
        text: quantChain?.marketState
          ? `${quantChain.marketState.stateLabel}；趋势分 ${quantChain.marketState.trendScore}，波动 ${quantChain.marketState.volatilityPct}%。${quantChain.marketState.recommendation}`
          : quantPipeline[1].text,
      },
      {
        ...quantPipeline[2],
        status: allocationStatus,
        text: quantChain?.allocation?.length
          ? '已按回测稳健度、PF、收益、最大回撤和样本惩罚生成权重。'
          : quantPipeline[2].text,
      },
      {
        ...quantPipeline[3],
        status: executionStatus,
        text: quantChain?.execution
          ? `${quantChain.execution.modeLabel}；风险缩放 ${Math.round(quantChain.execution.riskScale * 100)}%。${quantChain.execution.gridHint}`
          : quantPipeline[3].text,
      },
    ];
  }, [latestBacktest, latestReport, quantChain]);

  const handleExecute = async () => {
    try {
      setActing(true);
      const result = await researchApi.executePaperTrading(latestReport?._id);
      setAccounts(result.accounts);
      await refreshQuantChain().catch(() => undefined);
      message.success('四个模拟账号已完成本轮决策');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '模拟交易失败');
    } finally {
      setActing(false);
    }
  };

  const handleSettle = async () => {
    try {
      setActing(true);
      const result = await researchApi.settlePaperAccounts();
      const closedCount = result.settlements.filter((item) => item.action === 'closed').length;
      setAccounts(result.accounts);
      setMarkPrice(result.price);
      await refreshQuantChain().catch(() => undefined);
      message.success(closedCount > 0 ? `已自动平仓 ${closedCount} 笔` : '未触发止盈止损，已更新权益');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '结算持仓失败');
    } finally {
      setActing(false);
    }
  };

  const handleRunStrategyRuntime = async () => {
    try {
      setStrategyRuntimeRunning(true);
      const run = await researchApi.runStrategyRuntime({
        period: '15m',
        limit: 3000,
        initialBalance: STRATEGY_TRADER_CAPITAL,
      });
      setStrategyRuntimeRun(run);
      message.success('40个黄金策略模拟盘已生成并保存');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '策略模拟盘运行失败');
    } finally {
      setStrategyRuntimeRunning(false);
    }
  };

  const handleResetStrategyRuntime = async () => {
    try {
      setStrategyRuntimeRunning(true);
      const run = await researchApi.resetStrategyRuntime();
      setStrategyRuntimeRun(run);
      message.success('策略模拟盘记录已重置并重新生成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重置策略模拟盘失败');
    } finally {
      setStrategyRuntimeRunning(false);
    }
  };

  const buildStrategyLogic = (strategy: StrategyRuntimeCard): string[] => {
    const methodLogic: Record<string, string> = {
      趋势跟踪: '顺主趋势方向开仓，避免逆势接刀；趋势不清晰时降低信号优先级。',
      突破: '等待关键高低点被有效突破后跟随，重点观察突破后的延续能力。',
      均值回归: '价格偏离短期均线或区间边界后等待修复，适合震荡或低波动环境。',
      网格: '围绕日内中轴或波动区间分层试探，必须限制单层仓位和总回撤。',
      马丁: '只允许受限递增加仓，重大数据和高波动窗口必须禁开或降权。',
      剥头皮: '使用短周期动量或衰竭信号快进快出，对交易成本和滑点敏感。',
      事件驱动: '只在数据或快讯窗口后等待方向确认，不在事件前盲目追单。',
      波动率: '利用 ATR、通道或波动扩张判断入场与止盈止损范围。',
      套利过滤: '用美元、美债或相关过滤条件确认黄金方向，减少单一价格信号误判。',
    };

    return [
      methodLogic[strategy.method] || '按策略定义的信号条件执行，先通过风控再进入交易员候选池。',
      `适配环境：${strategy.preferredState}；交易时段：${strategy.session}；周期：${strategy.horizon}。`,
      `核心风格：${strategy.style}，风险分 ${strategy.riskScore}，当前风控意见：${strategy.riskReason}`,
    ];
  };

  const handleCopyStrategyRobot = (strategy: StrategyRuntimeCard) => {
    if (strategy.portfolioGroup !== 'profit' || strategy.pnl <= 0) {
      message.warning('只有盈利策略交易员可以复制成客户机器人');
      return;
    }

    const runtime = strategy.runtime;
    const robot: TradingRobot = {
      id: `copied-${strategy.id}-${Date.now()}`,
      name: `${strategy.name}机器人`,
      strategy: strategy.name,
      symbol: 'XAUUSD',
      market: '黄金',
      risk: customerRobotRiskLabel[strategy.style] || strategy.style,
      tags: ['策略实验室复制', selectionLabelText[strategy.selectionLabel] || strategy.selectionLabel, strategy.style, strategy.method],
      status: 'stopped',
      equity: STRATEGY_TRADER_CAPITAL,
      pnl: 0,
      winRate: runtime?.winRate || 0,
      description: `复制自盈利策略员「${strategy.name}」。模板表现：收益率 ${strategy.pnlPct >= 0 ? '+' : ''}${strategy.pnlPct}%，回撤 ${runtime?.maxDrawdown || 0}%，样本 ${runtime?.trades || 0} 笔。复制后先进入客户机器人列表，启动前继续由AI风控员审核。`,
      createdAt: new Date().toISOString(),
      sourceStrategyId: strategy.id,
      sourceStrategyName: strategy.name,
      sourceSelectionLabel: strategy.selectionLabel,
      sourcePnlPct: strategy.pnlPct,
      sourceMaxDrawdown: runtime?.maxDrawdown || 0,
      sourceTrades: runtime?.trades || 0,
      sourceCopiedAt: new Date().toISOString(),
      operationMode: 'ai_steward',
    };

    prependStoredRobot(robot);
    message.success(`${robot.name} 已复制到 AI交易员 · 我的机器人`);
  };

  const handleAIAnalyze = async () => {
    try {
      setAnalyzing(true);
      setStreamText('');
      setLastStreamResult(null);
      setStreamStatus('准备行情、事件和信号数据...');
      setStreamStartedAt(Date.now());
      setStreamElapsedSeconds(0);
      message.loading({ content: 'AI正在流式分析市场...', key: 'research-ai-analysis', duration: 0 });

      const today = new Date().toISOString().split('T')[0];
      const [candles, priceQuote, calendarRes, newsRes] = await Promise.all([
        fetchCandles('1m', 360),
        fetchRealTimePrice().catch(() => null),
        dataApi.getEconomicCalendar(today).catch(() => ({ success: false, data: [] })),
        dataApi.getMarketNews().catch(() => ({ success: false, data: [] })),
      ]);

      const latestCandle = candles[candles.length - 1];
      const currentPrice = Number(
        priceQuote?.price ||
        latestCandle?.close ||
        markPrice ||
        latestReport?.currentPrice ||
        0
      );
      const detectedSignals = candles.length >= 233 ? detectSignals(candles).slice(-5) : [];
      const analysisEvents = calendarRes.success
        ? calendarRes.data.slice(0, 10).map((item: EconomicEvent) => ({
          date: item.date,
          time: item.time,
          text: `${item.country} ${item.event}`,
          source: item.source,
          sourceUrl: item.sourceUrl,
        }))
        : [];
      const analysisFlashes = newsRes.success
        ? newsRes.data.slice(0, 10).map((item: MarketFlash) => ({
          date: item.date,
          time: item.time,
          hot: item.hot || false,
          text: item.content,
          source: item.source,
          sourceUrl: item.sourceUrl,
        }))
        : [];

      setStreamStatus(`已读取 ${candles.length} 根K线，正在等待模型流式回复...`);

      const result = await aiService.analyzeMarketStream(
        {
          candles: candles.slice(-100),
          currentPrice,
          events: analysisEvents,
          flashes: analysisFlashes,
          signals: detectedSignals,
        },
        {
          onStatus: (status) => setStreamStatus(status),
          onToken: (token) => setStreamText((prev) => `${prev}${token}`),
          onResult: (nextResult) => {
            setLastStreamResult(nextResult);
            setStreamText((prev) => `${prev}${formatStreamResult(nextResult)}`);
          },
          onDone: () => setStreamStatus('分析完成，报告已保存到历史记录'),
        }
      );

      setLastStreamResult(result);
      await loadSummary();

      message.success({
        content: result.paperTrading ? 'AI分析完成，四账号已自动评估' : 'AI分析完成',
        key: 'research-ai-analysis',
        duration: 2,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'AI分析失败';
      setStreamStatus(errorMessage);
      message.error({
        content: errorMessage.includes('未配置AI服务') ? '请先在AI账号页面配置DeepSeek API Key' : errorMessage,
        key: 'research-ai-analysis',
        duration: 4,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleBacktest = async () => {
    try {
      setActing(true);
      const backtest = await researchApi.runBacktest(latestReport?._id, {
        period: backtestPeriod,
        limit: backtestLimit,
        exitBars: backtestExitBars,
        slippagePct: backtestSlippagePct,
        commissionPct: backtestCommissionPct,
      });
      setLatestBacktest(backtest);
      await refreshQuantChain().catch(() => undefined);
      message.success('升级回测完成');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '回测失败');
    } finally {
      setActing(false);
    }
  };

  const handleBatchBacktest = async () => {
    if (!latestReport) {
      message.warning('请先生成或选择一份AI报告');
      return;
    }

    try {
      setBatchBacktesting(true);
      const runs: Array<{ preset: BacktestPreset; run: BacktestRun }> = [];

      for (const preset of backtestPresets) {
        const run = await researchApi.runBacktest(latestReport._id, preset.config);
        runs.push({ preset, run });
      }

      setBatchBacktests(runs);
      setLatestBacktest(runs[runs.length - 1]?.run || null);
      await refreshQuantChain().catch(() => undefined);
      message.success(`已完成 ${runs.length} 组策略组合回测`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '批量回测失败');
    } finally {
      setBatchBacktesting(false);
    }
  };

  const handleInterventionUpdate = async () => {
    try {
      setInterventionSaving(true);
      const chain = await researchApi.updateQuantIntervention(interventionMode, interventionNote);
      applyQuantChain(chain);
      message.success(`干预模式已切换为：${chain.execution.modeLabel}`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '保存干预失败');
    } finally {
      setInterventionSaving(false);
    }
  };

  const getStrategyParameterValue = (strategy: StrategyDefinition, key: string, defaultValue: number) => {
    return strategyOverrides[strategy.strategyId]?.[key] ?? defaultValue;
  };

  const updateStrategyParameter = (strategyId: string, key: string, value: number) => {
    setStrategyOverrides((prev) => ({
      ...prev,
      [strategyId]: {
        ...(prev[strategyId] || {}),
        [key]: value,
      },
    }));
  };

  const resetStrategyParameters = (strategyId?: string) => {
    if (!strategyId) {
      setStrategyOverrides({});
      setStrategySuggestion(null);
      return;
    }

    setStrategyOverrides((prev) => {
      const next = { ...prev };
      delete next[strategyId];
      return next;
    });
  };

  const buildStrategyOverrides = (): StrategyOverride[] => {
    const overrides: StrategyOverride[] = [];

    strategyDefinitions.forEach((strategy) => {
      const parameters = strategyOverrides[strategy.strategyId];
      if (!parameters || Object.keys(parameters).length === 0) {
        return;
      }

      overrides.push({
        strategyId: strategy.strategyId,
        enabled: true,
        parameters,
      });
    });

    return overrides;
  };

  const applyStrategySuggestion = (suggestion: StrategySettingSuggestion['suggestion']) => {
    const nextOverrides: Record<string, Record<string, number>> = {};

    suggestion.suggestedOverrides.forEach((override) => {
      if (!override.parameters) {
        return;
      }
      nextOverrides[override.strategyId] = {
        ...(nextOverrides[override.strategyId] || {}),
        ...override.parameters,
      };
    });

    setStrategyOverrides((prev) => ({
      ...prev,
      ...nextOverrides,
    }));
    setStrategySuggestion(suggestion);
  };

  const handleStrategySuggest = async () => {
    try {
      setStrategySuggesting(true);
      const result = await researchApi.suggestStrategySettings(true);
      applyStrategySuggestion(result.suggestion);
      message.success(result.suggestion.mode === 'llm' ? '大模型已生成策略参数建议' : '已生成规则辅助参数建议');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '生成策略建议失败');
    } finally {
      setStrategySuggesting(false);
    }
  };

  const handleStrategyScreen = async () => {
    try {
      if (screenDateRange && !screenDateRange[1].isAfter(screenDateRange[0])) {
        message.error('开始时间必须早于结束时间');
        return;
      }

      setStrategyScreening(true);
      const result = await researchApi.runStrategyScreening({
        period: screenPeriod,
        limit: screenLimit,
        startTime: screenDateRange?.[0]?.toISOString(),
        endTime: screenDateRange?.[1]?.toISOString(),
        initialBalance: INITIAL_BALANCE,
        riskPerTradePct: 1,
        maxPositionPct: 35,
        slippagePct: 0.04,
        commissionPct: 0.01,
        strategyOverrides: buildStrategyOverrides(),
      });
      const [overview, runs] = await Promise.all([
        researchApi.getStrategyLabOverview().catch(() => null),
        researchApi.getStrategyScreenRuns().catch(() => []),
      ]);
      setLatestStrategyRun(result.run);
      setStrategyOverview(overview || strategyOverview);
      setStrategyRuns(runs);
      message.success(`长期策略筛选完成：${result.history.candleCount.toLocaleString()} 根可交易 ${result.history.period} K线`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '长期策略筛选失败');
    } finally {
      setStrategyScreening(false);
    }
  };

  const screenRunColumns: ColumnsType<StrategyScreenRun> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 150,
      render: (value) => <Text>{formatDateTime(value)}</Text>,
    },
    {
      title: '样本',
      key: 'sample',
      width: 150,
      render: (_, record) => (
        <Space size={4} wrap>
          <Tag color="blue">{periodLabel(record.period)}</Tag>
          <Text>{record.candleCount.toLocaleString()} 根</Text>
        </Space>
      ),
    },
    {
      title: '最佳策略',
      key: 'recommendation',
      render: (_, record) => (
        <div className="screen-run-best">
          <Text strong>{record.recommendation?.name || '暂无推荐'}</Text>
          <Text type="secondary">{record.recommendation?.reason || '需要查看本轮结果'}</Text>
        </div>
      ),
    },
    {
      title: '分数',
      key: 'score',
      width: 86,
      render: (_, record) => {
        const score = Number(record.recommendation?.score || 0);
        return <Tag color={score >= 70 ? 'success' : score >= 45 ? 'warning' : 'default'}>{score || '-'}分</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 96,
      render: (_, record) => (
        <Button size="small" onClick={() => setLatestStrategyRun(record)}>
          查看
        </Button>
      ),
    },
  ];

  const handleReset = async () => {
    try {
      setActing(true);
      const nextAccounts = await researchApi.resetPaperAccounts();
      setAccounts(nextAccounts);
      await refreshQuantChain().catch(() => undefined);
      message.success('模拟账号已重置');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '重置失败');
    } finally {
      setActing(false);
    }
  };

  const backtestColumns: ColumnsType<BacktestProfileResult> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      width: 120,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 90,
      render: directionTag,
    },
    {
      title: '交易数',
      dataIndex: 'trades',
      key: 'trades',
      width: 90,
    },
    {
      title: '胜率',
      dataIndex: 'winRate',
      key: 'winRate',
      width: 90,
      render: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
    {
      title: 'PF',
      dataIndex: 'profitFactor',
      key: 'profitFactor',
      width: 80,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '期望',
      dataIndex: 'expectancy',
      key: 'expectancy',
      width: 90,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '净收益',
      dataIndex: 'netPnl',
      key: 'netPnl',
      width: 110,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '最大回撤',
      dataIndex: 'maxDrawdown',
      key: 'maxDrawdown',
      width: 110,
      render: (value) => `${Number(value || 0).toFixed(2)}%`,
    },
    {
      title: '稳健度',
      dataIndex: 'robustnessScore',
      key: 'robustnessScore',
      width: 90,
      render: (value) => <Tag color={value >= 75 ? 'success' : value >= 50 ? 'warning' : 'error'}>{Number(value || 0)}%</Tag>,
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      render: (value, record) => (
        <Space>
          {record.sampleWarning && <Tag color="warning">样本偏少</Tag>}
          <Text>{value}</Text>
        </Space>
      ),
    },
  ];

  const reportColumns: ColumnsType<AnalysisReport> = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: formatDate,
    },
    {
      title: '结论',
      key: 'headline',
      render: (_, report) => <Text strong>{report.result.decision.headline}</Text>,
    },
    {
      title: '价格',
      dataIndex: 'currentPrice',
      key: 'currentPrice',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '上涨',
      key: 'upProb',
      width: 90,
      render: (_, report) => `${report.result.probability.upProb}%`,
    },
    {
      title: '下跌',
      key: 'downProb',
      width: 90,
      render: (_, report) => `${report.result.probability.downProb}%`,
    },
    {
      title: '风险',
      key: 'risk',
      width: 90,
      render: (_, report) => `${report.result.risk.risk}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 90,
      render: (_, report) => (
        <Button size="small" onClick={() => setLatestReport(report)}>
          查看
        </Button>
      ),
    },
  ];

  const accountStatColumns: ColumnsType<(typeof accountStats)[number]> = [
    {
      title: '账号',
      dataIndex: 'name',
      key: 'name',
      width: 110,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '余额',
      dataIndex: 'balance',
      key: 'balance',
      width: 110,
      render: formatMoney,
    },
    {
      title: '权益',
      dataIndex: 'equity',
      key: 'equity',
      width: 110,
      render: formatMoney,
    },
    {
      title: '已实现盈亏',
      dataIndex: 'realizedPnl',
      key: 'realizedPnl',
      width: 120,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '记录数',
      dataIndex: 'total',
      key: 'total',
      width: 90,
    },
    {
      title: '开仓',
      dataIndex: 'open',
      key: 'open',
      width: 80,
    },
    {
      title: '跳过',
      dataIndex: 'skipped',
      key: 'skipped',
      width: 80,
    },
    {
      title: '持有',
      dataIndex: 'held',
      key: 'held',
      width: 80,
    },
    {
      title: '已平仓',
      dataIndex: 'closed',
      key: 'closed',
      width: 90,
    },
    {
      title: '平仓胜率',
      dataIndex: 'winRate',
      key: 'winRate',
      width: 100,
      render: (value) => `${Number(value || 0).toFixed(1)}%`,
    },
  ];

  const tradeColumns: ColumnsType<TradeRecord> = [
    {
      title: '时间',
      dataIndex: 'openedAt',
      key: 'openedAt',
      width: 130,
      render: formatDate,
    },
    {
      title: '账号',
      dataIndex: 'accountName',
      key: 'accountName',
      width: 100,
      render: (value) => <Text strong>{value}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: statusTag,
    },
    {
      title: '方向',
      dataIndex: 'direction',
      key: 'direction',
      width: 90,
      render: directionTag,
    },
    {
      title: '开仓价',
      dataIndex: 'entryPrice',
      key: 'entryPrice',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '平仓价',
      dataIndex: 'exitPrice',
      key: 'exitPrice',
      width: 100,
      render: (value) => value ? Number(value).toFixed(2) : '-',
    },
    {
      title: '手数',
      dataIndex: 'volume',
      key: 'volume',
      width: 90,
      render: (value) => Number(value || 0).toFixed(4),
    },
    {
      title: '止损',
      dataIndex: 'stopLoss',
      key: 'stopLoss',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '止盈',
      dataIndex: 'takeProfit',
      key: 'takeProfit',
      width: 100,
      render: (value) => Number(value || 0).toFixed(2),
    },
    {
      title: '盈亏',
      dataIndex: 'pnl',
      key: 'pnl',
      width: 100,
      render: (value) => <Text type={value >= 0 ? 'success' : 'danger'}>{formatMoney(value)}</Text>,
    },
    {
      title: '原因',
      dataIndex: 'reason',
      key: 'reason',
      ellipsis: true,
    },
    {
      title: '关联报告',
      dataIndex: 'reportId',
      key: 'reportId',
      width: 160,
      ellipsis: true,
      render: (reportId) => reportId ? (reportById.get(reportId)?.result.decision.headline || reportId.slice(-8)) : '-',
    },
  ];

  return (
    <div className="workspace-page">
      <PageHeader
        eyebrow="Strategy Lab"
        title="量化策略实验室"
        description="AI观点、新闻事件、回测盘、模拟盘和风险偏好组合"
        meta={(
          <Space wrap>
            <span className={autoTrading?.errors?.length ? 'pill amber' : 'pill green'}>自动实时交易</span>
            {markPrice !== null ? <span className="pill blue">结算价 {markPrice.toFixed(2)}</span> : <span className="pill">等待结算</span>}
          </Space>
        )}
        actions={(
          <Space wrap>
          <Button
            type="primary"
            icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
            onClick={handleAIAnalyze}
            loading={analyzing}
          >
            {analyzing ? 'AI分析中' : 'AI分析'}
          </Button>
          <Button icon={<ReloadOutlined />} onClick={loadSummary} loading={loading}>
            刷新
          </Button>
          <Button icon={<FundProjectionScreenOutlined />} onClick={handleSettle} loading={acting}>
            结算持仓
          </Button>
          <Button icon={<UndoOutlined />} onClick={handleReset} loading={acting}>
            重置100万账号
          </Button>
          </Space>
        )}
      />

      <Card
        className="workspace-card strategy-library-card"
        title="黄金策略全景库"
        extra={(
          <Space wrap>
            <Tag color="gold">{GOLD_STRATEGY_LIBRARY.length} 个 XAUUSD 策略</Tag>
            <Button size="small" icon={<ReloadOutlined />} loading={strategyRuntimeRunning} onClick={handleRunStrategyRuntime}>
              立即运行
            </Button>
            <Button size="small" icon={<UndoOutlined />} loading={strategyRuntimeRunning} onClick={handleResetStrategyRuntime}>
              重置记录
            </Button>
          </Space>
        )}
      >
        <div className="strategy-library-hero">
          <div>
            <span>40个策略交易员 · 每个独立100万</span>
            <h2>40个策略交易员独立测试，合计4000万模拟资金</h2>
            <p>每个策略都有自己的本金、权益、盈亏、胜率、回撤和交易样本，AI交易员只从盈利稳定、回撤低、样本足够的策略里选择。</p>
          </div>
          <div className="strategy-library-total">
            <strong>{formatMoney(strategyRuntimeSummary.totalStartingCapital)}</strong>
            <span>总测试资金</span>
            <em>{formatMoney(strategyRuntimeSummary.strategyStartingCapital)} / 策略交易员</em>
          </div>
        </div>

        <div className="strategy-group-strip">
          {strategyGroupedRows.map((item) => (
            <div className="strategy-group-tile" key={item.group}>
              <Tag color={item.color}>{item.label}</Tag>
              <strong>{item.rows.length}</strong>
              <span>{item.hint}</span>
            </div>
          ))}
          <div className="strategy-group-tile">
            <Tag color="processing">AI精选</Tag>
            <strong>{strategyRuntimeSummary.selectedCount}</strong>
            <span>盈利稳定、低回撤、样本足够</span>
          </div>
        </div>

        <div className="strategy-runtime-strip">
          <div>
            <span>总测试资金</span>
            <strong>{formatMoney(strategyRuntimeSummary.totalStartingCapital)}</strong>
            <em>{GOLD_STRATEGY_LIBRARY.length} 个独立账户</em>
          </div>
          <div>
            <span>模拟总权益</span>
            <strong>{formatMoney(strategyRuntimeSummary.totalEquity)}</strong>
            <em>{strategyRuntimeSummary.updatedAt ? `更新 ${formatDate(strategyRuntimeSummary.updatedAt)}` : '等待运行'}</em>
          </div>
          <div>
            <span>累计模拟盈亏</span>
            <strong className={strategyRuntimeSummary.totalPnl >= 0 ? 'green' : 'red'}>
              {strategyRuntimeSummary.totalPnl >= 0 ? '+' : ''}{formatMoney(strategyRuntimeSummary.totalPnl)}
            </strong>
            <em>{strategyRuntimeSummary.totalPnlPct >= 0 ? '+' : ''}{strategyRuntimeSummary.totalPnlPct}%</em>
          </div>
          <div>
            <span>AI精选 / 降权</span>
            <strong>{strategyRuntimeSummary.selectedCount} / {strategyRuntimeSummary.downgradedCount}</strong>
            <em>风控员筛选结果</em>
          </div>
          <div>
            <span>持仓 / 交易笔数</span>
            <strong>{strategyRuntimeSummary.openPositions} / {strategyRuntimeSummary.totalTrades}</strong>
            <em>模拟盘运行统计</em>
          </div>
        </div>

        <Alert
          className="strategy-runtime-alert"
          type="info"
          showIcon
          message={strategyRuntimeRun
            ? `后端已按 ${periodLabel(strategyRuntimeRun.period)} K线生成运行批次：${formatDateTime(strategyRuntimeSummary.dataStart)} 至 ${formatDateTime(strategyRuntimeSummary.dataEnd)}，逐笔交易、权益曲线和每日结算均已保存。`
            : '等待后端运行：点击“立即运行”后，会为40个策略交易员生成逐笔模拟交易、权益曲线和每日结算记录。'}
        />

        <div className="strategy-group-stack">
          {strategyGroupedRows.map((group) => (
            <section className="strategy-group-block" key={group.group}>
              <div className="strategy-group-head">
                <div>
                  <Tag color={group.color}>{group.label}</Tag>
                  <strong>{group.rows.length} 个策略交易员</strong>
                  <span>{group.hint}</span>
                </div>
                <em>{group.group === 'profit' ? 'AI交易员候选池' : group.group === 'loss' ? '风控员降权池' : group.group === 'watching' ? '继续收集样本' : '暂停开仓'}</em>
              </div>
              {group.rows.length > 0 ? (
                <div className="strategy-library-grid strategy-group-grid">
                  {group.rows.map((strategy) => {
                    const runtime = strategy.runtime;
                    const statusLabel = runtime?.statusLabel || '等待运行';
                    const statusColor = runtime?.status === 'running' ? 'success' : runtime?.status === 'watching' ? 'warning' : 'default';
                    const pnl = strategy.pnl;
                    const pnlPct = strategy.pnlPct;
                    const selectionText = selectionLabelText[strategy.selectionLabel] || strategy.selectionLabel;
                    const selectionColor = selectionLabelColor[strategy.selectionLabel] || 'default';

                    return (
                      <article className="strategy-library-item" key={strategy.id}>
                        <div className="strategy-library-item-head">
                          <div>
                            <strong>{strategy.name}</strong>
                            <span>{strategy.summary}</span>
                          </div>
                          <Space size={4} wrap>
                            <Tag color={selectionColor}>{selectionText}</Tag>
                            <Tag color={statusColor}>{statusLabel}</Tag>
                          </Space>
                        </div>
                        <div className="strategy-library-money">
                          <span>独立本金</span>
                          <strong>{formatMoney(strategy.capital)}</strong>
                          <em>单策略账户</em>
                        </div>
                        <div className="strategy-runtime-grid">
                          <div>
                            <span>当前权益</span>
                            <strong>{formatMoney(strategy.equity)}</strong>
                          </div>
                          <div>
                            <span>模拟盈亏</span>
                            <strong className={pnl >= 0 ? 'green' : 'red'}>
                              {pnl >= 0 ? '+' : ''}{formatMoney(pnl)}
                            </strong>
                          </div>
                          <div>
                            <span>收益率</span>
                            <strong className={pnlPct >= 0 ? 'green' : 'red'}>
                              {pnlPct >= 0 ? '+' : ''}{pnlPct}%
                            </strong>
                          </div>
                          <div>
                            <span>胜率</span>
                            <strong>{runtime ? `${runtime.winRate}%` : '-'}</strong>
                          </div>
                          <div>
                            <span>回撤</span>
                            <strong>{runtime ? `${runtime.maxDrawdown}%` : '-'}</strong>
                          </div>
                          <div>
                            <span>交易笔数</span>
                            <strong>{runtime?.trades || 0}</strong>
                          </div>
                        </div>
                        <div className="strategy-runtime-footer">
                          <span>{runtime?.openPosition ? '当前有持仓' : '当前无持仓'}</span>
                          <span>连续亏损 {strategy.consecutiveLosses} 笔</span>
                          <span>{runtime?.lastTradeAt ? formatDate(runtime.lastTradeAt) : '暂无成交'}</span>
                        </div>
                        <div className="strategy-risk-reason">{strategy.riskReason}</div>
                        <div className="strategy-card-actions">
                          <Button
                            size="small"
                            icon={<SearchOutlined />}
                            onClick={() => setStrategyAnalysisTarget(strategy)}
                          >
                            分析策略
                          </Button>
                          <Button
                            size="small"
                            type={strategy.portfolioGroup === 'profit' ? 'primary' : 'default'}
                            icon={<CopyOutlined />}
                            disabled={strategy.portfolioGroup !== 'profit' || strategy.pnl <= 0}
                            onClick={() => handleCopyStrategyRobot(strategy)}
                          >
                            复制机器人
                          </Button>
                        </div>
                        <div className="strategy-library-tags">
                          {[strategy.direction, strategy.method, strategy.kind, strategy.session, strategy.horizon, strategy.style, ...strategy.tags].map((tag) => (
                            <span key={`${strategy.id}-${tag}`}>{tag}</span>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="strategy-group-empty">当前没有策略交易员进入该分组</div>
              )}
            </section>
          ))}
        </div>
      </Card>

      <Modal
        className="strategy-analysis-modal"
        open={Boolean(strategyAnalysisTarget)}
        title={strategyAnalysisTarget ? `${strategyAnalysisTarget.name} · 策略分析` : '策略分析'}
        width={980}
        onCancel={() => setStrategyAnalysisTarget(null)}
        footer={[
          <Button key="close" onClick={() => setStrategyAnalysisTarget(null)}>
            关闭
          </Button>,
          <Button
            key="copy"
            type="primary"
            icon={<CopyOutlined />}
            disabled={!strategyAnalysisTarget || strategyAnalysisTarget.portfolioGroup !== 'profit' || strategyAnalysisTarget.pnl <= 0}
            onClick={() => {
              if (strategyAnalysisTarget) {
                handleCopyStrategyRobot(strategyAnalysisTarget);
              }
            }}
          >
            复制为我的机器人
          </Button>,
        ]}
      >
        {strategyAnalysisTarget && (
          <div className="strategy-analysis-body">
            <div className="strategy-analysis-hero">
              <div>
                <span>{strategyAnalysisTarget.direction} · {strategyAnalysisTarget.method} · {strategyAnalysisTarget.session}</span>
                <h3>{strategyAnalysisTarget.summary}</h3>
                <p>{strategyAnalysisTarget.riskReason}</p>
              </div>
              <Tag color={selectionLabelColor[strategyAnalysisTarget.selectionLabel] || 'default'}>
                {selectionLabelText[strategyAnalysisTarget.selectionLabel] || strategyAnalysisTarget.selectionLabel}
              </Tag>
            </div>

            <div className="strategy-analysis-metrics">
              <div>
                <span>模板本金</span>
                <strong>{formatMoney(strategyAnalysisTarget.capital)}</strong>
              </div>
              <div>
                <span>当前权益</span>
                <strong>{formatMoney(strategyAnalysisTarget.equity)}</strong>
              </div>
              <div>
                <span>模板盈亏</span>
                <strong className={strategyAnalysisTarget.pnl >= 0 ? 'green' : 'red'}>
                  {strategyAnalysisTarget.pnl >= 0 ? '+' : ''}{formatMoney(strategyAnalysisTarget.pnl)}
                </strong>
              </div>
              <div>
                <span>收益率</span>
                <strong className={strategyAnalysisTarget.pnlPct >= 0 ? 'green' : 'red'}>
                  {strategyAnalysisTarget.pnlPct >= 0 ? '+' : ''}{strategyAnalysisTarget.pnlPct}%
                </strong>
              </div>
              <div>
                <span>胜率 / 回撤</span>
                <strong>{strategyAnalysisTarget.runtime ? `${strategyAnalysisTarget.runtime.winRate}% / ${strategyAnalysisTarget.runtime.maxDrawdown}%` : '-'}</strong>
              </div>
              <div>
                <span>交易样本</span>
                <strong>{strategyAnalysisTarget.runtime?.trades || 0} 笔</strong>
              </div>
            </div>

            <div className="strategy-analysis-section">
              <strong>策略逻辑</strong>
              <div className="strategy-analysis-logic">
                {buildStrategyLogic(strategyAnalysisTarget).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>

            <Descriptions size="small" column={{ xs: 1, md: 3 }} bordered>
              <Descriptions.Item label="策略类型">{strategyAnalysisTarget.kind}</Descriptions.Item>
              <Descriptions.Item label="周期">{strategyAnalysisTarget.horizon}</Descriptions.Item>
              <Descriptions.Item label="风险风格">{strategyAnalysisTarget.style}</Descriptions.Item>
              <Descriptions.Item label="适配行情">{strategyAnalysisTarget.preferredState}</Descriptions.Item>
              <Descriptions.Item label="连续亏损">{strategyAnalysisTarget.consecutiveLosses} 笔</Descriptions.Item>
              <Descriptions.Item label="盈利因子">{strategyAnalysisTarget.runtime?.profitFactor || '-'}</Descriptions.Item>
            </Descriptions>

            <div className="strategy-analysis-section">
              <strong>最近交易</strong>
              <Table
                size="small"
                pagination={false}
                scroll={{ x: 760 }}
                dataSource={(strategyAnalysisTarget.runtime?.tradeLog || []).slice(-8).reverse().map((trade, index) => ({
                  ...trade,
                  key: `${trade.entryTime}-${index}`,
                }))}
                columns={[
                  {
                    title: '方向',
                    dataIndex: 'direction',
                    width: 70,
                    render: (value: string) => value === 'long' ? <Tag color="red">多</Tag> : <Tag color="green">空</Tag>,
                  },
                  {
                    title: '入场',
                    dataIndex: 'entryPrice',
                    width: 90,
                    render: (value: number) => Number(value || 0).toFixed(2),
                  },
                  {
                    title: '出场',
                    dataIndex: 'exitPrice',
                    width: 90,
                    render: (value: number) => Number(value || 0).toFixed(2),
                  },
                  {
                    title: '盈亏',
                    dataIndex: 'pnl',
                    width: 100,
                    render: (value: number) => (
                      <Text type={value >= 0 ? 'success' : 'danger'}>
                        {value >= 0 ? '+' : ''}{formatMoney(value)}
                      </Text>
                    ),
                  },
                  {
                    title: '退出原因',
                    dataIndex: 'reason',
                    width: 90,
                  },
                  {
                    title: '时间',
                    dataIndex: 'exitTime',
                    render: (value: string) => formatDate(value),
                  },
                ]}
              />
            </div>
          </div>
        )}
      </Modal>

      <Card
        className="workspace-card quant-lab-card"
        title="量化交易蓝图"
        extra={<Tag color="blue">100万模拟资金池</Tag>}
      >
        <Row gutter={[12, 12]} className="quant-summary-row">
          <Col xs={24} md={6}>
            <div className="metric-tile quant-metric">
              <div className="metric-tile-label">初始模拟资金</div>
              <div className="metric-tile-value">{formatMoney(INITIAL_BALANCE)}</div>
              <Text type="secondary">重置账号后生效</Text>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div className="metric-tile quant-metric">
              <div className="metric-tile-label">策略账户</div>
              <div className="metric-tile-value">4 组</div>
              <Text type="secondary">保守、稳健、进取、事件</Text>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div className="metric-tile quant-metric">
              <div className="metric-tile-label">当前可运行</div>
              <div className="metric-tile-value">{quantChain ? '四层链路' : 'AI + 回测'}</div>
              <Text type="secondary">{quantChain?.version || '先验证，再上实盘'}</Text>
            </div>
          </Col>
          <Col xs={24} md={6}>
            <div className="metric-tile quant-metric">
              <div className="metric-tile-label">人工/模型干预</div>
              <div className="metric-tile-value">{quantChain?.execution.modeLabel || '预留'}</div>
              <Text type="secondary">{quantChain?.execution.canOpenNewTrades === false ? '只盯市不新开仓' : '暂停、减仓、换策略'}</Text>
            </div>
          </Col>
        </Row>

        <div className="quant-section-grid">
          <div className="quant-panel">
            <div className="quant-panel-title">四层计算链路</div>
            <div className="quant-pipeline">
              {quantPipelineView.map((item) => (
                <div className="quant-stage" key={item.title}>
                  <div className="quant-stage-head">
                    <strong>{item.title}</strong>
                    <Tag color={quantStatusColor(item.status)}>{item.status}</Tag>
                  </div>
                  <Text className="quant-stage-tools">{item.tools}</Text>
                  <p>{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="quant-panel">
            <div className="quant-panel-title">资金拆分建议</div>
            <div className="quant-allocation-grid">
              {allocationSuggestion.map((item) => (
                <div className="quant-allocation" key={item.name}>
                  <div>
                    <strong>{item.name}</strong>
                    <Text type="secondary">{item.basis || item.role}</Text>
                  </div>
                  <div className="quant-weight-wrap">
                    <div className="quant-weight">{item.suggestedWeight}%</div>
                    {'capital' in item && <Text type="secondary">{formatMoney(Number(item.capital || 0))}</Text>}
                  </div>
                </div>
              ))}
            </div>
            <Alert
              type={latestBacktest ? 'success' : 'info'}
              showIcon
              message={latestBacktest ? '已按最近回测结果生成权重建议' : '当前权重是人工初始方案'}
              description="这里先用稳健度、PF、净收益和最大回撤做轻量打分；下一步再接入正式凸优化。"
            />
          </div>
        </div>

        <div className="quant-control-grid">
          <div className="quant-panel">
            <div className="quant-panel-title">市场状态识别</div>
            {quantChain?.marketState ? (
              <>
                <div className="quant-state-metrics">
                  <div className="quant-state-metric">
                    <Text type="secondary">状态</Text>
                    <strong>{quantChain.marketState.stateLabel}</strong>
                  </div>
                  <div className="quant-state-metric">
                    <Text type="secondary">Kalman价</Text>
                    <strong>{quantChain.marketState.kalmanPrice.toFixed(2)}</strong>
                  </div>
                  <div className="quant-state-metric">
                    <Text type="secondary">趋势分</Text>
                    <strong>{quantChain.marketState.trendScore}</strong>
                  </div>
                  <div className="quant-state-metric">
                    <Text type="secondary">波动</Text>
                    <strong>{quantChain.marketState.volatilityPct}%</strong>
                  </div>
                </div>
                <div className="quant-transition-list">
                  {quantChain.marketState.transitionProbabilities.map((item) => (
                    <div className="quant-transition-row" key={item.name}>
                      <span>{item.name}</span>
                      <Progress percent={item.probability} size="small" showInfo={false} />
                      <strong>{item.probability}%</strong>
                    </div>
                  ))}
                </div>
                <Alert
                  type="info"
                  showIcon
                  message={quantChain.marketState.recommendation}
                  description={quantChain.marketState.source}
                />
              </>
            ) : (
              <Alert type="warning" showIcon message="等待K线数据" description="链路接口暂未返回市场状态。" />
            )}
          </div>

          <div className="quant-panel">
            <div className="quant-panel-title">执行与干预</div>
            <div className="quant-intervention-actions">
              <Select<QuantInterventionMode>
                value={interventionMode}
                onChange={setInterventionMode}
                options={[
                  { value: 'normal', label: '正常运行' },
                  { value: 'reduce_risk', label: '减仓运行 50%' },
                  { value: 'paused', label: '暂停开新仓' },
                ]}
              />
              <Input
                value={interventionNote}
                onChange={(event) => setInterventionNote(event.target.value)}
                maxLength={160}
                placeholder="干预原因，可留空"
              />
              <Button type="primary" onClick={handleInterventionUpdate} loading={interventionSaving}>
                保存干预
              </Button>
            </div>
            <Alert
              type={quantChain?.execution.mode === 'paused' ? 'warning' : 'success'}
              showIcon
              message={quantChain?.execution.modeLabel || '等待执行状态'}
              description={quantChain?.execution
                ? `${quantChain.execution.gridHint} 新开仓风险缩放 ${Math.round(quantChain.execution.riskScale * 100)}%。`
                : '保存后会写入后端，并影响模拟盘是否开新仓。'}
            />
          </div>
        </div>

        <div className="quant-batch-panel">
          <div className="quant-panel-title">策略组合批量回测</div>
          <div className="quant-batch-head">
            <Text type="secondary">一次跑多组参数，用成本压力和持仓周期验证策略是否稳健。</Text>
            <Button
              type="primary"
              icon={<ExperimentOutlined />}
              onClick={handleBatchBacktest}
              loading={batchBacktesting}
              disabled={!latestReport}
            >
              运行4组批量回测
            </Button>
          </div>
          <div className="quant-preset-grid">
            {backtestPresets.map((preset) => {
              const run = batchBacktests.find((item) => item.preset.id === preset.id)?.run;
              const best = run?.results
                ?.filter((item) => item.trades > 0)
                .sort((a, b) => Number(b.robustnessScore || 0) - Number(a.robustnessScore || 0))[0];

              return (
                <div className="quant-preset" key={preset.id}>
                  <div className="quant-preset-title">
                    <strong>{preset.name}</strong>
                    <Tag color={run ? 'success' : 'default'}>{run ? '已跑' : '待跑'}</Tag>
                  </div>
                  <p>{preset.description}</p>
                  <div className="quant-preset-meta">
                    <span>{preset.config.period}</span>
                    <span>{preset.config.limit} K</span>
                    <span>持仓 {preset.config.exitBars} K</span>
                    <span>滑点 {preset.config.slippagePct}%</span>
                  </div>
                  {best && (
                    <div className="quant-preset-result">
                      <span>最佳：{best.name}</span>
                      <span>稳健度 {best.robustnessScore || 0}%</span>
                      <span className={best.netPnl >= 0 ? 'green' : 'red'}>{formatMoney(best.netPnl)}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="quant-roadmap">
          {roadmap.map((item) => (
            <div className="quant-roadmap-item" key={item}>{item}</div>
          ))}
        </div>
      </Card>

      <Card
        className="workspace-card long-screen-card"
        title="长期黄金数据与策略筛选"
        extra={<Tag color={latestStrategyRun?.dataSource === 'live' ? 'success' : latestStrategyRun ? 'blue' : 'default'}>{latestStrategyRun ? `${latestStrategyRun.candleCount} 根${latestStrategyRun.period}` : '等待筛选'}</Tag>}
      >
        <div className="long-screen-layout">
          <div className="long-screen-side">
            <div className="long-screen-kpis">
              <div className="metric-tile">
                <div className="metric-tile-label">长期历史缓存</div>
                <div className="metric-tile-value">{historyCaches.length}</div>
                <Text type="secondary">{latestStrategyRun ? `${formatDate(latestStrategyRun.dataStart)} - ${formatDate(latestStrategyRun.dataEnd)}` : '只统计真实/缓存数据'}</Text>
              </div>
              <div className="metric-tile">
                <div className="metric-tile-label">模拟盘流水</div>
                <div className="metric-tile-value">{strategyOverview?.paperTrading.tradeCount || 0}</div>
                <Text type="secondary">{strategyOverview?.paperTrading.message || '读取中'}</Text>
              </div>
              <div className="metric-tile">
                <div className="metric-tile-label">实盘快照/持仓</div>
                <div className="metric-tile-value">{strategyOverview?.liveTrading.positionCount || 0}</div>
                <Text type="secondary">{strategyOverview?.liveTrading.message || '读取中'}</Text>
              </div>
            </div>

            <div className="history-cache-panel">
              <div className="panel-mini-head">
                <strong>历史数据清单</strong>
                <Text type="secondary">真实/缓存行情，供回测和筛选使用</Text>
              </div>
              <div className="history-cache-list">
                {historyCaches.length > 0 ? historyCaches.map((history) => (
                  <div className="history-cache-item" key={`${history.period}-${history.provider}`}>
                    <div className="history-cache-main">
                      <Tag color={history.source === 'live' ? 'success' : history.source === 'stale_cache' ? 'warning' : 'blue'}>
                        {periodLabel(history.period)}
                      </Tag>
                      <strong>{(history.session?.tradableCount || history.candleCount).toLocaleString()} 可交易</strong>
                      <span>原始 {history.candleCount.toLocaleString()} / {history.provider}</span>
                    </div>
                    <div className="history-cache-range">
                      {formatDateTime(history.startTime)} - {formatDateTime(history.endTime)}
                    </div>
                    <div className="history-cache-meta">
                      <Tag color={Number(history.session?.removedWeekendCount || 0) > 0 ? 'warning' : 'success'}>
                        剔除周末 {(history.session?.removedWeekendCount || 0).toLocaleString()}
                      </Tag>
                      <Tag color={Number(history.session?.gapCount || 0) > 0 ? 'warning' : 'success'}>
                        清洗缺口 {history.session?.gapCount || 0}
                      </Tag>
                      <Tag color={Number(history.quality?.invalidCount || 0) > 0 ? 'error' : 'default'}>
                        无效 {history.quality?.invalidCount || 0}
                      </Tag>
                      <Text type="secondary">占比 {formatRatio(history.session?.nonTradingRatio)}</Text>
                      <Text type="secondary">更新 {formatDate(history.updatedAt)}</Text>
                    </div>
                    {(history.session?.warnings?.[0] || history.quality?.warnings?.[0]) && (
                      <Text type="warning" className="history-cache-warning">
                        {history.session?.warnings?.[0] || history.quality?.warnings?.[0]}
                      </Text>
                    )}
                  </div>
                )) : (
                  <div className="empty-box">暂无可用历史数据，请先导入或等待缓存生成</div>
                )}
              </div>
            </div>

            <div className="long-screen-controls">
              <Select
                value={screenPeriod}
                onChange={(value) => {
                  const nextHistory = historyByPeriod.get(value);
                  setScreenPeriod(value);
                  setScreenLimit(getDefaultScreenLimit(value, nextHistory));
                  setScreenDateRange(getHistoryDateRange(nextHistory));
                  setScreenDateRangeTouched(false);
                }}
                optionLabelProp="label"
              >
                {screenPeriodOptions.map((option) => (
                  <Select.Option value={option.value} label={option.label} key={option.value}>
                    <div className="screen-period-option">
                      <div>
                        <strong>{option.label}</strong>
                        <span>{option.available ? `${option.available.toLocaleString()} 根可交易` : '暂无可用K线'}</span>
                      </div>
                      <small>{option.spanText} · {option.rangeText}</small>
                    </div>
                  </Select.Option>
                ))}
              </Select>
              <RangePicker
                className="screen-range-picker"
                showTime={{ format: 'HH:mm' }}
                format="YYYY/MM/DD HH:mm"
                value={screenDateRange}
                allowClear
                disabledDate={(current) => {
                  if (!selectedHistoryRange || !current) return false;
                  return current.isBefore(selectedHistoryRange[0].startOf('day')) || current.isAfter(selectedHistoryRange[1].endOf('day'));
                }}
                onChange={(dates) => {
                  const nextRange = dates?.[0] && dates?.[1] ? [dates[0], dates[1]] as [Dayjs, Dayjs] : null;
                  setScreenDateRange(nextRange);
                  setScreenDateRangeTouched(true);
                }}
              />
              <InputNumber
                min={220}
                max={screenLimitMax}
                value={screenLimit}
                onChange={(value) => setScreenLimit(Math.min(Number(value || 1825), screenLimitMax))}
                addonAfter="根K线"
              />
              <Button
                type="primary"
                icon={<ExperimentOutlined />}
                onClick={handleStrategyScreen}
                loading={strategyScreening}
              >
                运行长期筛选
              </Button>
              <div className="screen-period-context">
                <span>当前可用：{selectedAvailableCount ? `${selectedAvailableCount.toLocaleString()} 根` : '暂无缓存'}</span>
                <span>仓库跨度：{selectedScreenHistory ? `${describeActualSpan(selectedScreenHistory)}，${formatDateOnly(selectedScreenHistory.startTime)} - ${formatDateOnly(selectedScreenHistory.endTime)}` : '等待历史仓库'}</span>
                <span>筛选窗口：{formatPickerRange(screenDateRange)}</span>
                <span>本次筛选：{screenLimit.toLocaleString()} 根，{describeLimitSpan(screenPeriod, screenLimit)}</span>
              </div>
            </div>

            <div className="strategy-settings-panel">
              <div className="strategy-settings-head">
                <div>
                  <strong>策略设定</strong>
                  <Text type="secondary">查看规则，调整参数后重新筛选</Text>
                </div>
                <Space wrap size={6}>
                  <Button size="small" onClick={() => resetStrategyParameters()}>
                    恢复默认
                  </Button>
                  <Button size="small" type="primary" loading={strategySuggesting} onClick={handleStrategySuggest}>
                    AI辅助建议
                  </Button>
                </Space>
              </div>

              {strategySuggestion && (
                <Alert
                  type={strategySuggestion.mode === 'llm' ? 'success' : 'info'}
                  showIcon
                  message={strategySuggestion.mode === 'llm' ? '大模型建议已应用到参数面板' : '规则建议已应用到参数面板'}
                  description={strategySuggestion.summary}
                  style={{ marginBottom: 8 }}
                />
              )}

              <div className="strategy-settings-grid">
                {strategyDefinitions.map((strategy) => (
                  <details className="strategy-setting-card" key={strategy.strategyId}>
                    <summary>
                      <span>{strategy.name}</span>
                      <Tag color={strategyOverrides[strategy.strategyId] ? 'processing' : 'default'}>
                        {strategyOverrides[strategy.strategyId] ? '已修改' : '默认'}
                      </Tag>
                    </summary>
                    <p>{strategy.description}</p>
                    <div className="strategy-logic-list">
                      {strategy.logic.map((line) => <span key={line}>{line}</span>)}
                    </div>
                    <div className="strategy-param-grid">
                      {strategy.parameters.map((parameter) => (
                        <label className="strategy-param" key={parameter.key}>
                          <span>{parameter.label}</span>
                          <InputNumber
                            min={parameter.min}
                            max={parameter.max}
                            step={parameter.step}
                            value={getStrategyParameterValue(strategy, parameter.key, parameter.value)}
                            onChange={(value) => updateStrategyParameter(strategy.strategyId, parameter.key, Number(value ?? parameter.value))}
                            addonAfter={parameter.unit}
                          />
                          <Text type="secondary">{parameter.description}</Text>
                        </label>
                      ))}
                    </div>
                    <Button size="small" onClick={() => resetStrategyParameters(strategy.strategyId)}>
                      恢复本策略默认
                    </Button>
                  </details>
                ))}
              </div>
            </div>

            <Alert
              type={latestStrategyRun?.recommendation?.score && latestStrategyRun.recommendation.score >= 60 ? 'success' : 'info'}
              showIcon
              message={latestStrategyRun?.recommendation?.name || '先跑长期筛选'}
              description={latestStrategyRun?.recommendation?.reason || '系统会在真实或JSON缓存的黄金历史数据上筛选趋势、均值回归、动量回撤和波动突破策略。'}
            />
          </div>

          <div className="long-screen-results">
            {(latestStrategyRun?.results || []).length > 0 ? (
              latestStrategyRun?.results.map((result) => (
                <div className="strategy-result-card" key={result.strategyId}>
                  <div className="strategy-result-head">
                    <div>
                      <strong>{result.name}</strong>
                      <Text type="secondary">{result.description}</Text>
                    </div>
                    <Tag color={result.score >= 70 ? 'success' : result.score >= 45 ? 'warning' : 'error'}>{result.score}分</Tag>
                  </div>
                  <div className="strategy-result-grid">
                    <span>交易 {result.trades}</span>
                    <span>胜率 {result.winRate}%</span>
                    <span>PF {result.profitFactor}</span>
                    <span>回撤 {result.maxDrawdown}%</span>
                    <span className={result.netPnl >= 0 ? 'green' : 'red'}>{formatMoney(result.netPnl)}</span>
                    <span className={result.validation.netPnl >= 0 ? 'green' : 'red'}>验证 {formatMoney(result.validation.netPnl)}</span>
                  </div>
                  <div className="strategy-stress-row">
                    {result.stressTests.map((stress) => (
                      <Tag color={stress.passed ? 'success' : 'error'} key={stress.label}>
                        {stress.label}
                      </Tag>
                    ))}
                    {result.sampleWarning && <Tag color="warning">样本偏少</Tag>}
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-box">暂无长期策略筛选结果</div>
            )}
          </div>
        </div>

        <div className="strategy-history-panel">
          <div className="panel-mini-head">
            <strong>策略筛选历史记录</strong>
            <Text type="secondary">保留每次筛选的样本、推荐和结果入口</Text>
          </div>
          <Table
            size="small"
            rowKey="_id"
            columns={screenRunColumns}
            dataSource={screenRunRows.slice(0, 8)}
            pagination={false}
            locale={{ emptyText: '暂无策略筛选历史记录' }}
            rowClassName={(record) => record._id === latestStrategyRun?._id ? 'active-screen-run-row' : ''}
          />
        </div>

        <div className="strategy-refine-grid">
          {[
            '策略库持久化：把用户修改后的参数方案保存成命名版本，支持对比和回滚。',
            '走样本验证：按年份或滚动窗口做训练/验证/测试三段，减少单段过拟合。',
            '新闻过滤器：把重大数据、央行讲话、突发新闻作为策略开关，而不是直接预测价格。',
            '实盘流水接入：补齐真实成交记录模型，用真实订单滑点校准回测成本。',
          ].map((item) => (
            <div className="strategy-refine-item" key={item}>{item}</div>
          ))}
        </div>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">AI报告</div>
            <div className="metric-tile-value">{researchMetrics.reportCount}</div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">模拟权益</div>
            <div className="metric-tile-value">{formatMoney(researchMetrics.totalEquity)}</div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">已实现盈亏</div>
            <div className={researchMetrics.realizedPnl >= 0 ? 'metric-tile-value green' : 'metric-tile-value red'}>
              {formatMoney(researchMetrics.realizedPnl)}
            </div>
          </div>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <div className="metric-tile">
            <div className="metric-tile-label">持仓账号</div>
            <div className="metric-tile-value">{researchMetrics.openTrades}</div>
          </div>
        </Col>
      </Row>

      {markPrice !== null && (
        <Alert
          type="info"
          showIcon
          message={`最近模拟结算价：${markPrice.toFixed(2)}`}
          description={autoTradingDescription}
        />
      )}

      {!latestReport && (
        <Alert
          type="warning"
          showIcon
          message="还没有AI分析报告"
          description="点击右上角“AI分析”，系统会读取最新行情并把报告保存到历史记录。"
        />
      )}

      {(analyzing || streamText || lastStreamResult) && (
        <Card
          className="workspace-card"
          title="AI流式回复"
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
          <div
            style={{
              minHeight: 180,
              maxHeight: 360,
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
        </Card>
      )}

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Card
            className="workspace-card"
            title="当前查看报告"
            loading={loading}
            extra={latestReport ? <Text type="secondary">{formatDate(latestReport.createdAt)}</Text> : null}
          >
            {latestReport ? (
              <Space direction="vertical" size="large" style={{ width: '100%' }}>
                <div>
                  <Title level={4} style={{ marginTop: 0 }}>{latestReport.result.decision.headline}</Title>
                  <Text>{latestReport.result.decision.summary}</Text>
                </div>

                <Row gutter={[12, 12]}>
                  <Col span={8}>
                    <Statistic title="当前价格" value={latestReport.currentPrice} precision={2} prefix="$" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="置信差" value={confidence} suffix="%" />
                  </Col>
                  <Col span={8}>
                    <Statistic title="K线数量" value={latestReport.candleCount} />
                  </Col>
                </Row>

                <Row gutter={[16, 16]}>
                  <Col xs={24} md={12}>
                    <Text strong>上涨概率</Text>
                    <Progress percent={latestReport.result.probability.upProb} strokeColor="#ef4444" />
                  </Col>
                  <Col xs={24} md={12}>
                    <Text strong>下跌概率</Text>
                    <Progress percent={latestReport.result.probability.downProb} strokeColor="#16a34a" />
                  </Col>
                </Row>

                <Descriptions column={1} size="small">
                  <Descriptions.Item label="重点事项">
                    {latestReport.result.decision.eventCountdown}
                  </Descriptions.Item>
                  <Descriptions.Item label="AI依据">
                    {latestReport.result.decision.aiReason}
                  </Descriptions.Item>
                  <Descriptions.Item label="风险">
                    <Space>
                      <Progress
                        type="circle"
                        percent={latestReport.result.risk.risk}
                        size={46}
                        status={riskColor(latestReport.result.risk.riskLevel)}
                      />
                      <Text>{latestReport.result.risk.reason}</Text>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>

                <Space wrap>
                  <Space>
                    <Text type="secondary">周期</Text>
                    <Select
                      size="small"
                      value={backtestPeriod}
                      style={{ width: 92 }}
                      onChange={setBacktestPeriod}
                      options={[
                        { value: '1m', label: '1分钟' },
                        { value: '5m', label: '5分钟' },
                        { value: '15m', label: '15分钟' },
                        { value: '1h', label: '1小时' },
                      ]}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">K线</Text>
                    <InputNumber
                      size="small"
                      min={60}
                      max={1500}
                      step={60}
                      value={backtestLimit}
                      style={{ width: 92 }}
                      onChange={(value) => setBacktestLimit(Number(value || 240))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">持仓K</Text>
                    <InputNumber
                      size="small"
                      min={3}
                      max={48}
                      value={backtestExitBars}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestExitBars(Number(value || 8))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">滑点%</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={backtestSlippagePct}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestSlippagePct(Number(value ?? 0.03))}
                    />
                  </Space>
                  <Space>
                    <Text type="secondary">手续费%</Text>
                    <InputNumber
                      size="small"
                      min={0}
                      max={0.5}
                      step={0.01}
                      value={backtestCommissionPct}
                      style={{ width: 78 }}
                      onChange={(value) => setBacktestCommissionPct(Number(value ?? 0.01))}
                    />
                  </Space>
                  <Button
                    type="primary"
                    icon={<RiseOutlined />}
                    onClick={handleExecute}
                    loading={acting}
                    disabled={!latestReport}
                  >
                    用此报告执行四账号模拟交易
                  </Button>
                  <Button
                    icon={<ExperimentOutlined />}
                    onClick={handleBacktest}
                    loading={acting}
                    disabled={!latestReport}
                  >
                    运行升级回测
                  </Button>
                </Space>
              </Space>
            ) : (
              <Text type="secondary">等待报告生成</Text>
            )}
          </Card>
        </Col>

        <Col xs={24} xl={10}>
          <Card className="workspace-card" title="回测结果" loading={loading}>
            {latestBacktest ? (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Descriptions column={2} size="small">
                  <Descriptions.Item label="周期">{latestBacktest.period}</Descriptions.Item>
                  <Descriptions.Item label="K线">{latestBacktest.candleCount}</Descriptions.Item>
                  <Descriptions.Item label="时间">{formatDate(latestBacktest.createdAt)}</Descriptions.Item>
                  <Descriptions.Item label="滑点">{latestBacktest.config?.slippagePct ?? 0.03}%</Descriptions.Item>
                  <Descriptions.Item label="手续费">{latestBacktest.config?.commissionPct ?? 0.01}%</Descriptions.Item>
                  <Descriptions.Item label="持仓K线">{latestBacktest.config?.exitBars ?? 8}</Descriptions.Item>
                </Descriptions>
                {backtestEquitySeries.length > 0 && (
                  <EquityCurveChart series={backtestEquitySeries} height={220} />
                )}
                <Table
                  rowKey="profileId"
                  size="small"
                  pagination={false}
                  columns={backtestColumns}
                  dataSource={latestBacktest.results || []}
                  scroll={{ x: 980 }}
                  expandable={{
                    rowExpandable: (record) => !!record.stressTests?.length,
                    expandedRowRender: (record) => (
                      <Space wrap>
                        {(record.stressTests || []).map((item) => (
                          <Tag key={item.label} color={item.passed ? 'success' : 'error'}>
                            {item.label} {item.netPnl >= 0 ? '+' : ''}{formatMoney(item.netPnl)} PF {Number(item.profitFactor || 0).toFixed(2)}
                          </Tag>
                        ))}
                      </Space>
                    ),
                  }}
                />
              </Space>
            ) : (
              <Text type="secondary">暂无回测记录</Text>
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card className="workspace-card" title="AI报告历史" extra={<Text type="secondary">点击查看可切换当前报告</Text>}>
            <Table
              rowKey="_id"
              size="small"
              columns={reportColumns}
              dataSource={reports}
              pagination={{ pageSize: 6, showSizeChanger: false }}
              scroll={{ x: 720 }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card className="workspace-card" title="账号表现统计" extra={<Text type="secondary">按模拟账号汇总</Text>}>
            <Table
              rowKey="key"
              size="small"
              columns={accountStatColumns}
              dataSource={accountStats}
              pagination={false}
              scroll={{ x: 860 }}
            />
          </Card>
        </Col>
      </Row>

      <Card className="workspace-card" title="模拟账号收益曲线" extra={<Text type="secondary">按权益展示</Text>}>
        {accountEquitySeries.length > 0 ? (
          <EquityCurveChart series={accountEquitySeries} />
        ) : (
          <Text type="secondary">暂无模拟交易记录</Text>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        {orderedAccounts.map((account) => {
          const openTrade = account.openTrade;
          const latestTrade = account.tradeLog?.[0];
          const pnl = Number(account.realizedPnl || 0);

          return (
            <Col xs={24} md={12} xl={6} key={account.profileId}>
              <Card
                className="workspace-card"
                title={
                  <Space>
                    <FundProjectionScreenOutlined />
                    <span>{account.name}</span>
                  </Space>
                }
                extra={openTrade ? directionTag(openTrade.direction) : <Tag>空仓</Tag>}
              >
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                  <Text type="secondary">{account.description}</Text>
                  <Row gutter={[12, 12]}>
                    <Col span={12}>
                      <Statistic title="余额" value={account.balance} precision={2} prefix="$" valueStyle={{ fontSize: 18 }} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="权益" value={account.equity} precision={2} prefix="$" valueStyle={{ fontSize: 18 }} />
                    </Col>
                  </Row>
                  <Statistic
                    title="已实现盈亏"
                    value={pnl}
                    precision={2}
                    prefix="$"
                    valueStyle={{ color: pnl >= 0 ? '#16a34a' : '#dc2626', fontSize: 20 }}
                  />
                  <Descriptions column={1} size="small">
                    <Descriptions.Item label="单笔风险">{account.riskPerTradePct}%</Descriptions.Item>
                    <Descriptions.Item label="最大仓位">{account.maxPositionPct}%</Descriptions.Item>
                    <Descriptions.Item label="置信阈值">{account.minConfidence}%</Descriptions.Item>
                    <Descriptions.Item label="最新动作">
                      {latestTrade ? latestTrade.reason : '暂无'}
                    </Descriptions.Item>
                  </Descriptions>
                </Space>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Card
        className="workspace-card"
        title="买卖记录"
        extra={<Text type="secondary">显示开仓、平仓和跳过原因</Text>}
      >
        <Table
          rowKey="key"
          size="small"
          columns={tradeColumns}
          dataSource={tradeRows}
          pagination={{ pageSize: 10, showSizeChanger: false }}
          scroll={{ x: 1280 }}
        />
      </Card>
    </div>
  );
}
