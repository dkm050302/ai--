import type { Candle } from '../types';

/**
 * 计算EMA指数移动平均线
 * @param data - 价格数组
 * @param period - 周期
 * @returns EMA值
 */
export function calculateEMA(data: number[], period: number): number {
  if (data.length < period) {
    return 0;
  }

  const k = 2 / (period + 1);
  let ema = data[0];

  for (let i = 1; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }

  return ema;
}

/**
 * 计算ATR平均真实波幅
 * @param candles - K线数据
 * @param period - 周期（默认14）
 * @returns ATR值
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < period + 1) {
    return 0;
  }

  const trValues: number[] = [];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const previous = candles[i - 1];

    const tr = Math.max(
      current.high - current.low,
      Math.abs(current.high - previous.close),
      Math.abs(current.low - previous.close)
    );

    trValues.push(tr);
  }

  // 使用EMA方法计算ATR
  return calculateEMA(trValues.slice(-period), period);
}

/**
 * 检测交易信号
 * @param candles - K线数据
 * @returns 信号对象或null
 */
export function detectSignal(candles: Candle[]): { direction: 'long' | 'short'; entry: number; trend: 'bullish' | 'bearish' } | null {
  if (candles.length < 233) {
    return null;
  }

  const closes = candles.map(c => c.close);
  const ema21 = calculateEMA(closes.slice(-21), 21);
  const ema89 = calculateEMA(closes.slice(-89), 89);
  const ema233 = calculateEMA(closes.slice(-233), 233);

  // 判断趋势
  const trend = ema89 > ema233 ? 'bullish' : 'bearish';

  // 获取前一根K线的EMA
  const prevCloses = candles.slice(0, -1).map(c => c.close);
  const prevEma21 = calculateEMA(prevCloses.slice(-21), 21);
  const prevEma89 = calculateEMA(prevCloses.slice(-89), 89);

  // 检测金叉/死叉
  if (trend === 'bullish' && prevEma21 <= prevEma89 && ema21 > ema89) {
    // 金叉，做多信号
    return {
      direction: 'long',
      entry: candles[candles.length - 1].close,
      trend: 'bullish',
    };
  }

  if (trend === 'bearish' && prevEma21 >= prevEma89 && ema21 < ema89) {
    // 死叉，做空信号
    return {
      direction: 'short',
      entry: candles[candles.length - 1].close,
      trend: 'bearish',
    };
  }

  return null;
}

/**
 * 计算止盈价格
 * @param entryPrice - 入场价
 * @param atr - ATR值
 * @param direction - 方向
 * @returns 止盈价格
 */
export function calculateTakeProfit(entryPrice: number, atr: number, direction: 'long' | 'short'): number {
  const target = atr * 5;

  if (direction === 'long') {
    return entryPrice + target;
  } else {
    return entryPrice - target;
  }
}

/**
 * 计算止损价格
 * @param entryPrice - 入场价
 * @param atr - ATR值
 * @param direction - 方向
 * @returns 止损价格
 */
export function calculateStopLoss(entryPrice: number, atr: number, direction: 'long' | 'short'): number {
  const target = atr * 2;

  if (direction === 'long') {
    return entryPrice - target;
  } else {
    return entryPrice + target;
  }
}
