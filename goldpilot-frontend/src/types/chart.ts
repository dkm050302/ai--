import type { Candle, Signal } from './index';

/**
 * 创建默认K线数据
 */
export function createDefaultCandles(): Candle[] {
  const candles: Candle[] = [];
  const seed = 4866;
  let close = seed;
  const now = Date.now();

  for (let i = 86 - 1; i >= 0; i -= 1) {
    const open = close + (Math.random() - 0.52) * 7;
    close = open + (Math.random() - 0.48) * 10;
    const high = Math.max(open, close) + Math.random() * 7;
    const low = Math.min(open, close) - Math.random() * 7;

    candles.push({
      time: new Date(now - i * 60000),
      open,
      high,
      low,
      close,
      volume: 800 + Math.random() * 900,
    });
  }

  return candles;
}

/**
 * 创建默认信号数据
 */
export function createDefaultSignals(): Signal[] {
  return [];
}
