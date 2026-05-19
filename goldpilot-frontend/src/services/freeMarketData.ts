import type { Candle, Event, Flash, PriceData } from '@/types';
import { createDefaultCandles } from '@/types/chart';
import { createDefaultEvents, createDefaultFlashes } from '@/types/event';
import { createDefaultPriceData } from '@/types/price';

interface GoldApiResponse {
  price?: number;
  updatedAt?: string;
}

interface VangTodayResponse {
  success?: boolean;
  buy?: number;
  change_buy?: number;
  timestamp?: number;
}

interface RssItem {
  title?: string;
  pubDate?: string;
  link?: string;
}

interface RssResponse {
  status?: string;
  items?: RssItem[];
}

const GOLD_API_URL = 'https://api.gold-api.com/price/XAU';
const VANG_TODAY_URL = 'https://www.vang.today/api/prices?type=XAUUSD';
const RSS_TO_JSON_URL = 'https://api.rss2json.com/v1/api.json?rss_url=';

const NEWS_RSS_FEEDS = [
  'https://news.google.com/rss/search?q=%E7%8E%B0%E8%B4%A7%E9%BB%84%E9%87%91%20OR%20XAUUSD%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans',
  'https://news.google.com/rss/search?q=%E7%BE%8E%E8%81%94%E5%82%A8%20%E9%BB%84%E9%87%91%20OR%20%E7%BE%8E%E5%85%83%E6%8C%87%E6%95%B0%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans',
  'https://news.google.com/rss/search?q=%E9%BB%84%E9%87%91%20%E8%B4%A2%E7%BB%8F%20when%3A1d&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans',
];

const ECON_EVENTS: Event[] = [
  { time: '20:30', star: '★★★', text: '美国初请失业金人数、零售销售等数据窗口，留意黄金短线波动。' },
  { time: '22:00', star: '★★', text: '美国商业库存、房地产相关数据可能影响美元与美债收益率。' },
  { time: '次日 02:00', star: '★★★', text: '关注美联储官员讲话或会议纪要对降息预期的影响。' },
  { time: '全天', star: '★★', text: '跟踪美元指数、美债收益率与地缘风险对金价的联动。' },
];

let lastPriceData: PriceData | null = null;

function toNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function buildPriceData(price: number, change = 0, timestamp = new Date()): PriceData {
  const previous = lastPriceData?.price ?? price - change;
  const priceChange = change || price - previous;
  const changePct = previous ? (priceChange / previous) * 100 : 0;
  const high = Math.max(price, lastPriceData?.high ?? price, price + Math.abs(priceChange) * 0.4);
  const low = Math.min(price, lastPriceData?.low ?? price, price - Math.abs(priceChange) * 0.4);
  const support1 = Math.round((price - 8) * 10) / 10;
  const support2 = Math.round((price - 18) * 10) / 10;
  const resistance1 = Math.round((price + 10) * 10) / 10;

  const nextData: PriceData = {
    symbol: 'XAU/USD',
    price,
    change: priceChange,
    changePct,
    high,
    low,
    timestamp,
    support1,
    support2,
    resistance1,
  };

  lastPriceData = nextData;
  return nextData;
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json() as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchFromGoldApi(): Promise<PriceData> {
  const data = await fetchJson<GoldApiResponse>(GOLD_API_URL);
  const price = toNumber(data.price);

  if (!price) {
    throw new Error('gold-api returned empty price');
  }

  return buildPriceData(price, 0, data.updatedAt ? new Date(data.updatedAt) : new Date());
}

async function fetchFromVangToday(): Promise<PriceData> {
  const data = await fetchJson<VangTodayResponse>(`${VANG_TODAY_URL}&_=${Date.now()}`);
  const price = toNumber(data.buy);

  if (!data.success || !price) {
    throw new Error('vang.today returned empty price');
  }

  const change = toNumber(data.change_buy) ?? 0;
  const timestamp = data.timestamp ? new Date(data.timestamp * 1000) : new Date();
  return buildPriceData(price, change, timestamp);
}

export async function fetchFreeGoldPrice(): Promise<PriceData> {
  try {
    return await fetchFromGoldApi();
  } catch (goldApiError) {
    console.warn('[FreeMarketData] gold-api failed, trying vang.today', goldApiError);
  }

  try {
    return await fetchFromVangToday();
  } catch (vangError) {
    console.warn('[FreeMarketData] vang.today failed, using local fallback', vangError);
  }

  const fallback = createDefaultPriceData();
  const drift = Math.sin(Date.now() / 240000) * 7;
  return buildPriceData(fallback.price + drift, drift, new Date());
}

export function buildCandlesFromPrice(priceData: PriceData, period = '1m', count = 86): Candle[] {
  const fallbackCandles = createDefaultCandles();
  const periodMs = getPeriodMs(period);
  const now = Date.now();
  let close = priceData.price - Math.sin(count / 8) * 8;

  return Array.from({ length: count }, (_, index) => {
    const remaining = count - index - 1;
    const progress = index / Math.max(count - 1, 1);
    const target = priceData.price;
    const trend = (target - close) * Math.min(progress + 0.08, 0.35);
    const noise = Math.sin((Date.now() / 60000) + index * 0.9) * 1.6;
    const open = close;
    close = index === count - 1 ? target : open + trend + noise;
    const spread = Math.max(1.5, Math.abs(close - open) + 1.2);

    return {
      time: new Date(now - remaining * periodMs),
      open: roundPrice(open),
      high: roundPrice(Math.max(open, close) + spread * 0.45),
      low: roundPrice(Math.min(open, close) - spread * 0.45),
      close: roundPrice(close),
      volume: fallbackCandles[index]?.volume ?? 1000,
    };
  });
}

export async function fetchChineseMarketNews(): Promise<{ flashes: Flash[]; events: Event[] }> {
  const settledFeeds = await Promise.allSettled(
    NEWS_RSS_FEEDS.map((feed) => fetchJson<RssResponse>(`${RSS_TO_JSON_URL}${encodeURIComponent(feed)}&_=${Date.now()}`, 10000))
  );

  const items = settledFeeds
    .flatMap((result) => result.status === 'fulfilled' ? result.value.items ?? [] : [])
    .filter((item) => item.title)
    .slice(0, 12);

  if (items.length === 0) {
    return {
      flashes: createDefaultFlashes(),
      events: ECON_EVENTS.length ? ECON_EVENTS : createDefaultEvents(),
    };
  }

  const seen = new Set<string>();
  const flashes = items.reduce<Flash[]>((acc, item) => {
    const title = cleanNewsTitle(item.title ?? '');
    if (!title || seen.has(title)) {
      return acc;
    }

    seen.add(title);
    acc.push({
      time: formatNewsTime(item.pubDate),
      hot: /黄金|金价|美联储|美元|CPI|非农|降息|避险/.test(title),
      text: title,
    });
    return acc;
  }, []);

  return {
    flashes: flashes.length ? flashes : createDefaultFlashes(),
    events: ECON_EVENTS,
  };
}

function cleanNewsTitle(title: string): string {
  return title
    .replace(/<[^>]+>/g, '')
    .replace(/\s+-\s+Google\s+News$/i, '')
    .replace(/\s+-\s+[^-]{2,20}$/u, '')
    .trim();
}

function formatNewsTime(pubDate?: string): string {
  const date = pubDate ? new Date(pubDate) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function getPeriodMs(period: string): number {
  const map: Record<string, number> = {
    '1m': 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  return map[period] ?? map['1m'];
}

function roundPrice(price: number): number {
  return Math.round(price * 100) / 100;
}
