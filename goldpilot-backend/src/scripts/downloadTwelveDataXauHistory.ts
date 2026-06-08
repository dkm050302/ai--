import 'dotenv/config';
import axios from 'axios';
import { existsSync, readFileSync } from 'fs';
import { promises as fs } from 'fs';
import path from 'path';
import { marketHistoryStore, type MarketHistoryPeriod } from '../services/marketHistoryStore';
import { marketHistoryHealthService } from '../services/marketHistoryHealth';

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DownloadOptions {
  symbol: string;
  period: MarketHistoryPeriod;
  start: Date;
  end: Date;
  chunk: 'week' | 'month';
  outputSize: number;
  delayMs: number;
  dryRun: boolean;
  force: boolean;
  provider: string;
}

interface Range {
  start: Date;
  end: Date;
}

interface ProgressFile {
  version: 1;
  symbol: string;
  period: MarketHistoryPeriod;
  completedRanges: string[];
  updatedAt: string;
}

const SUPPORTED_PERIODS: MarketHistoryPeriod[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const BASE_URL = 'https://api.twelvedata.com/time_series';
const PROGRESS_DIR = path.resolve(process.cwd(), 'data/import-progress');

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }

  return args;
}

function parseDate(value: unknown, fallback: Date): Date {
  if (!value || value === true) return fallback;
  const text = String(value);
  const timestamp = new Date(text.includes('T') ? text : `${text}T00:00:00Z`).getTime();
  if (!Number.isFinite(timestamp)) {
    throw new Error(`日期格式无效: ${text}`);
  }
  return new Date(timestamp);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function addUtcMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1, 0, 0, 0));
}

function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function getRangeKey(range: Range, chunk: DownloadOptions['chunk']): string {
  if (chunk === 'month') {
    return `month-${getMonthKey(range.start)}`;
  }

  return `week-${formatIsoDate(range.start)}_${formatIsoDate(range.end)}`;
}

function formatApiDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function mapInterval(period: MarketHistoryPeriod): string {
  const map: Record<MarketHistoryPeriod, string> = {
    '1m': '1min',
    '5m': '5min',
    '15m': '15min',
    '1h': '1h',
    '4h': '4h',
    '1d': '1day',
  };
  return map[period];
}

function loadApiKeys(): string[] {
  const envMulti = process.env.TWELVEDATA_API_KEYS || process.env.TWELVE_DATA_API_KEYS || '';
  const envSingle = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '';
  const splitKeys = (value: string) => value.split(/[\n,;]+/).map((key) => key.trim()).filter(Boolean);

  if (envMulti.trim()) return splitKeys(envMulti);
  if (envSingle.trim()) return [envSingle.trim()];

  const keysFile = path.resolve(process.cwd(), '.twelvedata-apikeys');
  const keyFile = path.resolve(process.cwd(), '.twelvedata-apikey');

  if (existsSync(keysFile)) {
        const raw = readFileSync(keysFile, 'utf8').trim();
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((key) => String(key).trim()).filter(Boolean);
      }
    } catch {
      // 兼容纯文本
    }

    return splitKeys(raw);
  }

  if (existsSync(keyFile)) {
    const raw = readFileSync(keyFile, 'utf8').trim();
    return raw ? [raw] : [];
  }

  return [];
}

function buildMonthRanges(start: Date, end: Date): Range[] {
  const ranges: Range[] = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1, 0, 0, 0));

  while (cursor < end) {
    const monthStart = cursor < start ? start : cursor;
    const nextMonth = addUtcMonths(cursor, 1);
    const monthEnd = nextMonth > end ? end : nextMonth;

    if (monthStart < monthEnd) {
      ranges.push({ start: monthStart, end: monthEnd });
    }

    cursor = nextMonth;
  }

  return ranges;
}

function getUtcMonday(date: Date): Date {
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  const monday = startOfUtcDay(date);
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  return monday;
}

function buildTradingWeekRanges(start: Date, end: Date): Range[] {
  const ranges: Range[] = [];
  let monday = getUtcMonday(start);

  while (monday < end) {
    const weekStart = new Date(monday);
    const fridayClose = new Date(monday);
    fridayClose.setUTCDate(fridayClose.getUTCDate() + 4);
    fridayClose.setUTCHours(21, 0, 0, 0);

    const rangeStart = weekStart < start ? start : weekStart;
    const rangeEnd = fridayClose > end ? end : fridayClose;

    if (rangeStart < rangeEnd) {
      ranges.push({ start: rangeStart, end: rangeEnd });
    }

    monday = new Date(monday);
    monday.setUTCDate(monday.getUTCDate() + 7);
  }

  return ranges;
}

function buildRanges(options: DownloadOptions): Range[] {
  return options.chunk === 'week'
    ? buildTradingWeekRanges(options.start, options.end)
    : buildMonthRanges(options.start, options.end);
}

function normalizeCandle(item: any): Candle | null {
  const datetime = String(item?.datetime || '');
  const time = Math.floor(new Date(`${datetime.replace(' ', 'T')}Z`).getTime() / 1000);
  const open = Number(item?.open);
  const high = Number(item?.high);
  const low = Number(item?.low);
  const close = Number(item?.close);
  const volume = Number(item?.volume || 0);

  if (!time || ![open, high, low, close].every(Number.isFinite)) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume: Number.isFinite(volume) ? volume : 0,
  };
}

function dedupeCandles(candles: Candle[]): Candle[] {
  return [...new Map(candles.map((candle) => [candle.time, candle])).values()]
    .sort((a, b) => a.time - b.time);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProgressPath(symbol: string, period: MarketHistoryPeriod): string {
  const normalizedSymbol = symbol.toLowerCase().replace(/[^a-z0-9]/g, '');
  return path.join(PROGRESS_DIR, `twelvedata-${normalizedSymbol}-${period}.json`);
}

async function readProgress(symbol: string, period: MarketHistoryPeriod): Promise<ProgressFile> {
  const file = getProgressPath(symbol, period);
  try {
    const raw = await fs.readFile(file, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      symbol,
      period,
      completedRanges: Array.isArray(parsed.completedRanges)
        ? parsed.completedRanges
        : Array.isArray(parsed.completedMonths)
          ? parsed.completedMonths.map((item: string) => `month-${item}`)
          : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      version: 1,
      symbol,
      period,
      completedRanges: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

async function writeProgress(progress: ProgressFile): Promise<void> {
  await fs.mkdir(PROGRESS_DIR, { recursive: true });
  progress.updatedAt = new Date().toISOString();
  await fs.writeFile(getProgressPath(progress.symbol, progress.period), JSON.stringify(progress, null, 2));
}

async function requestRange(
  options: DownloadOptions,
  keys: string[],
  range: Range,
  requestIndex: number
): Promise<Candle[]> {
  const apiKey = keys[requestIndex % keys.length];
  const response = await axios.get(BASE_URL, {
    params: {
      symbol: options.symbol,
      interval: mapInterval(options.period),
      start_date: formatApiDate(range.start),
      end_date: formatApiDate(range.end),
      outputsize: options.outputSize,
      timezone: 'UTC',
      apikey: apiKey,
    },
    timeout: 30000,
  });

  if (response.data?.status === 'error') {
    throw new Error(`Twelve Data错误: ${response.data.message || JSON.stringify(response.data)}`);
  }

  const values: any[] = Array.isArray(response.data?.values) ? response.data.values : [];
  const startTime = Math.floor(range.start.getTime() / 1000);
  const endTime = Math.floor(range.end.getTime() / 1000);

  return dedupeCandles(values
    .map(normalizeCandle)
    .filter((item): item is Candle => Boolean(item))
    .filter((item) => item.time >= startTime && item.time <= endTime)
  );
}

async function fetchRangeAdaptive(
  options: DownloadOptions,
  keys: string[],
  range: Range,
  requestCounter: { value: number }
): Promise<Candle[]> {
  const rangeHours = (range.end.getTime() - range.start.getTime()) / 3600000;
  const candles = await requestRange(options, keys, range, requestCounter.value);
  requestCounter.value += 1;

  console.log(`  ${formatApiDate(range.start)} -> ${formatApiDate(range.end)} | ${candles.length} 根`);

  if (options.delayMs > 0) {
    await sleep(options.delayMs);
  }

  const likelyTruncated = candles.length >= Math.floor(options.outputSize * 0.98);
  if (likelyTruncated && rangeHours > 48) {
    const middle = new Date(Math.floor((range.start.getTime() + range.end.getTime()) / 2));
    console.log(`  接近 outputsize 上限，自动拆分: ${formatApiDate(range.start)} -> ${formatApiDate(range.end)}`);
    const left = await fetchRangeAdaptive(options, keys, { start: range.start, end: middle }, requestCounter);
    const right = await fetchRangeAdaptive(options, keys, { start: middle, end: range.end }, requestCounter);
    return dedupeCandles([...left, ...right]);
  }

  return candles;
}

function parseOptions(): DownloadOptions {
  const args = parseArgs();
  const now = startOfUtcDay(new Date());
  const years = Number(args.years || 6);
  const defaultStart = new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const periodInput = String(args.period || '5m');
  const period = SUPPORTED_PERIODS.includes(periodInput as MarketHistoryPeriod)
    ? periodInput as MarketHistoryPeriod
    : '5m';

  return {
    symbol: String(args.symbol || 'XAU/USD'),
    period,
    chunk: args.chunk === 'month' ? 'month' : 'week',
    start: parseDate(args.start, defaultStart),
    end: parseDate(args.end, now),
    outputSize: Math.max(100, Math.min(Number(args.outputsize || 5000), 50000)),
    delayMs: Math.max(0, Number(args['delay-ms'] || 16000)),
    dryRun: Boolean(args['dry-run']),
    force: Boolean(args.force),
    provider: String(args.provider || 'Twelve Data weekly API'),
  };
}

async function main(): Promise<void> {
  const options = parseOptions();
  const keys = loadApiKeys();
  const ranges = buildRanges(options);
  const progress = await readProgress(options.symbol, options.period);

  console.log('GoldPilot Twelve Data 历史K线下载');
  console.log(`品种: ${options.symbol}`);
  console.log(`周期: ${options.period} (${mapInterval(options.period)})`);
  console.log(`范围: ${formatIsoDate(options.start)} -> ${formatIsoDate(options.end)}`);
  console.log(`分段: ${ranges.length} 个${options.chunk === 'week' ? '交易周' : '月'}`);
  console.log(`分段方式: ${options.chunk === 'week' ? '周一00:00 UTC -> 周五21:00 UTC' : '自然月'}`);
  console.log(`outputsize: ${options.outputSize}`);
  console.log(`请求延迟: ${options.delayMs}ms`);
  console.log(`API Key数量: ${keys.length}`);
  console.log(`模式: ${options.dryRun ? 'dry-run' : 'download'}`);
  console.log('');

  if (options.dryRun) {
    ranges.forEach((range, index) => {
      console.log(`${String(index + 1).padStart(2, '0')}. ${getRangeKey(range, options.chunk)} | ${formatApiDate(range.start)} -> ${formatApiDate(range.end)}`);
    });
    return;
  }

  if (keys.length === 0) {
    throw new Error('未配置 Twelve Data API Key。请先设置 TWELVEDATA_API_KEY，或写入 goldpilot-backend/.twelvedata-apikey');
  }

  const requestCounter = { value: 0 };

  for (const range of ranges) {
    const rangeKey = getRangeKey(range, options.chunk);
    if (!options.force && progress.completedRanges.includes(rangeKey)) {
      console.log(`跳过 ${rangeKey}，进度文件显示已完成。使用 --force 可重新下载。`);
      continue;
    }

    console.log(`下载 ${rangeKey}: ${formatApiDate(range.start)} -> ${formatApiDate(range.end)}`);
    const candles = await fetchRangeAdaptive(options, keys, range, requestCounter);
    const uniqueCandles = dedupeCandles(candles);

    if (uniqueCandles.length === 0) {
      console.log(`  ${rangeKey} 无数据，跳过写入。`);
      continue;
    }

    const summary = await marketHistoryStore.upsertHistory(
      'xauusd',
      options.period,
      uniqueCandles,
      options.provider
    );
    const session = marketHistoryHealthService.cleanCandles(uniqueCandles, options.period).quality;

    if (!progress.completedRanges.includes(rangeKey)) {
      progress.completedRanges.push(rangeKey);
      progress.completedRanges.sort();
      await writeProgress(progress);
    }

    console.log(`  写入 ${uniqueCandles.length.toLocaleString()} 根，当前仓库 ${summary.candleCount.toLocaleString()} 根`);
    console.log(`  本月可交易 ${session.tradableCount.toLocaleString()} 根，剔除非交易 ${session.removedNonTradingCount.toLocaleString()} 根`);
    console.log('');
  }

  console.log(`完成。总请求数: ${requestCounter.value}`);
  console.log(`进度文件: ${getProgressPath(options.symbol, options.period)}`);
}

main().catch((error) => {
  console.error('Twelve Data 历史K线下载失败:', error);
  process.exitCode = 1;
});
