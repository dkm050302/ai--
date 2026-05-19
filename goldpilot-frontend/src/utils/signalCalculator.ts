import type { Candle, Signal } from '@/types';

/**
 * EMA计算（指数移动平均线）
 */
export function calculateEMA(data: number[], period: number): number[] {
  const result: number[] = [];
  const multiplier = 2 / (period + 1);

  // 第一个EMA使用SMA
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);

  // 后续EMA使用公式
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
    result.push(ema);
  }

  return result;
}

/**
 * ATR计算（平均真实波幅）
 */
export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const trueRanges: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const curr = candles[i];
    const prev = candles[i - 1];

    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trueRanges.push(tr);
  }

  // 计算ATR（使用SMA）
  const atr: number[] = [];
  for (let i = period - 1; i < trueRanges.length; i++) {
    const slice = trueRanges.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    atr.push(avg);
  }

  return atr;
}

/**
 * 检测交易信号
 * 规则：
 * - 趋势判断：EMA89 < EMA233 = 空头，EMA89 > EMA233 = 多头
 * - 做空信号：空头趋势 + EMA21下穿EMA89（死叉）
 * - 做多信号：多头趋势 + EMA21上穿EMA89（金叉）
 * - 止盈目标：当前周期ATR14 × 5
 */
export function detectSignals(candles: Candle[]): Signal[] {
  if (candles.length < 233) return [];

  const closes = candles.map(c => c.close);
  const ema21 = calculateEMA(closes, 21);
  const ema89 = calculateEMA(closes, 89);
  const ema233 = calculateEMA(closes, 233);
  const atr = calculateATR(candles, 14);

  const signals: Signal[] = [];
  let pendingSignal: Signal | null = null;

  // EMA计算后数组长度会减少
  // ema21.length = candles.length - 20
  // ema89.length = candles.length - 88
  // ema233.length = candles.length - 232
  // 我们需要从三者都有效的位置开始

  // 找到共同的起始索引
  // ema233最短，所以以它为基准
  // 当EMA21的索引为i时，对应的K线索引是i+20，对应的EMA89索引是i-68，对应的EMA233索引是i-212
  // 这太复杂了，让我简化一下

  // 更简单的方法：直接对齐索引
  // EMA21从第20个索引开始对应第21根K线
  // EMA89从第88个索引开始对应第89根K线
  // EMA233从第232个索引开始对应第233根K线
  // 所以我们从第233根K线开始分析，对应的EMA索引需要调整

  for (let i = 233; i < candles.length; i++) {
    // 当分析第i根K线时：
    // EMA21的索引是 i - 21
    // EMA89的索引是 i - 89
    // EMA233的索引是 i - 233
    // ATR的索引是 i - 1（因为ATR从前一根K线开始）

    const ema21Index = i - 21;
    const ema89Index = i - 89;
    const ema233Index = i - 233;
    const atrIndex = i - 15; // ATR有14个周期，从第15个开始

    if (ema21Index < 0 || ema89Index < 0 || ema233Index < 0 || atrIndex < 0) continue;

    const currentEma21 = ema21[ema21Index];
    const prevEma21 = ema21Index > 0 ? ema21[ema21Index - 1] : currentEma21;
    const currentEma89 = ema89[ema89Index];
    const prevEma89 = ema89Index > 0 ? ema89[ema89Index - 1] : currentEma89;
    const currentEma233 = ema233[ema233Index];

    if (!currentEma21 || !currentEma89 || !currentEma233) continue;

    const candle = candles[i];
    const atrValue = atrIndex < atr.length ? atr[atrIndex] : 2.5;

    // 判断趋势
    const isBullish = currentEma89 > currentEma233; // 多头
    const isBearish = currentEma89 < currentEma233; // 空头

    // 检查死叉（做空信号）
    if (isBearish && prevEma21 > prevEma89 && currentEma21 < currentEma89) {
      const takeProfit = atrValue * 5;

      signals.push({
        id: `signal-${i}`,
        timestamp: candle.time,
        direction: 'short',
        entryPrice: candle.close,
        exitPrice: candle.close - takeProfit,
        profit: 0,
        status: 'pending',
        period: '1m',
        atr: atrValue,
      });

      pendingSignal = signals[signals.length - 1];
    }

    // 检查金叉（做多信号）
    if (isBullish && prevEma21 < prevEma89 && currentEma21 > currentEma89) {
      const takeProfit = atrValue * 5;

      signals.push({
        id: `signal-${i}`,
        timestamp: candle.time,
        direction: 'long',
        entryPrice: candle.close,
        exitPrice: candle.close + takeProfit,
        profit: 0,
        status: 'pending',
        period: '1m',
        atr: atrValue,
      });

      pendingSignal = signals[signals.length - 1];
    }

    // 检查止盈
    if (pendingSignal && pendingSignal.status === 'pending' && pendingSignal.exitPrice) {
      if (pendingSignal.direction === 'short') {
        if (candle.low <= pendingSignal.exitPrice) {
          pendingSignal.status = 'profit';
          pendingSignal.profit = (pendingSignal.entryPrice - pendingSignal.exitPrice) * 100;
          signals.push({
            ...pendingSignal,
            id: `signal-${i}-tp`,
            timestamp: candle.time,
          });
          pendingSignal = null;
        }
      } else if (pendingSignal.direction === 'long') {
        if (candle.high >= pendingSignal.exitPrice) {
          pendingSignal.status = 'profit';
          pendingSignal.profit = (pendingSignal.exitPrice - pendingSignal.entryPrice) * 100;
          signals.push({
            ...pendingSignal,
            id: `signal-${i}-tp`,
            timestamp: candle.time,
          });
          pendingSignal = null;
        }
      }
    }
  }

  return signals;
}

/**
 * 根据信号获取图表标记文本
 */
export function getSignalMarkerText(signal: Signal): string {
  if (signal.status === 'profit') return '止盈';

  if (signal.direction === 'long') return '做多';
  if (signal.direction === 'short') return '做空';

  return '';
}
