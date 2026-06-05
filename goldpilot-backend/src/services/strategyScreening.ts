import type { GoldHistoryCandle } from './goldHistory';

export interface StrategyScreenConfig {
  initialBalance: number;
  riskPerTradePct: number;
  maxPositionPct: number;
  slippagePct: number;
  commissionPct: number;
}

export interface StrategyScreenResult {
  strategyId: string;
  name: string;
  description: string;
  trades: number;
  winRate: number;
  netPnl: number;
  endingBalance: number;
  maxDrawdown: number;
  profitFactor: number;
  expectancy: number;
  totalCost: number;
  score: number;
  sampleWarning: boolean;
  train: SegmentMetrics;
  validation: SegmentMetrics;
  stressTests: Array<{
    label: string;
    passed: boolean;
    trades: number;
    netPnl: number;
    maxDrawdown: number;
    profitFactor: number;
  }>;
  note: string;
}

export interface StrategyScreenOutput {
  config: StrategyScreenConfig;
  results: StrategyScreenResult[];
  recommendation: {
    strategyId?: string;
    name?: string;
    score?: number;
    reason: string;
    warnings: string[];
  };
}

interface SegmentMetrics {
  trades: number;
  winRate: number;
  netPnl: number;
  profitFactor: number;
}

interface TradeRecord {
  direction: 'long' | 'short';
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  volume: number;
  pnl: number;
  cost: number;
  exitReason: string;
}

interface StrategyDefinition {
  strategyId: string;
  name: string;
  description: string;
  warmupBars: number;
  maxHoldBars: number;
  stopAtr: number;
  rewardRisk: number;
  signal: (ctx: IndicatorContext) => 'long' | 'short' | null;
}

interface IndicatorContext {
  candles: GoldHistoryCandle[];
  index: number;
  close: number;
  previousClose: number;
  ma20: number;
  ma50: number;
  ma100: number;
  ma200: number;
  std20: number;
  atr14: number;
  high20: number;
  low20: number;
}

interface OpenTrade {
  direction: 'long' | 'short';
  entryTime: number;
  entryPrice: number;
  volume: number;
  stopLoss: number;
  takeProfit: number;
  openedIndex: number;
}

const DEFAULT_CONFIG: StrategyScreenConfig = {
  initialBalance: 1_000_000,
  riskPerTradePct: 1,
  maxPositionPct: 35,
  slippagePct: 0.04,
  commissionPct: 0.01,
};

const STRATEGIES: StrategyDefinition[] = [
  {
    strategyId: 'trend-ma-50-200',
    name: 'MA50/200 趋势跟随',
    description: '收盘价、MA50、MA200 同向排列时顺势进场，反向排列退出。',
    warmupBars: 220,
    maxHoldBars: 28,
    stopAtr: 2.2,
    rewardRisk: 1.8,
    signal: (ctx) => {
      if (ctx.close > ctx.ma50 && ctx.ma50 > ctx.ma200) return 'long';
      if (ctx.close < ctx.ma50 && ctx.ma50 < ctx.ma200) return 'short';
      return null;
    },
  },
  {
    strategyId: 'mean-reversion-band',
    name: 'MA20 偏离回归',
    description: '价格偏离 MA20 超过 1.4 个标准差时做均值回归，适合震荡环境。',
    warmupBars: 60,
    maxHoldBars: 10,
    stopAtr: 1.6,
    rewardRisk: 1.1,
    signal: (ctx) => {
      if (ctx.std20 <= 0) return null;
      if (ctx.close < ctx.ma20 - ctx.std20 * 1.4) return 'long';
      if (ctx.close > ctx.ma20 + ctx.std20 * 1.4) return 'short';
      return null;
    },
  },
  {
    strategyId: 'momentum-pullback',
    name: '趋势回撤再启动',
    description: '大趋势由 MA100 定义，价格回撤到 MA20 附近并重新转强/转弱时进场。',
    warmupBars: 120,
    maxHoldBars: 18,
    stopAtr: 1.9,
    rewardRisk: 1.6,
    signal: (ctx) => {
      const pullbackBand = Math.max(ctx.atr14, ctx.close * 0.003);
      if (ctx.close > ctx.ma100 && Math.abs(ctx.close - ctx.ma20) <= pullbackBand && ctx.close > ctx.previousClose) {
        return 'long';
      }
      if (ctx.close < ctx.ma100 && Math.abs(ctx.close - ctx.ma20) <= pullbackBand && ctx.close < ctx.previousClose) {
        return 'short';
      }
      return null;
    },
  },
  {
    strategyId: 'volatility-breakout',
    name: '20K 波动突破',
    description: '突破过去20根K线高低点后顺势进场，使用 ATR 控制止损。',
    warmupBars: 80,
    maxHoldBars: 14,
    stopAtr: 2,
    rewardRisk: 1.7,
    signal: (ctx) => {
      if (ctx.close > ctx.high20 && ctx.close > ctx.ma50) return 'long';
      if (ctx.close < ctx.low20 && ctx.close < ctx.ma50) return 'short';
      return null;
    },
  },
];

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function highest(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function lowest(values: number[]): number {
  return values.length ? Math.min(...values) : 0;
}

function getWindow(candles: GoldHistoryCandle[], index: number, size: number): GoldHistoryCandle[] {
  return candles.slice(Math.max(0, index - size + 1), index + 1);
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
  const highs20 = getWindow(candles, index - 1, 20).map((candle) => candle.high);
  const lows20 = getWindow(candles, index - 1, 20).map((candle) => candle.low);

  return {
    candles,
    index,
    close,
    previousClose,
    ma20: average(closes20),
    ma50: average(getWindow(candles, index, 50).map((candle) => candle.close)),
    ma100: average(getWindow(candles, index, 100).map((candle) => candle.close)),
    ma200: average(getWindow(candles, index, 200).map((candle) => candle.close)),
    std20: standardDeviation(closes20),
    atr14: getAtr(candles, index, 14),
    high20: highest(highs20),
    low20: lowest(lows20),
  };
}

function executionPrice(direction: 'long' | 'short', rawPrice: number, slippagePct: number, side: 'entry' | 'exit'): number {
  const slip = slippagePct / 100;
  if (direction === 'long') {
    return side === 'entry' ? rawPrice * (1 + slip) : rawPrice * (1 - slip);
  }
  return side === 'entry' ? rawPrice * (1 - slip) : rawPrice * (1 + slip);
}

function calculatePnl(direction: 'long' | 'short', entry: number, exit: number, volume: number): number {
  const diff = direction === 'long' ? exit - entry : entry - exit;
  return diff * volume;
}

function closeTrade(
  trade: OpenTrade,
  rawExit: number,
  exitTime: number,
  exitReason: string,
  config: StrategyScreenConfig
): TradeRecord {
  const exitPrice = executionPrice(trade.direction, rawExit, config.slippagePct, 'exit');
  const grossPnl = calculatePnl(trade.direction, trade.entryPrice, exitPrice, trade.volume);
  const cost = (Math.abs(trade.entryPrice) + Math.abs(exitPrice)) * trade.volume * (config.commissionPct / 100);

  return {
    direction: trade.direction,
    entryTime: trade.entryTime,
    exitTime,
    entryPrice: Number(trade.entryPrice.toFixed(2)),
    exitPrice: Number(exitPrice.toFixed(2)),
    volume: Number(trade.volume.toFixed(4)),
    pnl: Number((grossPnl - cost).toFixed(2)),
    cost: Number(cost.toFixed(2)),
    exitReason,
  };
}

function profitFactor(trades: TradeRecord[]): number {
  const grossProfit = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const grossLoss = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  if (grossProfit > 0 && grossLoss === 0) return 99;
  if (grossProfit === 0 && grossLoss === 0) return 0;
  return Number((grossProfit / Math.max(grossLoss, 0.01)).toFixed(2));
}

function segmentMetrics(trades: TradeRecord[], initialBalance: number): SegmentMetrics {
  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const netPnl = trades.reduce((sum, trade) => sum + trade.pnl, 0);

  return {
    trades: trades.length,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    netPnl: Number(netPnl.toFixed(2)),
    profitFactor: profitFactor(trades),
  };
}

function summarizeStress(label: string, result: Omit<StrategyScreenResult, 'stressTests'>) {
  const passed = result.trades >= 20 && result.netPnl >= 0 && result.profitFactor >= 1 && result.maxDrawdown <= 25;
  return {
    label,
    passed,
    trades: result.trades,
    netPnl: result.netPnl,
    maxDrawdown: result.maxDrawdown,
    profitFactor: result.profitFactor,
  };
}

function simulateStrategy(
  strategy: StrategyDefinition,
  candles: GoldHistoryCandle[],
  config: StrategyScreenConfig,
  includeStress = true
): StrategyScreenResult {
  let balance = config.initialBalance;
  let peak = config.initialBalance;
  let maxDrawdown = 0;
  let openTrade: OpenTrade | null = null;
  const trades: TradeRecord[] = [];

  for (let i = strategy.warmupBars; i < candles.length - 1; i += 1) {
    const candle = candles[i];
    const nextCandle = candles[i + 1];

    if (openTrade) {
      let rawExit: number | null = null;
      let exitReason = '';

      if (openTrade.direction === 'long') {
        if (candle.low <= openTrade.stopLoss) {
          rawExit = openTrade.stopLoss;
          exitReason = 'stop';
        } else if (candle.high >= openTrade.takeProfit) {
          rawExit = openTrade.takeProfit;
          exitReason = 'take';
        }
      } else if (candle.high >= openTrade.stopLoss) {
        rawExit = openTrade.stopLoss;
        exitReason = 'stop';
      } else if (candle.low <= openTrade.takeProfit) {
        rawExit = openTrade.takeProfit;
        exitReason = 'take';
      }

      if (!rawExit && i - openTrade.openedIndex >= strategy.maxHoldBars) {
        rawExit = candle.close;
        exitReason = 'time';
      }

      if (rawExit) {
        const closed = closeTrade(openTrade, rawExit, candle.time, exitReason, config);
        trades.push(closed);
        balance = Number((balance + closed.pnl).toFixed(2));
        peak = Math.max(peak, balance);
        maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
        openTrade = null;
      }
    }

    if (openTrade) {
      continue;
    }

    const ctx = buildContext(candles, i);
    const direction = strategy.signal(ctx);
    if (!direction || ctx.atr14 <= 0 || !nextCandle) {
      continue;
    }

    const rawEntry = nextCandle.open;
    const entryPrice = executionPrice(direction, rawEntry, config.slippagePct, 'entry');
    const stopDistance = ctx.atr14 * strategy.stopAtr;
    const stopLoss = direction === 'long' ? rawEntry - stopDistance : rawEntry + stopDistance;
    const takeProfit = direction === 'long'
      ? rawEntry + stopDistance * strategy.rewardRisk
      : rawEntry - stopDistance * strategy.rewardRisk;
    const riskBudget = balance * (config.riskPerTradePct / 100);
    const volumeByRisk = riskBudget / Math.max(stopDistance, 0.01);
    const volumeByCap = (balance * (config.maxPositionPct / 100)) / Math.max(entryPrice, 0.01);
    const volume = Math.max(0, Math.min(volumeByRisk, volumeByCap));

    if (volume <= 0) {
      continue;
    }

    openTrade = {
      direction,
      entryTime: nextCandle.time,
      entryPrice,
      volume,
      stopLoss,
      takeProfit,
      openedIndex: i + 1,
    };
  }

  if (openTrade) {
    const last = candles[candles.length - 1];
    const closed = closeTrade(openTrade, last.close, last.time, 'end', config);
    trades.push(closed);
    balance = Number((balance + closed.pnl).toFixed(2));
    peak = Math.max(peak, balance);
    maxDrawdown = Math.max(maxDrawdown, ((peak - balance) / peak) * 100);
  }

  const wins = trades.filter((trade) => trade.pnl > 0).length;
  const netPnl = Number((balance - config.initialBalance).toFixed(2));
  const pf = profitFactor(trades);
  const totalCost = trades.reduce((sum, trade) => sum + trade.cost, 0);
  const splitTime = candles[Math.floor(candles.length * 0.7)]?.time || 0;
  const train = segmentMetrics(trades.filter((trade) => trade.exitTime <= splitTime), config.initialBalance);
  const validation = segmentMetrics(trades.filter((trade) => trade.exitTime > splitTime), config.initialBalance);
  const samplePenalty = trades.length < 30 ? 0.45 : trades.length < 80 ? 0.75 : 1;
  const validationPenalty = validation.netPnl < 0 ? 0.45 : validation.trades < 10 ? 0.7 : 1;
  const drawdownPenalty = Math.max(0.2, 1 - Math.min(maxDrawdown, 55) / 70);
  const profitScore = Math.max(0, Math.min(netPnl / (config.initialBalance * 0.18), 1));
  const pfScore = Math.max(0, Math.min(pf, 3) / 3);
  const validationScore = validation.netPnl > 0 ? 1 : 0;
  const baseScore = (profitScore * 0.3 + pfScore * 0.3 + validationScore * 0.25 + samplePenalty * 0.15)
    * drawdownPenalty
    * validationPenalty;

  const baseResult = {
    strategyId: strategy.strategyId,
    name: strategy.name,
    description: strategy.description,
    trades: trades.length,
    winRate: trades.length ? Number(((wins / trades.length) * 100).toFixed(1)) : 0,
    netPnl,
    endingBalance: balance,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    profitFactor: pf,
    expectancy: trades.length ? Number((netPnl / trades.length).toFixed(2)) : 0,
    totalCost: Number(totalCost.toFixed(2)),
    score: Number((baseScore * 100).toFixed(0)),
    sampleWarning: trades.length < 30,
    train,
    validation,
    note: trades.length < 30
      ? '样本量不足：只能作为观察，不建议进入模拟盘自动执行'
      : '已包含下一根K线入场、滑点、手续费、训练/验证分段和压力测试',
  };

  const stressTests = includeStress
    ? [
      summarizeStress('滑点手续费加倍', simulateStrategy(strategy, candles, {
        ...config,
        slippagePct: Number((config.slippagePct * 2).toFixed(4)),
        commissionPct: Number((config.commissionPct * 2).toFixed(4)),
      }, false)),
      summarizeStress('仓位减半', simulateStrategy(strategy, candles, {
        ...config,
        riskPerTradePct: Number((config.riskPerTradePct * 0.5).toFixed(4)),
        maxPositionPct: Number((config.maxPositionPct * 0.5).toFixed(4)),
      }, false)),
    ]
    : [];

  const stressPassed = stressTests.filter((item) => item.passed).length;
  const stressMultiplier = stressTests.length ? Math.max(0.5, stressPassed / stressTests.length) : 1;

  return {
    ...baseResult,
    score: Number((baseResult.score * stressMultiplier).toFixed(0)),
    stressTests,
  };
}

export function runStrategyScreening(
  candles: GoldHistoryCandle[],
  configInput: Partial<StrategyScreenConfig> = {}
): StrategyScreenOutput {
  const config: StrategyScreenConfig = {
    ...DEFAULT_CONFIG,
    ...configInput,
    initialBalance: Number(configInput.initialBalance || DEFAULT_CONFIG.initialBalance),
    riskPerTradePct: Number(configInput.riskPerTradePct || DEFAULT_CONFIG.riskPerTradePct),
    maxPositionPct: Number(configInput.maxPositionPct || DEFAULT_CONFIG.maxPositionPct),
    slippagePct: Number(configInput.slippagePct ?? DEFAULT_CONFIG.slippagePct),
    commissionPct: Number(configInput.commissionPct ?? DEFAULT_CONFIG.commissionPct),
  };

  const results = STRATEGIES
    .map((strategy) => simulateStrategy(strategy, candles, config))
    .sort((a, b) => b.score - a.score);
  const best = results[0];
  const warnings = [
    ...results.filter((item) => item.sampleWarning).map((item) => `${item.name} 样本量不足`),
    ...results.filter((item) => item.validation.netPnl < 0).map((item) => `${item.name} 验证段亏损`),
  ].slice(0, 6);

  return {
    config,
    results,
    recommendation: best
      ? {
        strategyId: best.strategyId,
        name: best.name,
        score: best.score,
        reason: best.score >= 60
          ? `${best.name} 当前综合分最高，但仍需继续做更长样本和模拟盘验证。`
          : '暂未筛出足够稳健的策略，建议继续扩大历史样本或降低交易频率。',
        warnings,
      }
      : {
        reason: '没有可用策略结果。',
        warnings,
      },
  };
}
