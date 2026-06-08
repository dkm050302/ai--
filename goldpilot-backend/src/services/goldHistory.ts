import { promises as fs } from 'fs';
import path from 'path';
import { twelveDataService } from './twelveData';
import { marketHistoryStore, type MarketHistoryQuality } from './marketHistoryStore';
import { marketHistoryHealthService, type MarketHistorySessionQuality } from './marketHistoryHealth';
import { logger } from '../utils';

export type GoldHistorySource = 'live' | 'cache' | 'stale_cache' | 'unavailable';

export interface GoldHistoryCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface GoldHistoryMeta {
  source: GoldHistorySource;
  provider: string;
  symbol: string;
  period: string;
  requestedLimit: number;
  candleCount: number;
  startTime?: string;
  endTime?: string;
  updatedAt?: string;
  cacheFile: string;
  repositoryDir?: string;
  quality?: MarketHistoryQuality;
  session?: MarketHistorySessionQuality;
  message: string;
}

export interface GoldHistoryResult {
  candles: GoldHistoryCandle[];
  meta: GoldHistoryMeta;
}

export interface GoldHistoryRange {
  startTime?: string;
  endTime?: string;
}

interface GoldHistoryCacheFile {
  version: 1;
  records: Record<string, {
    candles: GoldHistoryCandle[];
    updatedAt: string;
    period: string;
    requestedLimit: number;
  }>;
}

const CACHE_FILE = path.resolve(process.cwd(), 'data/gold-history-cache.json');
const HISTORY_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const LONG_HISTORY_MAX_LIMIT = 600000;

function clampLimit(limit: unknown, fallback: number): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(Math.max(parsed, 60), LONG_HISTORY_MAX_LIMIT));
}

function normalizePeriod(period: unknown): string {
  const value = String(period || '1d');
  return ['1m', '5m', '15m', '1h', '4h', '1d'].includes(value) ? value : '1d';
}

function normalizeTime(value: unknown): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
  }

  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }

  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function parseRangeTime(value: unknown): number | undefined {
  if (!value) return undefined;
  const timestamp = normalizeTime(value);
  return timestamp > 0 ? timestamp : undefined;
}

function normalizeCandle(item: any): GoldHistoryCandle | null {
  const time = normalizeTime(item?.time);
  const open = Number(item?.open);
  const high = Number(item?.high);
  const low = Number(item?.low);
  const close = Number(item?.close);
  const volume = Number(item?.volume || 0);

  if (!time || ![open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return { time, open, high, low, close, volume: Number.isFinite(volume) ? volume : 0 };
}

function buildMeta(
  source: GoldHistorySource,
  period: string,
  requestedLimit: number,
  candles: GoldHistoryCandle[],
  message: string,
  updatedAt?: string,
  extra: {
    provider?: string;
    symbol?: string;
    repositoryDir?: string;
    quality?: MarketHistoryQuality;
    session?: MarketHistorySessionQuality;
    startTime?: string;
    endTime?: string;
    candleCount?: number;
  } = {}
): GoldHistoryMeta {
  const first = candles[0];
  const last = candles[candles.length - 1];

  return {
    source,
    provider: extra.provider || 'Twelve Data',
    symbol: extra.symbol || 'xauusd',
    period,
    requestedLimit,
    candleCount: extra.candleCount ?? candles.length,
    startTime: extra.startTime || (first ? new Date(first.time * 1000).toISOString() : undefined),
    endTime: extra.endTime || (last ? new Date(last.time * 1000).toISOString() : undefined),
    updatedAt,
    cacheFile: CACHE_FILE,
    repositoryDir: extra.repositoryDir,
    quality: extra.quality,
    session: extra.session,
    message,
  };
}

function isFresh(updatedAt: string): boolean {
  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= HISTORY_CACHE_MAX_AGE_MS;
}

function getRawReadLimit(period: string, requestedLimit: number): number {
  if (period === '1d') {
    return requestedLimit;
  }

  return Math.min(requestedLimit + Math.max(1000, Math.ceil(requestedLimit * 0.5)), LONG_HISTORY_MAX_LIMIT);
}

function toGoldCandles(candles: Array<{
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}>): GoldHistoryCandle[] {
  return candles.map(({ time, open, high, low, close, volume }) => ({
    time,
    open,
    high,
    low,
    close,
    volume,
  }));
}

function cleanGoldCandles(
  candles: Array<{
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>,
  period: string,
  requestedLimit: number,
  range: GoldHistoryRange = {}
): { candles: GoldHistoryCandle[]; session: MarketHistorySessionQuality } {
  const startTime = parseRangeTime(range.startTime);
  const endTime = parseRangeTime(range.endTime);
  const cleaned = marketHistoryHealthService.cleanCandles(candles, period);
  const ranged = cleaned.candles.filter((candle) => {
    if (startTime && candle.time < startTime) return false;
    if (endTime && candle.time > endTime) return false;
    return true;
  });

  return {
    candles: toGoldCandles(ranged).slice(-requestedLimit),
    session: cleaned.quality,
  };
}

class GoldHistoryService {
  async getLongHistory(
    periodInput: unknown = '1d',
    limitInput: unknown = 1825,
    range: GoldHistoryRange = {}
  ): Promise<GoldHistoryResult> {
    const period = normalizePeriod(periodInput);
    const requestedLimit = clampLimit(limitInput, period === '1d' ? 1825 : 3000);
    const minimumUsable = Math.min(120, requestedLimit);
    const key = this.getKey(period, requestedLimit);
    const hasRange = Boolean(range.startTime || range.endTime);
    const rawReadLimit = hasRange ? LONG_HISTORY_MAX_LIMIT : getRawReadLimit(period, requestedLimit);
    await this.migrateLegacyCaches();

    const stored = await marketHistoryStore.readHistory('xauusd', period, rawReadLimit);
    if (stored.summary && stored.summary.source === 'cache' && stored.candles.length >= minimumUsable) {
      const cleaned = cleanGoldCandles(stored.candles, period, requestedLimit, range);

      if (cleaned.candles.length >= minimumUsable) {
        return {
          candles: cleaned.candles,
          meta: buildMeta('cache', period, requestedLimit, cleaned.candles, '使用6小时内的文件型黄金历史仓库（已按交易时段清洗）', stored.summary.updatedAt, {
            provider: stored.summary.provider,
            symbol: stored.summary.symbol,
            repositoryDir: stored.summary.repositoryDir,
            quality: stored.summary.quality,
            session: cleaned.session,
          }),
        };
      }
    }

    try {
      const fetched = await twelveDataService.getCandles(period, Math.min(requestedLimit, 5000));
      const candles = (fetched || [])
        .map(normalizeCandle)
        .filter((item): item is GoldHistoryCandle => Boolean(item))
        .sort((a, b) => a.time - b.time)
        .slice(-Math.min(requestedLimit, 5000));

      if (candles.length >= minimumUsable) {
        const updatedAt = new Date().toISOString();
        const summary = await marketHistoryStore.upsertHistory('xauusd', period, candles, 'Twelve Data');
        const merged = await marketHistoryStore.readHistory('xauusd', period, rawReadLimit);
        const cleanedMerged = cleanGoldCandles(merged.candles, period, requestedLimit, range);
        const cleanedFetched = cleanGoldCandles(candles, period, requestedLimit, range);
        const outputCandles = cleanedMerged.candles.length >= minimumUsable ? cleanedMerged.candles : cleanedFetched.candles;
        const outputSession = cleanedMerged.candles.length >= minimumUsable ? cleanedMerged.session : cleanedFetched.session;

        if (outputCandles.length >= minimumUsable) {
          return {
            candles: outputCandles,
            meta: buildMeta('live', period, requestedLimit, outputCandles, '已从 Twelve Data 获取长期黄金历史数据并写入文件型仓库（已按交易时段清洗）', updatedAt, {
              provider: summary.provider,
              symbol: summary.symbol,
              repositoryDir: summary.repositoryDir,
              quality: summary.quality,
              session: outputSession,
            }),
          };
        }
      }
    } catch (error) {
      logger.warn('[GoldHistory] 获取 Twelve Data 长期黄金历史失败:', error);
    }

    const fallback = await marketHistoryStore.readHistory('xauusd', period, rawReadLimit);
    if (fallback.candles.length) {
      const cleaned = cleanGoldCandles(fallback.candles, period, requestedLimit, range);

      if (cleaned.candles.length >= minimumUsable) {
        return {
          candles: cleaned.candles,
          meta: buildMeta('stale_cache', period, requestedLimit, cleaned.candles, '实时历史数据不可用，使用文件型历史仓库（已按交易时段清洗）', fallback.summary?.updatedAt, {
            provider: fallback.summary?.provider,
            symbol: fallback.summary?.symbol,
            repositoryDir: fallback.summary?.repositoryDir,
            quality: fallback.summary?.quality,
            session: cleaned.session,
          }),
        };
      }
    }

    const cached = await this.readRecord(key);
    if (cached?.candles.length) {
      const cleaned = cleanGoldCandles(cached.candles, period, requestedLimit, range);
      if (cleaned.candles.length) {
        return {
          candles: cleaned.candles,
          meta: buildMeta('stale_cache', period, requestedLimit, cleaned.candles, '实时历史数据不可用，使用旧版JSON缓存（已按交易时段清洗）', cached.updatedAt, {
            provider: 'Legacy JSON',
            session: cleaned.session,
          }),
        };
      }
    }

    return {
      candles: [],
      meta: buildMeta('unavailable', period, requestedLimit, [], '没有可用的真实长期黄金历史数据，请先配置 Twelve Data 或等待缓存生成'),
    };
  }

  async getCacheSummaries(): Promise<GoldHistoryMeta[]> {
    await this.migrateLegacyCaches();
    const summaries = await marketHistoryStore.getSummaries();
    const metas = await Promise.all(summaries.map(async (summary) => {
      const session = await marketHistoryHealthService.inspectHistory(
        summary.symbol,
        summary.period,
        summary.requestedLimit
      );

      return buildMeta(
        summary.source,
        summary.period,
        summary.requestedLimit,
        [],
        summary.message,
        summary.updatedAt,
        {
          provider: summary.provider,
          symbol: summary.symbol,
          repositoryDir: summary.repositoryDir,
          quality: summary.quality,
          session,
          startTime: summary.startTime,
          endTime: summary.endTime,
          candleCount: summary.candleCount,
        }
      );
    }));

    return metas.sort((a, b) => `${a.period}_${b.candleCount}`.localeCompare(`${b.period}_${a.candleCount}`));
  }

  private getKey(period: string, requestedLimit: number): string {
    return `${period}_${requestedLimit}`;
  }

  private async readCache(): Promise<GoldHistoryCacheFile> {
    try {
      const raw = await fs.readFile(CACHE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as GoldHistoryCacheFile;
      return {
        version: 1,
        records: parsed.records || {},
      };
    } catch {
      return { version: 1, records: {} };
    }
  }

  private async readRecord(key: string): Promise<GoldHistoryCacheFile['records'][string] | null> {
    const cache = await this.readCache();
    return cache.records[key] || null;
  }

  private async migrateLegacyCaches(): Promise<void> {
    const cache = await this.readCache();
    const entries = Object.entries(cache.records || {});

    for (const [, record] of entries) {
      if (!record?.candles?.length) {
        continue;
      }

      const period = normalizePeriod(record.period);
      const existing = await marketHistoryStore.readHistory('xauusd', period, record.requestedLimit || record.candles.length);
      if (existing.candles.length > 0) {
        continue;
      }

      try {
        await marketHistoryStore.upsertHistory('xauusd', period, record.candles, 'Legacy JSON');
        logger.info(`[GoldHistory] 已迁移旧版历史缓存到文件型仓库: ${period} ${record.candles.length}根`);
      } catch (error) {
        logger.warn('[GoldHistory] 迁移旧版历史缓存失败:', error);
      }
    }
  }

}

export const goldHistoryService = new GoldHistoryService();
