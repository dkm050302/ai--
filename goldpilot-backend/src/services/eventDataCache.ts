import { promises as fs } from 'fs';
import path from 'path';
import { EconomicEvent, MarketFlash, scraperService } from './scraper';
import { logger } from '../utils';

export type EventDataSource = 'live' | 'cache' | 'mock';

export interface EventDataMeta {
  source: EventDataSource;
  updatedAt: string;
  cacheFile: string;
  stale: boolean;
  message: string;
}

export interface EventDataResult<T> {
  data: T[];
  meta: EventDataMeta;
}

interface CacheRecord<T> {
  data: T[];
  updatedAt: string;
}

interface EventCacheFile {
  version: 1;
  calendar: Record<string, CacheRecord<EconomicEvent>>;
  news?: CacheRecord<MarketFlash>;
}

const CACHE_FILE = path.resolve(process.cwd(), 'data/event-cache.json');
const EVENT_CACHE_MAX_AGE_MS = 60 * 60 * 1000;

function isMockData<T extends { source?: string }>(items: T[]): boolean {
  return items.length > 0 && items.every((item) => item.source === '模拟数据');
}

function normalizeDate(date: string = ''): string {
  if (!date) return formatBeijingDate();
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date;
}

function formatBeijingDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function isWeekendDate(date: string): boolean {
  const [year, month, day] = normalizeDate(date).split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function createMeta(
  source: EventDataSource,
  updatedAt: string,
  stale: boolean,
  message: string
): EventDataMeta {
  return {
    source,
    updatedAt,
    cacheFile: CACHE_FILE,
    stale,
    message,
  };
}

function isCacheFresh(record: CacheRecord<unknown>, maxAgeMs: number): boolean {
  const updatedAtMs = new Date(record.updatedAt).getTime();
  return Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs <= maxAgeMs;
}

class EventDataCacheService {
  async getEconomicCalendar(date: string = ''): Promise<EventDataResult<EconomicEvent>> {
    const dateKey = normalizeDate(date);

    if (isWeekendDate(dateKey)) {
      return {
        data: [],
        meta: createMeta('live', new Date().toISOString(), false, '周六/周日黄金休市，跳过外部经济日历读取'),
      };
    }

    const fetched = await scraperService.getEconomicCalendar(date);

    if (fetched.length > 0 && !isMockData(fetched)) {
      const updatedAt = new Date().toISOString();
      await this.writeCalendar(dateKey, fetched, updatedAt);
      return {
        data: fetched,
        meta: createMeta('live', updatedAt, false, '实时抓取成功，已写入本地JSON缓存'),
      };
    }

    const cached = await this.readCalendar(dateKey);
    if (cached && isCacheFresh(cached, EVENT_CACHE_MAX_AGE_MS)) {
      return {
        data: cached.data,
        meta: createMeta('cache', cached.updatedAt, true, '实时抓取失败，使用最近一次本地JSON缓存'),
      };
    }

    return {
      data: fetched,
      meta: createMeta('mock', new Date().toISOString(), true, '实时抓取失败且没有缓存，使用模拟数据'),
    };
  }

  async getMarketNews(): Promise<EventDataResult<MarketFlash>> {
    const fetched = await scraperService.getMarketNews();

    if (fetched.length > 0 && !isMockData(fetched)) {
      const updatedAt = new Date().toISOString();
      await this.writeNews(fetched, updatedAt);
      return {
        data: fetched,
        meta: createMeta('live', updatedAt, false, '实时抓取成功，已写入本地JSON缓存'),
      };
    }

    const cached = await this.readNews();
    if (cached && isCacheFresh(cached, EVENT_CACHE_MAX_AGE_MS)) {
      return {
        data: cached.data,
        meta: createMeta('cache', cached.updatedAt, true, '实时抓取失败，使用最近一次本地JSON缓存'),
      };
    }

    return {
      data: fetched,
      meta: createMeta('mock', new Date().toISOString(), true, '实时抓取失败且没有缓存，使用模拟数据'),
    };
  }

  async refreshAll(date: string = ''): Promise<void> {
    await Promise.all([
      this.getEconomicCalendar(date),
      this.getMarketNews(),
    ]);
  }

  private async readCache(): Promise<EventCacheFile> {
    try {
      const raw = await fs.readFile(CACHE_FILE, 'utf8');
      return JSON.parse(raw) as EventCacheFile;
    } catch {
      return {
        version: 1,
        calendar: {},
      };
    }
  }

  private async writeCache(cache: EventCacheFile): Promise<void> {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    await fs.writeFile(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`, 'utf8');
  }

  private async readCalendar(dateKey: string): Promise<CacheRecord<EconomicEvent> | null> {
    const cache = await this.readCache();
    return cache.calendar[dateKey] || null;
  }

  private async writeCalendar(dateKey: string, data: EconomicEvent[], updatedAt: string): Promise<void> {
    try {
      const cache = await this.readCache();
      cache.calendar[dateKey] = { data, updatedAt };
      await this.writeCache(cache);
    } catch (error) {
      logger.warn('[EventDataCache] 写入经济日历缓存失败:', error);
    }
  }

  private async readNews(): Promise<CacheRecord<MarketFlash> | null> {
    const cache = await this.readCache();
    return cache.news || null;
  }

  private async writeNews(data: MarketFlash[], updatedAt: string): Promise<void> {
    try {
      const cache = await this.readCache();
      cache.news = { data, updatedAt };
      await this.writeCache(cache);
    } catch (error) {
      logger.warn('[EventDataCache] 写入市场快讯缓存失败:', error);
    }
  }
}

export const eventDataCacheService = new EventDataCacheService();
