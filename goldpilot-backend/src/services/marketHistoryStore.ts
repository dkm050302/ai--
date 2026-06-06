import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils';

export type MarketHistoryPeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface StoredMarketCandle {
  symbol: string;
  period: MarketHistoryPeriod;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  fetchedAt: string;
}

export interface MarketHistoryQuality {
  duplicateCount: number;
  invalidCount: number;
  gapCount: number;
  largestGapSeconds: number;
  warnings: string[];
}

export interface MarketHistorySummary {
  source: 'cache' | 'stale_cache';
  provider: string;
  symbol: string;
  period: MarketHistoryPeriod;
  requestedLimit: number;
  candleCount: number;
  startTime?: string;
  endTime?: string;
  updatedAt?: string;
  repositoryDir: string;
  message: string;
  quality: MarketHistoryQuality;
}

interface ManifestRecord {
  symbol: string;
  period: MarketHistoryPeriod;
  provider: string;
  candleCount: number;
  startTime?: string;
  endTime?: string;
  updatedAt?: string;
  files: string[];
  quality: MarketHistoryQuality;
}

interface MarketHistoryManifest {
  version: 1;
  updatedAt: string;
  records: Record<string, ManifestRecord>;
}

const ROOT_DIR = path.resolve(process.cwd(), 'data/market-history');
const MANIFEST_FILE = path.join(ROOT_DIR, 'manifest.json');

const PERIOD_SECONDS: Record<MarketHistoryPeriod, number> = {
  '1m': 60,
  '5m': 5 * 60,
  '15m': 15 * 60,
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
};

function normalizeSymbol(symbol: string): string {
  return String(symbol || 'xauusd').toLowerCase().replace(/[^a-z0-9]/g, '') || 'xauusd';
}

function normalizePeriod(period: string): MarketHistoryPeriod {
  if (['1m', '5m', '15m', '1h', '4h', '1d'].includes(period)) {
    return period as MarketHistoryPeriod;
  }
  return '1d';
}

function normalizeTime(value: unknown): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  const timestamp = new Date(String(value || '')).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function getBucketName(period: MarketHistoryPeriod, time: number): string {
  const date = new Date(time * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');

  if (period === '1m' || period === '5m' || period === '15m' || period === '1h') {
    return `${year}-${month}.jsonl`;
  }

  return `${year}.jsonl`;
}

function isValidCandle(candle: StoredMarketCandle): boolean {
  const values = [candle.time, candle.open, candle.high, candle.low, candle.close];
  if (!values.every(Number.isFinite)) return false;
  if (candle.time <= 0) return false;
  if (candle.open <= 0 || candle.high <= 0 || candle.low <= 0 || candle.close <= 0) return false;
  const maxPrice = Math.max(candle.open, candle.close, candle.low);
  const minPrice = Math.min(candle.open, candle.close, candle.high);
  return candle.high >= maxPrice && candle.low <= minPrice;
}

function buildEmptyQuality(): MarketHistoryQuality {
  return {
    duplicateCount: 0,
    invalidCount: 0,
    gapCount: 0,
    largestGapSeconds: 0,
    warnings: [],
  };
}

function mergeQuality(base: MarketHistoryQuality, next: Partial<MarketHistoryQuality>): MarketHistoryQuality {
  return {
    duplicateCount: base.duplicateCount + (next.duplicateCount || 0),
    invalidCount: base.invalidCount + (next.invalidCount || 0),
    gapCount: base.gapCount + (next.gapCount || 0),
    largestGapSeconds: Math.max(base.largestGapSeconds, next.largestGapSeconds || 0),
    warnings: [...base.warnings, ...(next.warnings || [])].slice(0, 8),
  };
}

class MarketHistoryStore {
  async readHistory(
    symbolInput: string = 'xauusd',
    periodInput: string = '1d',
    limitInput: number = 1825
  ): Promise<{ candles: StoredMarketCandle[]; summary: MarketHistorySummary | null }> {
    const symbol = normalizeSymbol(symbolInput);
    const period = normalizePeriod(periodInput);
    const limit = Math.max(1, Math.floor(Number(limitInput) || 1825));
    const candles = await this.readAllCandles(symbol, period);
    const selected = candles.slice(-limit);
    const manifest = await this.readManifest();
    const record = manifest.records[this.getRecordKey(symbol, period)];

    return {
      candles: selected,
      summary: record ? this.toSummary(record, limit, candles.length) : null,
    };
  }

  async upsertHistory(
    symbolInput: string,
    periodInput: string,
    rawCandles: any[],
    provider: string
  ): Promise<MarketHistorySummary> {
    const symbol = normalizeSymbol(symbolInput);
    const period = normalizePeriod(periodInput);
    const fetchedAt = new Date().toISOString();
    const existing = await this.readAllCandles(symbol, period);
    const quality = buildEmptyQuality();
    const merged = new Map<number, StoredMarketCandle>();
    const incomingTimes = new Set<number>();

    for (const candle of existing) {
      merged.set(candle.time, candle);
    }

    for (const raw of rawCandles || []) {
      const normalized = this.normalizeCandle(raw, symbol, period, provider, fetchedAt);
      if (!normalized || !isValidCandle(normalized)) {
        quality.invalidCount += 1;
        continue;
      }

      if (incomingTimes.has(normalized.time)) {
        quality.duplicateCount += 1;
      }

      incomingTimes.add(normalized.time);
      merged.set(normalized.time, normalized);
    }

    const candles = [...merged.values()].sort((a, b) => a.time - b.time);
    const gapQuality = this.inspectGaps(candles, period);
    const finalQuality = mergeQuality(quality, gapQuality);
    const files = await this.writeCandles(symbol, period, candles);
    const manifest = await this.readManifest();
    const record: ManifestRecord = {
      symbol,
      period,
      provider,
      candleCount: candles.length,
      startTime: candles[0] ? new Date(candles[0].time * 1000).toISOString() : undefined,
      endTime: candles[candles.length - 1] ? new Date(candles[candles.length - 1].time * 1000).toISOString() : undefined,
      updatedAt: fetchedAt,
      files,
      quality: finalQuality,
    };

    manifest.updatedAt = fetchedAt;
    manifest.records[this.getRecordKey(symbol, period)] = record;
    await this.writeManifest(manifest);

    return this.toSummary(record, candles.length, candles.length);
  }

  async getSummaries(): Promise<MarketHistorySummary[]> {
    const manifest = await this.readManifest();
    return Object.values(manifest.records)
      .map((record) => this.toSummary(record, record.candleCount, record.candleCount))
      .sort((a, b) => `${a.symbol}_${a.period}`.localeCompare(`${b.symbol}_${b.period}`));
  }

  private normalizeCandle(
    raw: any,
    symbol: string,
    period: MarketHistoryPeriod,
    provider: string,
    fetchedAt: string
  ): StoredMarketCandle | null {
    const time = normalizeTime(raw?.time ?? raw?.timestamp ?? raw?.datetime);
    const open = Number(raw?.open);
    const high = Number(raw?.high);
    const low = Number(raw?.low);
    const close = Number(raw?.close);
    const volume = Number(raw?.volume || 0);

    if (!time || ![open, high, low, close].every(Number.isFinite)) {
      return null;
    }

    return {
      symbol,
      period,
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
      provider,
      fetchedAt,
    };
  }

  private inspectGaps(candles: StoredMarketCandle[], period: MarketHistoryPeriod): Partial<MarketHistoryQuality> {
    const expected = PERIOD_SECONDS[period];
    const threshold = period === '1d' ? expected * 3.5 : expected * 8;
    let gapCount = 0;
    let largestGapSeconds = 0;

    for (let index = 1; index < candles.length; index += 1) {
      const gap = candles[index].time - candles[index - 1].time;
      if (gap > threshold) {
        gapCount += 1;
        largestGapSeconds = Math.max(largestGapSeconds, gap);
      }
    }

    const warnings: string[] = [];
    if (gapCount > 0) {
      warnings.push(`检测到 ${gapCount} 个大时间缺口，最大缺口 ${Math.round(largestGapSeconds / 3600)} 小时`);
    }

    return { gapCount, largestGapSeconds, warnings };
  }

  private async readAllCandles(symbol: string, period: MarketHistoryPeriod): Promise<StoredMarketCandle[]> {
    const dir = this.getPeriodDir(symbol, period);

    try {
      const files = (await fs.readdir(dir))
        .filter((file) => file.endsWith('.jsonl'))
        .sort();
      const rows: StoredMarketCandle[] = [];

      for (const file of files) {
        const raw = await fs.readFile(path.join(dir, file), 'utf8');
        for (const line of raw.split('\n')) {
          const text = line.trim();
          if (!text) continue;
          try {
            const parsed = JSON.parse(text) as StoredMarketCandle;
            if (isValidCandle(parsed)) {
              rows.push(parsed);
            }
          } catch {
            logger.warn(`[MarketHistoryStore] 忽略无法解析的历史行: ${file}`);
          }
        }
      }

      return rows.sort((a, b) => a.time - b.time);
    } catch {
      return [];
    }
  }

  private async writeCandles(symbol: string, period: MarketHistoryPeriod, candles: StoredMarketCandle[]): Promise<string[]> {
    const dir = this.getPeriodDir(symbol, period);
    await fs.mkdir(dir, { recursive: true });

    const previousFiles = await fs.readdir(dir).catch(() => []);
    await Promise.all(
      previousFiles
        .filter((file) => file.endsWith('.jsonl'))
        .map((file) => fs.unlink(path.join(dir, file)).catch(() => undefined))
    );

    const buckets = new Map<string, StoredMarketCandle[]>();
    for (const candle of candles) {
      const bucket = getBucketName(period, candle.time);
      const rows = buckets.get(bucket) || [];
      rows.push(candle);
      buckets.set(bucket, rows);
    }

    const files = [...buckets.keys()].sort();
    for (const file of files) {
      const rows = buckets.get(file) || [];
      const content = rows.map((row) => JSON.stringify(row)).join('\n');
      await fs.writeFile(path.join(dir, file), `${content}\n`, 'utf8');
    }

    return files.map((file) => path.relative(ROOT_DIR, path.join(dir, file)));
  }

  private async readManifest(): Promise<MarketHistoryManifest> {
    try {
      const raw = await fs.readFile(MANIFEST_FILE, 'utf8');
      const parsed = JSON.parse(raw) as MarketHistoryManifest;
      return {
        version: 1,
        updatedAt: parsed.updatedAt || new Date(0).toISOString(),
        records: parsed.records || {},
      };
    } catch {
      return {
        version: 1,
        updatedAt: new Date(0).toISOString(),
        records: {},
      };
    }
  }

  private async writeManifest(manifest: MarketHistoryManifest): Promise<void> {
    await fs.mkdir(ROOT_DIR, { recursive: true });
    await fs.writeFile(MANIFEST_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  private toSummary(record: ManifestRecord, requestedLimit: number, availableCount: number): MarketHistorySummary {
    return {
      source: this.isFresh(record.updatedAt) ? 'cache' : 'stale_cache',
      provider: record.provider,
      symbol: record.symbol,
      period: record.period,
      requestedLimit,
      candleCount: Math.min(availableCount, requestedLimit),
      startTime: record.startTime,
      endTime: record.endTime,
      updatedAt: record.updatedAt,
      repositoryDir: ROOT_DIR,
      message: this.isFresh(record.updatedAt) ? '已有可用文件型黄金历史仓库' : '已有文件型黄金历史仓库，等待增量刷新',
      quality: record.quality || buildEmptyQuality(),
    };
  }

  private isFresh(updatedAt?: string): boolean {
    const timestamp = new Date(updatedAt || '').getTime();
    return Number.isFinite(timestamp) && Date.now() - timestamp <= 6 * 60 * 60 * 1000;
  }

  private getRecordKey(symbol: string, period: MarketHistoryPeriod): string {
    return `${symbol}:${period}`;
  }

  private getPeriodDir(symbol: string, period: MarketHistoryPeriod): string {
    return path.join(ROOT_DIR, symbol, period);
  }
}

export const marketHistoryStore = new MarketHistoryStore();
