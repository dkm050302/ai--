import { promises as fs } from 'fs';
import path from 'path';
import { twelveDataService } from './twelveData';
import { marketHistoryStore, type MarketHistoryQuality } from './marketHistoryStore';
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
  message: string;
}

export interface GoldHistoryResult {
  candles: GoldHistoryCandle[];
  meta: GoldHistoryMeta;
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

function clampLimit(limit: unknown, fallback: number): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.round(Math.min(Math.max(parsed, 60), 5000));
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
    message,
  };
}

function isFresh(updatedAt: string): boolean {
  const timestamp = new Date(updatedAt).getTime();
  return Number.isFinite(timestamp) && Date.now() - timestamp <= HISTORY_CACHE_MAX_AGE_MS;
}

class GoldHistoryService {
  async getLongHistory(periodInput: unknown = '1d', limitInput: unknown = 1825): Promise<GoldHistoryResult> {
    const period = normalizePeriod(periodInput);
    const requestedLimit = clampLimit(limitInput, period === '1d' ? 1825 : 3000);
    const minimumUsable = Math.min(120, requestedLimit);
    const key = this.getKey(period, requestedLimit);
    await this.migrateLegacyCaches();

    const stored = await marketHistoryStore.readHistory('xauusd', period, requestedLimit);
    if (stored.summary && stored.summary.source === 'cache' && stored.candles.length >= minimumUsable) {
      const candles = stored.candles.map(({ time, open, high, low, close, volume }) => ({
        time,
        open,
        high,
        low,
        close,
        volume,
      }));

      return {
        candles,
        meta: buildMeta('cache', period, requestedLimit, candles, '使用6小时内的文件型黄金历史仓库', stored.summary.updatedAt, {
          provider: stored.summary.provider,
          symbol: stored.summary.symbol,
          repositoryDir: stored.summary.repositoryDir,
          quality: stored.summary.quality,
        }),
      };
    }

    try {
      const fetched = await twelveDataService.getCandles(period, requestedLimit);
      const candles = (fetched || [])
        .map(normalizeCandle)
        .filter((item): item is GoldHistoryCandle => Boolean(item))
        .sort((a, b) => a.time - b.time)
        .slice(-requestedLimit);

      if (candles.length >= minimumUsable) {
        const updatedAt = new Date().toISOString();
        const summary = await marketHistoryStore.upsertHistory('xauusd', period, candles, 'Twelve Data');
        const merged = await marketHistoryStore.readHistory('xauusd', period, requestedLimit);
        const mergedCandles = merged.candles.map(({ time, open, high, low, close, volume }) => ({
          time,
          open,
          high,
          low,
          close,
          volume,
        }));

        return {
          candles: mergedCandles.length >= minimumUsable ? mergedCandles : candles,
          meta: buildMeta('live', period, requestedLimit, mergedCandles.length >= minimumUsable ? mergedCandles : candles, '已从 Twelve Data 获取长期黄金历史数据并写入文件型仓库', updatedAt, {
            provider: summary.provider,
            symbol: summary.symbol,
            repositoryDir: summary.repositoryDir,
            quality: summary.quality,
          }),
        };
      }
    } catch (error) {
      logger.warn('[GoldHistory] 获取 Twelve Data 长期黄金历史失败:', error);
    }

    const fallback = await marketHistoryStore.readHistory('xauusd', period, requestedLimit);
    if (fallback.candles.length) {
      const candles = fallback.candles.map(({ time, open, high, low, close, volume }) => ({
        time,
        open,
        high,
        low,
        close,
        volume,
      }));

      return {
        candles,
        meta: buildMeta('stale_cache', period, requestedLimit, candles, '实时历史数据不可用，使用文件型历史仓库', fallback.summary?.updatedAt, {
          provider: fallback.summary?.provider,
          symbol: fallback.summary?.symbol,
          repositoryDir: fallback.summary?.repositoryDir,
          quality: fallback.summary?.quality,
        }),
      };
    }

    const cached = await this.readRecord(key);
    if (cached?.candles.length) {
      const candles = cached.candles.slice(-requestedLimit);
      return {
        candles,
        meta: buildMeta('stale_cache', period, requestedLimit, candles, '实时历史数据不可用，使用旧版JSON缓存', cached.updatedAt, {
          provider: 'Legacy JSON',
        }),
      };
    }

    return {
      candles: [],
      meta: buildMeta('unavailable', period, requestedLimit, [], '没有可用的真实长期黄金历史数据，请先配置 Twelve Data 或等待缓存生成'),
    };
  }

  async getCacheSummaries(): Promise<GoldHistoryMeta[]> {
    await this.migrateLegacyCaches();
    const summaries = await marketHistoryStore.getSummaries();
    return summaries.map((summary) => buildMeta(
      summary.source,
      summary.period,
      summary.requestedLimit,
      new Array(summary.candleCount).fill(null),
      summary.message,
      summary.updatedAt,
      {
        provider: summary.provider,
        symbol: summary.symbol,
        repositoryDir: summary.repositoryDir,
        quality: summary.quality,
        startTime: summary.startTime,
        endTime: summary.endTime,
        candleCount: summary.candleCount,
      }
    )).sort((a, b) => `${a.period}_${b.candleCount}`.localeCompare(`${b.period}_${a.candleCount}`));
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
