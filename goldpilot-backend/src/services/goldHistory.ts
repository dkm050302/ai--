import { promises as fs } from 'fs';
import path from 'path';
import { twelveDataService } from './twelveData';
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
  provider: 'Twelve Data';
  period: string;
  requestedLimit: number;
  candleCount: number;
  startTime?: string;
  endTime?: string;
  updatedAt?: string;
  cacheFile: string;
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
  return ['1h', '4h', '1d'].includes(value) ? value : '1d';
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
  updatedAt?: string
): GoldHistoryMeta {
  const first = candles[0];
  const last = candles[candles.length - 1];

  return {
    source,
    provider: 'Twelve Data',
    period,
    requestedLimit,
    candleCount: candles.length,
    startTime: first ? new Date(first.time * 1000).toISOString() : undefined,
    endTime: last ? new Date(last.time * 1000).toISOString() : undefined,
    updatedAt,
    cacheFile: CACHE_FILE,
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
    const key = this.getKey(period, requestedLimit);
    const cached = await this.readRecord(key);

    if (cached && isFresh(cached.updatedAt) && cached.candles.length >= Math.min(120, requestedLimit)) {
      const candles = cached.candles.slice(-requestedLimit);
      return {
        candles,
        meta: buildMeta('cache', period, requestedLimit, candles, '使用6小时内的长期黄金历史JSON缓存', cached.updatedAt),
      };
    }

    try {
      const fetched = await twelveDataService.getCandles(period, requestedLimit);
      const candles = (fetched || [])
        .map(normalizeCandle)
        .filter((item): item is GoldHistoryCandle => Boolean(item))
        .sort((a, b) => a.time - b.time)
        .slice(-requestedLimit);

      if (candles.length >= Math.min(120, requestedLimit)) {
        const updatedAt = new Date().toISOString();
        await this.writeRecord(key, {
          candles,
          updatedAt,
          period,
          requestedLimit,
        });

        return {
          candles,
          meta: buildMeta('live', period, requestedLimit, candles, '已从 Twelve Data 获取长期黄金历史数据并写入JSON缓存', updatedAt),
        };
      }
    } catch (error) {
      logger.warn('[GoldHistory] 获取 Twelve Data 长期黄金历史失败:', error);
    }

    if (cached?.candles.length) {
      const candles = cached.candles.slice(-requestedLimit);
      return {
        candles,
        meta: buildMeta('stale_cache', period, requestedLimit, candles, '实时历史数据不可用，使用过期JSON缓存', cached.updatedAt),
      };
    }

    return {
      candles: [],
      meta: buildMeta('unavailable', period, requestedLimit, [], '没有可用的真实长期黄金历史数据，请先配置 Twelve Data 或等待缓存生成'),
    };
  }

  async getCacheSummaries(): Promise<GoldHistoryMeta[]> {
    const cache = await this.readCache();
    return Object.values(cache.records)
      .map((record) => buildMeta(
        isFresh(record.updatedAt) ? 'cache' : 'stale_cache',
        record.period,
        record.requestedLimit,
        record.candles,
        isFresh(record.updatedAt) ? '已有可用长期历史缓存' : '已有过期长期历史缓存',
        record.updatedAt
      ))
      .sort((a, b) => `${a.period}_${b.candleCount}`.localeCompare(`${b.period}_${a.candleCount}`));
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

  private async writeCache(cache: GoldHistoryCacheFile): Promise<void> {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  }

  private async readRecord(key: string): Promise<GoldHistoryCacheFile['records'][string] | null> {
    const cache = await this.readCache();
    return cache.records[key] || null;
  }

  private async writeRecord(key: string, record: GoldHistoryCacheFile['records'][string]): Promise<void> {
    const cache = await this.readCache();
    cache.records[key] = record;
    await this.writeCache(cache);
  }
}

export const goldHistoryService = new GoldHistoryService();
