import {
  marketHistoryStore,
  type MarketHistoryPeriod,
  type StoredMarketCandle,
} from './marketHistoryStore';

export interface MarketHistorySessionQuality {
  rawCount: number;
  tradableCount: number;
  removedNonTradingCount: number;
  removedWeekendCount: number;
  nonTradingRatio: number;
  gapCount: number;
  largestGapSeconds: number;
  warnings: string[];
}

export interface MarketHistoryHealthReport extends MarketHistorySessionQuality {
  symbol: string;
  period: MarketHistoryPeriod;
  startTime?: string;
  endTime?: string;
  tradableStartTime?: string;
  tradableEndTime?: string;
  nonTradingSamples: Array<{
    time: string;
    reason: string;
  }>;
}

export interface MarketHistoryCleanResult<T extends { time: number }> {
  candles: T[];
  quality: MarketHistorySessionQuality;
}

const PERIOD_SECONDS: Record<MarketHistoryPeriod, number> = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
};

const HEALTH_CACHE_MS = 60 * 1000;
const SUNDAY_REOPEN_UTC_HOUR = 21;

function normalizePeriod(period: string): MarketHistoryPeriod {
  if (['1m', '5m', '15m', '1h', '4h', '1d'].includes(period)) {
    return period as MarketHistoryPeriod;
  }
  return '1d';
}

function isIntraday(period: MarketHistoryPeriod): boolean {
  return period !== '1d';
}

function getUtcDay(time: number): number {
  return new Date(time * 1000).getUTCDay();
}

function getUtcHour(time: number): number {
  return new Date(time * 1000).getUTCHours();
}

function getNonTradingReason(time: number): string | null {
  const day = getUtcDay(time);
  if (day === 6) return '周六休市';
  if (day === 0 && getUtcHour(time) < SUNDAY_REOPEN_UTC_HOUR) return '周日开盘前';
  return null;
}

function intervalTouchesWeekend(startTime: number, endTime: number): boolean {
  const daySeconds = 24 * 60 * 60;
  const startDay = Math.floor(startTime / daySeconds) * daySeconds;

  for (let time = startDay; time <= endTime; time += daySeconds) {
    const day = getUtcDay(time);
    if (day === 0 || day === 6) {
      return true;
    }
  }

  return false;
}

function inspectUnexpectedGaps<T extends { time: number }>(
  candles: T[],
  period: MarketHistoryPeriod
): Pick<MarketHistorySessionQuality, 'gapCount' | 'largestGapSeconds'> {
  const expected = PERIOD_SECONDS[period];
  const threshold = period === '1d' ? expected * 3.5 : expected * 8;
  let gapCount = 0;
  let largestGapSeconds = 0;

  for (let index = 1; index < candles.length; index += 1) {
    const previous = candles[index - 1];
    const current = candles[index];
    const gap = current.time - previous.time;
    if (gap <= threshold) {
      continue;
    }

    const weekendLikeClosure = isIntraday(period)
      && gap <= 4 * 24 * 60 * 60
      && intervalTouchesWeekend(previous.time, current.time);

    if (weekendLikeClosure) {
      continue;
    }

    gapCount += 1;
    largestGapSeconds = Math.max(largestGapSeconds, gap);
  }

  return { gapCount, largestGapSeconds };
}

function buildWarnings(quality: Omit<MarketHistorySessionQuality, 'warnings'>): string[] {
  const warnings: string[] = [];

  if (quality.removedNonTradingCount > 0) {
    warnings.push(`已剔除 ${quality.removedNonTradingCount.toLocaleString()} 根非交易时段K线`);
  }

  if (quality.nonTradingRatio >= 0.05) {
    warnings.push(`非交易时段占比 ${(quality.nonTradingRatio * 100).toFixed(1)}%，导入源可能包含休市假K线`);
  }

  if (quality.gapCount > 0) {
    warnings.push(`清洗后仍有 ${quality.gapCount} 个异常缺口，最大 ${Math.round(quality.largestGapSeconds / 3600)} 小时`);
  }

  if (quality.rawCount > 0 && quality.tradableCount === 0) {
    warnings.push('原始数据存在，但按交易时段过滤后没有可用K线');
  }

  return warnings.slice(0, 8);
}

class MarketHistoryHealthService {
  private reportCache = new Map<string, { expiresAt: number; report: MarketHistoryHealthReport }>();

  isTradingSession(time: number, periodInput: string): boolean {
    const period = normalizePeriod(periodInput);
    if (!isIntraday(period)) {
      return true;
    }

    return getNonTradingReason(time) === null;
  }

  cleanCandles<T extends { time: number }>(
    candlesInput: T[],
    periodInput: string
  ): MarketHistoryCleanResult<T> {
    const period = normalizePeriod(periodInput);
    const candles = [...(candlesInput || [])]
      .filter((candle) => Number.isFinite(candle.time))
      .sort((a, b) => a.time - b.time);

    if (!isIntraday(period)) {
      const gaps = inspectUnexpectedGaps(candles, period);
      const qualityBase = {
        rawCount: candles.length,
        tradableCount: candles.length,
        removedNonTradingCount: 0,
        removedWeekendCount: 0,
        nonTradingRatio: 0,
        gapCount: gaps.gapCount,
        largestGapSeconds: gaps.largestGapSeconds,
      };

      return {
        candles,
        quality: {
          ...qualityBase,
          warnings: buildWarnings(qualityBase),
        },
      };
    }

    const tradable: T[] = [];
    let removedWeekendCount = 0;

    for (const candle of candles) {
      const reason = getNonTradingReason(candle.time);
      if (reason) {
        removedWeekendCount += 1;
        continue;
      }

      tradable.push(candle);
    }

    const gaps = inspectUnexpectedGaps(tradable, period);
    const removedNonTradingCount = candles.length - tradable.length;
    const qualityBase = {
      rawCount: candles.length,
      tradableCount: tradable.length,
      removedNonTradingCount,
      removedWeekendCount,
      nonTradingRatio: candles.length ? removedNonTradingCount / candles.length : 0,
      gapCount: gaps.gapCount,
      largestGapSeconds: gaps.largestGapSeconds,
    };

    return {
      candles: tradable,
      quality: {
        ...qualityBase,
        warnings: buildWarnings(qualityBase),
      },
    };
  }

  inspectCandles<T extends { time: number }>(
    symbol: string,
    periodInput: string,
    candlesInput: T[]
  ): MarketHistoryHealthReport {
    const period = normalizePeriod(periodInput);
    const candles = [...(candlesInput || [])]
      .filter((candle) => Number.isFinite(candle.time))
      .sort((a, b) => a.time - b.time);
    const cleaned = this.cleanCandles(candles, period);
    const removedSamples = isIntraday(period)
      ? candles
        .filter((candle) => getNonTradingReason(candle.time))
        .slice(0, 5)
        .map((candle) => ({
          time: new Date(candle.time * 1000).toISOString(),
          reason: getNonTradingReason(candle.time) || '非交易时段',
        }))
      : [];
    const first = candles[0];
    const last = candles[candles.length - 1];
    const tradableFirst = cleaned.candles[0];
    const tradableLast = cleaned.candles[cleaned.candles.length - 1];

    return {
      symbol,
      period,
      ...cleaned.quality,
      startTime: first ? new Date(first.time * 1000).toISOString() : undefined,
      endTime: last ? new Date(last.time * 1000).toISOString() : undefined,
      tradableStartTime: tradableFirst ? new Date(tradableFirst.time * 1000).toISOString() : undefined,
      tradableEndTime: tradableLast ? new Date(tradableLast.time * 1000).toISOString() : undefined,
      nonTradingSamples: removedSamples,
    };
  }

  async inspectHistory(
    symbol: string,
    periodInput: string,
    limitInput?: number
  ): Promise<MarketHistoryHealthReport> {
    const period = normalizePeriod(periodInput);
    const limit = Math.max(1, Math.floor(Number(limitInput) || 1_000_000));
    const cacheKey = `${symbol}:${period}:${limit}`;
    const cached = this.reportCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.report;
    }

    const history = await marketHistoryStore.readHistory(symbol, period, limit);
    const report = this.inspectCandles<StoredMarketCandle>(symbol, period, history.candles);
    this.reportCache.set(cacheKey, {
      expiresAt: Date.now() + HEALTH_CACHE_MS,
      report,
    });

    return report;
  }
}

export const marketHistoryHealthService = new MarketHistoryHealthService();
