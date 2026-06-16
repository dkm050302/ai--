import type { GoldHistoryCandle, GoldHistoryMeta } from './goldHistory';
import {
  GOLD_STRATEGY_LIBRARY,
  getStrategyDecision,
  type GoldStrategyDefinition,
} from './goldStrategyLibrary';

type TradeDirection = 'long' | 'short';
type RuntimeStatus = 'running' | 'watching' | 'paused';
type RuntimeGroup = 'profit' | 'loss' | 'watching' | 'paused';
type SelectionLabel = 'selected' | 'candidate' | 'watching' | 'downgraded' | 'frozen';
type RiskAction = 'allow' | 'reduce' | 'watch' | 'freeze';

interface IndicatorContext {
  candles: GoldHistoryCandle[];
  index: number;
  close: number;
  previousClose: number;
  ma12: number;
  ma20: number;
  ma50: number;
  ma89: number;
  ma200: number;
  std20: number;
  atr14: number;
  atr50: number;
  high20: number;
  low20: number;
  high55: number;
  low55: number;
}

interface OpenTrade {
  strategyId: string;
  direction: TradeDirection;
  entryTime: number;
  entryPrice: number;
  volume: number;
  stopLoss: number;
  takeProfit: number;
  openedIndex: number;
}

interface RuntimeTrade {
  strategyId: string;
  direction: TradeDirection;
  status: 'closed';
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  volume: number;
  stopLoss: number;
  takeProfit: number;
  pnl: number;
  cost: number;
  reason: string;
}

interface RuntimeEquityPoint {
  time: string;
  balance: number;
  equity: number;
  drawdownPct: number;
  openPosition: boolean;
}

export interface StrategyRuntimeResult {
  strategyId: string;
  name: string;
  summary: string;
  tags: string[];
  direction: string;
  method: string;
  kind: string;
  session: string;
  horizon: string;
  style: string;
  riskScore: number;
  status: RuntimeStatus;
  statusLabel: string;
  portfolioGroup: RuntimeGroup;
  selectionLabel: SelectionLabel;
  riskAction: RiskAction;
  riskReason: string;
  stableForAiTrader: boolean;
  consecutiveLosses: number;
  startingCapital: number;
  allocatedCapital: number;
  endingEquity: number;
  pnl: number;
  pnlPct: number;
  trades: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  openPosition: boolean;
  lastSignal?: TradeDirection;
  lastTradeAt?: string;
  tradeLog: RuntimeTrade[];
  equityCurve: RuntimeEquityPoint[];
}

export interface StrategyRuntimeOutput {
  meta: GoldHistoryMeta;
  initialBalance: number;
  summary: {
    totalEquity: number;
    totalPnl: number;
    totalPnlPct: number;
    totalStartingCapital: number;
    strategyStartingCapital: number;
    profitCount: number;
    lossCount: number;
    runningCount: number;
    watchingCount: number;
    pausedCount: number;
    selectedCount: number;
    downgradedCount: number;
    frozenCount: number;
    openPositions: number;
    totalTrades: number;
    bestStrategyId?: string;
    worstStrategyId?: string;
  };
  strategyResults: StrategyRuntimeResult[];
  dailySnapshots: Array<{
    date: string;
    equity: number;
    pnl: number;
    openPositions: number;
  }>;
  assumption: string;
}

const STRATEGY_TRADER_CAPITAL = 1_000_000;
const SLIPPAGE_PCT = 0.012;
const COMMISSION_PCT = 0.002;

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function getWindow(candles: GoldHistoryCandle[], index: number, size: number): GoldHistoryCandle[] {
  return candles.slice(Math.max(0, index - size + 1), index + 1);
}

function highest(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function lowest(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function getAtr(candles: GoldHistoryCandle[], index: number, size = 14): number {
  const window = getWindow(candles, index, size + 1);
  if (window.length < 2) return 0;
  const ranges = window.slice(1).map((candle, offset) => {
    const previous = window[offset];
    return Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close)
    );
  });
  return average(ranges);
}

function buildContext(candles: GoldHistoryCandle[], index: number): IndicatorContext {
  const close = candles[index].close;
  const previousClose = candles[index - 1]?.close || close;
  const closes20 = getWindow(candles, index, 20).map((candle) => candle.close);

  return {
    candles,
    index,
    close,
    previousClose,
    ma12: average(getWindow(candles, index, 12).map((candle) => candle.close)),
    ma20: average(closes20),
    ma50: average(getWindow(candles, index, 50).map((candle) => candle.close)),
    ma89: average(getWindow(candles, index, 89).map((candle) => candle.close)),
    ma200: average(getWindow(candles, index, 200).map((candle) => candle.close)),
    std20: standardDeviation(closes20),
    atr14: getAtr(candles, index, 14),
    atr50: getAtr(candles, index, 50),
    high20: highest(getWindow(candles, index - 1, 20).map((candle) => candle.high)),
    low20: lowest(getWindow(candles, index - 1, 20).map((candle) => candle.low)),
    high55: highest(getWindow(candles, index - 1, 55).map((candle) => candle.high)),
    low55: lowest(getWindow(candles, index - 1, 55).map((candle) => candle.low)),
  };
}

function allowDirection(strategy: GoldStrategyDefinition, direction: TradeDirection): boolean {
  if (strategy.direction === '纯多头') return direction === 'long';
  if (strategy.direction === '纯空头') return direction === 'short';
  return true;
}

function chooseSignal(strategy: GoldStrategyDefinition, ctx: IndicatorContext): TradeDirection | null {
  let signal: TradeDirection | null = null;
  const trendUp = ctx.close > ctx.ma50 && ctx.ma50 > ctx.ma200;
  const trendDown = ctx.close < ctx.ma50 && ctx.ma50 < ctx.ma200;
  const shortTrendUp = ctx.close > ctx.ma20 && ctx.ma20 > ctx.ma50;
  const shortTrendDown = ctx.close < ctx.ma20 && ctx.ma20 < ctx.ma50;
  const volatilityExpanded = ctx.atr50 > 0 && ctx.atr14 / ctx.atr50 > 1.12;

  if (strategy.method === '趋势跟踪' || strategy.method === '套利过滤') {
    if (strategy.id.includes('21-89')) {
      if (ctx.ma20 > ctx.ma89 && ctx.previousClose <= ctx.ma89 && ctx.close > ctx.ma89) signal = 'long';
      if (ctx.ma20 < ctx.ma89 && ctx.previousClose >= ctx.ma89 && ctx.close < ctx.ma89) signal = 'short';
    } else if (shortTrendUp || trendUp) {
      signal = 'long';
    } else if (shortTrendDown || trendDown) {
      signal = 'short';
    }
  }

  if (strategy.method === '均值回归' || strategy.method === '网格' || strategy.method === '马丁') {
    const deviation = Math.max(ctx.std20 * 1.15, ctx.atr14 * 0.7);
    if (ctx.close < ctx.ma20 - deviation) signal = 'long';
    if (ctx.close > ctx.ma20 + deviation) signal = 'short';
  }

  if (strategy.method === '突破' || strategy.method === '波动率') {
    const high = strategy.id.includes('55') ? ctx.high55 : ctx.high20;
    const low = strategy.id.includes('55') ? ctx.low55 : ctx.low20;
    if (ctx.close > high && (ctx.close > ctx.ma50 || volatilityExpanded)) signal = 'long';
    if (ctx.close < low && (ctx.close < ctx.ma50 || volatilityExpanded)) signal = 'short';
  }

  if (strategy.method === '剥头皮') {
    if (ctx.close > ctx.ma12 && ctx.close > ctx.previousClose && volatilityExpanded) signal = 'long';
    if (ctx.close < ctx.ma12 && ctx.close < ctx.previousClose && volatilityExpanded) signal = 'short';
  }

  if (strategy.method === '事件驱动') {
    if (!volatilityExpanded) return null;
    if (ctx.close > ctx.high20) signal = 'long';
    if (ctx.close < ctx.low20) signal = 'short';
    if (strategy.direction === '纯多头' && ctx.close > ctx.previousClose) signal = 'long';
  }

  if (!signal || !allowDirection(strategy, signal)) return null;
  return signal;
}

function getMaxHoldBars(strategy: GoldStrategyDefinition): number {
  if (strategy.horizon === '日内高频') return 8;
  if (strategy.horizon === '日内短线') return 18;
  if (strategy.horizon === '中期波段') return 54;
  return 120;
}

function getCooldownBars(strategy: GoldStrategyDefinition): number {
  if (strategy.horizon === '日内高频') return 2;
  if (strategy.horizon === '日内短线') return 4;
  if (strategy.horizon === '中期波段') return 8;
  return 12;
}

function getRiskParams(strategy: GoldStrategyDefinition): { stopAtr: number; rewardRisk: number; riskPct: number; maxPositionPct: number } {
  if (strategy.style === '防守') return { stopAtr: 1.3, rewardRisk: 1.05, riskPct: 0.35, maxPositionPct: 18 };
  if (strategy.style === '稳健') return { stopAtr: 1.7, rewardRisk: 1.35, riskPct: 0.55, maxPositionPct: 24 };
  if (strategy.style === '中风险') return { stopAtr: 2.1, rewardRisk: 1.65, riskPct: 0.78, maxPositionPct: 30 };
  if (strategy.style === '激进') return { stopAtr: 2.5, rewardRisk: 1.9, riskPct: 1.05, maxPositionPct: 36 };
  return { stopAtr: 3.2, rewardRisk: 2.3, riskPct: 1.25, maxPositionPct: 30 };
}

function executionPrice(direction: TradeDirection, rawPrice: number, side: 'entry' | 'exit'): number {
  const slip = SLIPPAGE_PCT / 100;
  if (direction === 'long') return side === 'entry' ? rawPrice * (1 + slip) : rawPrice * (1 - slip);
  return side === 'entry' ? rawPrice * (1 - slip) : rawPrice * (1 + slip);
}

function calculatePnl(direction: TradeDirection, entry: number, exit: number, volume: number): number {
  return (direction === 'long' ? exit - entry : entry - exit) * volume;
}

function toIsoFromSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

function closeTrade(trade: OpenTrade, rawExit: number, exitTime: number, reason: string): RuntimeTrade {
  const exitPrice = executionPrice(trade.direction, rawExit, 'exit');
  const grossPnl = calculatePnl(trade.direction, trade.entryPrice, exitPrice, trade.volume);
  const cost = (Math.abs(trade.entryPrice) + Math.abs(exitPrice)) * trade.volume * (COMMISSION_PCT / 100);

  return {
    strategyId: trade.strategyId,
    direction: trade.direction,
    status: 'closed',
    entryTime: toIsoFromSeconds(trade.entryTime),
    exitTime: toIsoFromSeconds(exitTime),
    entryPrice: Number(trade.entryPrice.toFixed(2)),
    exitPrice: Number(exitPrice.toFixed(2)),
    volume: Number(trade.volume.toFixed(4)),
    stopLoss: Number(trade.stopLoss.toFixed(2)),
    takeProfit: Number(trade.takeProfit.toFixed(2)),
    pnl: Number((grossPnl - cost).toFixed(2)),
    cost: Number(cost.toFixed(2)),
    reason,
  };
}

function profitFactor(trades: RuntimeTrade[]): number {
  const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  if (grossProfit > 0 && grossLoss === 0) return 99;
  if (grossProfit === 0 && grossLoss === 0) return 0;
  return Number((grossProfit / Math.max(grossLoss, 0.01)).toFixed(2));
}

function countConsecutiveLosses(trades: RuntimeTrade[]): number {
  let count = 0;
  for (let index = trades.length - 1; index >= 0; index -= 1) {
    if (trades[index].pnl < 0) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function classifyRuntime(
  status: RuntimeStatus,
  pnl: number,
  trades: number,
  winRate: number,
  maxDrawdown: number,
  consecutiveLosses: number,
  profitFactorValue: number
): {
  portfolioGroup: RuntimeGroup;
  selectionLabel: SelectionLabel;
  riskAction: RiskAction;
  riskReason: string;
  stableForAiTrader: boolean;
} {
  if (status === 'paused') {
    return {
      portfolioGroup: 'paused',
      selectionLabel: 'frozen',
      riskAction: 'freeze',
      riskReason: '策略处于暂停状态，不参与本轮资金分配',
      stableForAiTrader: false,
    };
  }

  if (status === 'watching') {
    return {
      portfolioGroup: 'watching',
      selectionLabel: 'watching',
      riskAction: 'watch',
      riskReason: '观察策略只记录表现，暂不作为AI交易员主力选择',
      stableForAiTrader: false,
    };
  }

  if (trades >= 5 && (consecutiveLosses >= 5 || maxDrawdown >= 10)) {
    return {
      portfolioGroup: pnl >= 0 ? 'profit' : 'loss',
      selectionLabel: 'frozen',
      riskAction: 'freeze',
      riskReason: consecutiveLosses >= 5 ? '连续亏损达到5笔，风控员冻结开仓' : '最大回撤达到10%，风控员冻结开仓',
      stableForAiTrader: false,
    };
  }

  if (trades >= 3 && (consecutiveLosses >= 3 || maxDrawdown >= 6 || pnl < 0)) {
    return {
      portfolioGroup: pnl >= 0 ? 'profit' : 'loss',
      selectionLabel: 'downgraded',
      riskAction: 'reduce',
      riskReason: consecutiveLosses >= 3 ? '连续亏损达到3笔，风控员降权' : pnl < 0 ? '当前净亏损，降低资金权重' : '回撤超过警戒线，降低资金权重',
      stableForAiTrader: false,
    };
  }

  const stableForAiTrader = pnl > 0 && trades >= 8 && winRate >= 45 && maxDrawdown <= 6 && profitFactorValue >= 1.05;
  if (stableForAiTrader) {
    return {
      portfolioGroup: 'profit',
      selectionLabel: 'selected',
      riskAction: 'allow',
      riskReason: '盈利、回撤、样本数量均通过，允许AI交易员优先选择',
      stableForAiTrader: true,
    };
  }

  return {
    portfolioGroup: pnl >= 0 ? 'profit' : 'loss',
    selectionLabel: pnl >= 0 ? 'candidate' : 'downgraded',
    riskAction: pnl >= 0 ? 'allow' : 'reduce',
    riskReason: pnl >= 0 ? '盈利但样本或稳定性不足，进入候选队列' : '当前亏损，暂不进入AI交易员主力池',
    stableForAiTrader: false,
  };
}

function markOpenTrade(openTrade: OpenTrade | null, price: number): number {
  if (!openTrade) return 0;
  return calculatePnl(openTrade.direction, openTrade.entryPrice, price, openTrade.volume);
}

function simulateOneStrategy(
  strategy: GoldStrategyDefinition,
  candles: GoldHistoryCandle[],
  strategyStartingCapital: number
): StrategyRuntimeResult {
  const decision = getStrategyDecision(strategy);
  const allocatedCapital = strategyStartingCapital;
  const status: RuntimeStatus = decision === '运行' ? 'running' : decision === '观察' ? 'watching' : 'paused';
  const statusLabel = decision === '运行' ? '模拟运行' : decision === '观察' ? '观察中' : '暂停';
  const runScale = status === 'running' ? 1 : status === 'watching' ? 0.35 : 0;
  const riskParams = getRiskParams(strategy);
  const maxHoldBars = getMaxHoldBars(strategy);
  const cooldownBars = getCooldownBars(strategy);
  const tradeLog: RuntimeTrade[] = [];
  const equityCurve: RuntimeEquityPoint[] = [];
  let balance = allocatedCapital;
  let peak = allocatedCapital;
  let maxDrawdown = 0;
  let openTrade: OpenTrade | null = null;
  let lastSignal: TradeDirection | undefined;
  let nextAllowedEntryIndex = 220;

  if (status === 'paused') {
    return {
      strategyId: strategy.id,
      name: strategy.name,
      summary: strategy.summary,
      tags: strategy.tags,
      direction: strategy.direction,
      method: strategy.method,
      kind: strategy.kind,
      session: strategy.session,
      horizon: strategy.horizon,
      style: strategy.style,
      riskScore: strategy.riskScore,
      status,
      statusLabel,
      portfolioGroup: 'paused',
      selectionLabel: 'frozen',
      riskAction: 'freeze',
      riskReason: '策略处于暂停状态，不参与本轮资金分配',
      stableForAiTrader: false,
      consecutiveLosses: 0,
      startingCapital: strategyStartingCapital,
      allocatedCapital,
      endingEquity: allocatedCapital,
      pnl: 0,
      pnlPct: 0,
      trades: 0,
      winRate: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      openPosition: false,
      tradeLog,
      equityCurve,
    };
  }

  for (let index = 220; index < candles.length - 1; index += 1) {
    const candle = candles[index];
    const nextCandle = candles[index + 1];

    if (openTrade) {
      let exitPrice: number | null = null;
      let exitReason = '';
      if (openTrade.direction === 'long') {
        if (candle.low <= openTrade.stopLoss) {
          exitPrice = openTrade.stopLoss;
          exitReason = 'stop';
        } else if (candle.high >= openTrade.takeProfit) {
          exitPrice = openTrade.takeProfit;
          exitReason = 'take';
        }
      } else if (candle.high >= openTrade.stopLoss) {
        exitPrice = openTrade.stopLoss;
        exitReason = 'stop';
      } else if (candle.low <= openTrade.takeProfit) {
        exitPrice = openTrade.takeProfit;
        exitReason = 'take';
      }

      if (!exitPrice && index - openTrade.openedIndex >= maxHoldBars) {
        exitPrice = candle.close;
        exitReason = 'time';
      }

      if (exitPrice) {
        const closed = closeTrade(openTrade, exitPrice, candle.time, exitReason);
        tradeLog.push(closed);
        balance = Number((balance + closed.pnl).toFixed(2));
        openTrade = null;
        nextAllowedEntryIndex = index + cooldownBars;
      }
    }

    const markPnl = markOpenTrade(openTrade, candle.close);
    const equity = Number((balance + markPnl).toFixed(2));
    peak = Math.max(peak, equity);
    maxDrawdown = Math.max(maxDrawdown, peak > 0 ? ((peak - equity) / peak) * 100 : 0);

    if (index % 24 === 0 || index === candles.length - 2) {
      equityCurve.push({
        time: toIsoFromSeconds(candle.time),
        balance: Number(balance.toFixed(2)),
        equity,
        drawdownPct: Number(maxDrawdown.toFixed(2)),
        openPosition: Boolean(openTrade),
      });
    }

    if (openTrade || !nextCandle || index < nextAllowedEntryIndex) continue;

    const ctx = buildContext(candles, index);
    const signal = chooseSignal(strategy, ctx);
    if (!signal || ctx.atr14 <= 0) continue;
    lastSignal = signal;

    const rawEntry = nextCandle.open;
    const entryPrice = executionPrice(signal, rawEntry, 'entry');
    const stopDistance = ctx.atr14 * riskParams.stopAtr;
    const stopLoss = signal === 'long' ? rawEntry - stopDistance : rawEntry + stopDistance;
    const takeProfit = signal === 'long'
      ? rawEntry + stopDistance * riskParams.rewardRisk
      : rawEntry - stopDistance * riskParams.rewardRisk;
    const riskBudget = balance * (riskParams.riskPct / 100) * runScale;
    const volumeByRisk = riskBudget / Math.max(stopDistance, 0.01);
    const volumeByCap = (balance * (riskParams.maxPositionPct / 100) * runScale) / Math.max(entryPrice, 0.01);
    const volume = Math.max(0, Math.min(volumeByRisk, volumeByCap));
    if (volume <= 0) continue;

    openTrade = {
      strategyId: strategy.id,
      direction: signal,
      entryTime: nextCandle.time,
      entryPrice,
      volume,
      stopLoss,
      takeProfit,
      openedIndex: index + 1,
    };
  }

  const lastCandle = candles[candles.length - 1];
  const openPnl = markOpenTrade(openTrade, lastCandle?.close || 0);
  const endingEquity = Number((balance + openPnl).toFixed(2));
  const pnl = Number((endingEquity - allocatedCapital).toFixed(2));
  const wins = tradeLog.filter((trade) => trade.pnl > 0).length;
  const winRate = tradeLog.length ? Number(((wins / tradeLog.length) * 100).toFixed(1)) : 0;
  const profitFactorValue = profitFactor(tradeLog);
  const consecutiveLosses = countConsecutiveLosses(tradeLog);
  const classification = classifyRuntime(
    status,
    pnl,
    tradeLog.length,
    winRate,
    Number(maxDrawdown.toFixed(2)),
    consecutiveLosses,
    profitFactorValue
  );

  return {
    strategyId: strategy.id,
    name: strategy.name,
    summary: strategy.summary,
    tags: strategy.tags,
    direction: strategy.direction,
    method: strategy.method,
    kind: strategy.kind,
    session: strategy.session,
    horizon: strategy.horizon,
    style: strategy.style,
    riskScore: strategy.riskScore,
    status,
    statusLabel,
    ...classification,
    consecutiveLosses,
    startingCapital: strategyStartingCapital,
    allocatedCapital,
    endingEquity,
    pnl,
    pnlPct: allocatedCapital > 0 ? Number(((pnl / allocatedCapital) * 100).toFixed(2)) : 0,
    trades: tradeLog.length,
    winRate,
    profitFactor: profitFactorValue,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    openPosition: Boolean(openTrade),
    lastSignal,
    lastTradeAt: tradeLog[tradeLog.length - 1]?.exitTime || (openTrade ? toIsoFromSeconds(openTrade.entryTime) : undefined),
    tradeLog: tradeLog.slice(-40),
    equityCurve,
  };
}

function buildDailySnapshots(results: StrategyRuntimeResult[]) {
  const map = new Map<string, { equity: number; pnl: number; openPositions: number }>();
  for (const result of results) {
    for (const point of result.equityCurve) {
      const date = point.time.slice(0, 10);
      const item = map.get(date) || { equity: 0, pnl: 0, openPositions: 0 };
      item.equity += point.equity;
      item.pnl += point.equity - result.allocatedCapital;
      item.openPositions += point.openPosition ? 1 : 0;
      map.set(date, item);
    }
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-120)
    .map(([date, item]) => ({
      date,
      equity: Number(item.equity.toFixed(2)),
      pnl: Number(item.pnl.toFixed(2)),
      openPositions: item.openPositions,
    }));
}

export function runGoldStrategyRuntime(
  candles: GoldHistoryCandle[],
  meta: GoldHistoryMeta,
  strategyStartingCapital = STRATEGY_TRADER_CAPITAL
): StrategyRuntimeOutput {
  const strategyResults = GOLD_STRATEGY_LIBRARY.map((strategy) => simulateOneStrategy(strategy, candles, strategyStartingCapital));
  const totalStartingCapital = Number((strategyStartingCapital * GOLD_STRATEGY_LIBRARY.length).toFixed(2));
  const totalEquity = Number(strategyResults.reduce((sum, item) => sum + item.endingEquity, 0).toFixed(2));
  const totalPnl = Number((totalEquity - totalStartingCapital).toFixed(2));
  const profitCount = strategyResults.filter((item) => item.portfolioGroup === 'profit').length;
  const lossCount = strategyResults.filter((item) => item.portfolioGroup === 'loss').length;
  const runningCount = strategyResults.filter((item) => item.status === 'running').length;
  const watchingCount = strategyResults.filter((item) => item.status === 'watching').length;
  const pausedCount = strategyResults.filter((item) => item.status === 'paused').length;
  const selectedCount = strategyResults.filter((item) => item.selectionLabel === 'selected').length;
  const downgradedCount = strategyResults.filter((item) => item.selectionLabel === 'downgraded').length;
  const frozenCount = strategyResults.filter((item) => item.selectionLabel === 'frozen').length;
  const openPositions = strategyResults.filter((item) => item.openPosition).length;
  const totalTrades = strategyResults.reduce((sum, item) => sum + item.trades, 0);
  const sortedByPnl = [...strategyResults].sort((a, b) => b.pnl - a.pnl);

  return {
    meta,
    initialBalance: strategyStartingCapital,
    summary: {
      totalEquity,
      totalPnl,
      totalPnlPct: Number(((totalPnl / totalStartingCapital) * 100).toFixed(2)),
      totalStartingCapital,
      strategyStartingCapital,
      profitCount,
      lossCount,
      runningCount,
      watchingCount,
      pausedCount,
      selectedCount,
      downgradedCount,
      frozenCount,
      openPositions,
      totalTrades,
      bestStrategyId: sortedByPnl[0]?.strategyId,
      worstStrategyId: sortedByPnl[sortedByPnl.length - 1]?.strategyId,
    },
    strategyResults,
    dailySnapshots: buildDailySnapshots(strategyResults),
    assumption: [
      '40策略模拟运行：使用真实/缓存黄金K线，不使用mock收益',
      `每个策略交易员独立使用${strategyStartingCapital.toLocaleString()}美元测试资金，40个策略合计${totalStartingCapital.toLocaleString()}美元`,
      '入场使用下一根K线开盘价，包含黄金交易成本、滑点、手续费和开仓冷却',
      'AI交易员只优先选择盈利、回撤低、样本足够的策略；风控员会对连续亏损策略降权或冻结',
      '观察中策略以较小风险缩放运行，用于统计观察，不等同实盘下单',
    ].join('；'),
  };
}
