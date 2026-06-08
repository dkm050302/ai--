import { promises as fs } from 'fs';
import path from 'path';
import {
  marketHistoryStore,
  type MarketHistoryPeriod,
  type StoredMarketCandle,
} from '../services/marketHistoryStore';
import { marketHistoryHealthService } from '../services/marketHistoryHealth';

type CleanMode = 'health' | 'weekly-window';

interface CleanOptions {
  symbol: string;
  period: MarketHistoryPeriod;
  mode: CleanMode;
  apply: boolean;
  provider: string;
}

interface TimeRange {
  key: string;
  start: number;
  end: number;
}

interface FilterResult {
  kept: StoredMarketCandle[];
  removed: StoredMarketCandle[];
}

interface RemovedBuckets {
  saturday: number;
  sunday: number;
  fridayAfter21: number;
  other: number;
}

const SUPPORTED_PERIODS: MarketHistoryPeriod[] = ['1m', '5m', '15m', '1h', '4h', '1d'];
const PROGRESS_DIR = path.resolve(process.cwd(), 'data/import-progress');
const READ_ALL_LIMIT = 10_000_000;

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};

  for (const raw of process.argv.slice(2)) {
    if (!raw.startsWith('--')) continue;
    const [key, ...rest] = raw.slice(2).split('=');
    args[key] = rest.length ? rest.join('=') : true;
  }

  return args;
}

function normalizeSymbol(symbol: unknown): string {
  return String(symbol || 'xauusd').toLowerCase().replace(/[^a-z0-9]/g, '') || 'xauusd';
}

function normalizePeriod(period: unknown): MarketHistoryPeriod {
  const value = String(period || '5m') as MarketHistoryPeriod;
  return SUPPORTED_PERIODS.includes(value) ? value : '5m';
}

function normalizeMode(mode: unknown): CleanMode {
  return mode === 'health' ? 'health' : 'weekly-window';
}

function getProgressPath(symbol: string, period: MarketHistoryPeriod): string {
  return path.join(PROGRESS_DIR, `twelvedata-${symbol}-${period}.json`);
}

function parseUtcDate(dateText: string, hour: number): number {
  const timestamp = new Date(`${dateText}T${String(hour).padStart(2, '0')}:00:00Z`).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function parseWeekRange(key: string): TimeRange | null {
  const match = key.match(/^week-(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/);
  if (!match) return null;

  const start = parseUtcDate(match[1], 0);
  const end = parseUtcDate(match[2], 21);
  if (!start || !end || start > end) return null;

  return {
    key,
    start,
    end,
  };
}

async function readWeeklyRanges(symbol: string, period: MarketHistoryPeriod): Promise<TimeRange[]> {
  const file = getProgressPath(symbol, period);
  const raw = await fs.readFile(file, 'utf8');
  const parsed = JSON.parse(raw) as { completedRanges?: unknown[] };
  const completedRanges = Array.isArray(parsed.completedRanges) ? parsed.completedRanges : [];

  return completedRanges
    .map((item) => parseWeekRange(String(item)))
    .filter((range): range is TimeRange => Boolean(range))
    .sort((a, b) => a.start - b.start);
}

function filterByHealth(candles: StoredMarketCandle[], period: MarketHistoryPeriod): FilterResult {
  const cleaned = marketHistoryHealthService.cleanCandles(candles, period).candles;
  const keptTimes = new Set(cleaned.map((candle) => candle.time));

  return {
    kept: cleaned,
    removed: candles.filter((candle) => !keptTimes.has(candle.time)),
  };
}

function filterByWeeklyWindow(candles: StoredMarketCandle[], ranges: TimeRange[]): FilterResult {
  const kept: StoredMarketCandle[] = [];
  const removed: StoredMarketCandle[] = [];
  let rangeIndex = 0;

  for (const candle of candles) {
    while (rangeIndex < ranges.length && candle.time > ranges[rangeIndex].end) {
      rangeIndex += 1;
    }

    const currentRange = ranges[rangeIndex];
    if (currentRange && candle.time >= currentRange.start && candle.time <= currentRange.end) {
      kept.push(candle);
    } else {
      removed.push(candle);
    }
  }

  return { kept, removed };
}

function summarizeRemoved(candles: StoredMarketCandle[]): RemovedBuckets {
  return candles.reduce<RemovedBuckets>((summary, candle) => {
    const date = new Date(candle.time * 1000);
    const day = date.getUTCDay();
    const hour = date.getUTCHours();

    if (day === 6) {
      summary.saturday += 1;
    } else if (day === 0) {
      summary.sunday += 1;
    } else if (day === 5 && hour >= 21) {
      summary.fridayAfter21 += 1;
    } else {
      summary.other += 1;
    }

    return summary;
  }, {
    saturday: 0,
    sunday: 0,
    fridayAfter21: 0,
    other: 0,
  });
}

function formatTime(time?: number): string {
  return time ? new Date(time * 1000).toISOString() : '--';
}

function formatRange(candles: StoredMarketCandle[]): string {
  const first = candles[0];
  const last = candles[candles.length - 1];
  return `${formatTime(first?.time)} -> ${formatTime(last?.time)}`;
}

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function getOptions(): CleanOptions {
  const args = parseArgs();
  const symbol = normalizeSymbol(args.symbol);
  const period = normalizePeriod(args.period);
  const mode = normalizeMode(args.mode);
  const provider = typeof args.provider === 'string'
    ? args.provider
    : `Twelve Data weekly API raw cleaned (${mode})`;

  return {
    symbol,
    period,
    mode,
    apply: Boolean(args.apply),
    provider,
  };
}

async function main(): Promise<void> {
  const options = getOptions();
  const history = await marketHistoryStore.readHistory(options.symbol, options.period, READ_ALL_LIMIT);
  const candles = history.candles;

  if (!candles.length) {
    console.log(`[RawClean] ${options.symbol} ${options.period} 没有可清洗的历史K线。`);
    return;
  }

  const ranges = options.mode === 'weekly-window'
    ? await readWeeklyRanges(options.symbol, options.period)
    : [];

  if (options.mode === 'weekly-window' && !ranges.length) {
    throw new Error(`没有找到按周下载进度文件或 completedRanges 为空: ${getProgressPath(options.symbol, options.period)}`);
  }

  const filtered = options.mode === 'health'
    ? filterByHealth(candles, options.period)
    : filterByWeeklyWindow(candles, ranges);
  const removedBuckets = summarizeRemoved(filtered.removed);
  const action = options.apply ? 'apply' : 'dry-run';

  console.log(`[RawClean] ${action} ${options.symbol} ${options.period}`);
  console.log(`模式: ${options.mode}`);
  console.log(`原始: ${formatCount(candles.length)} | ${formatRange(candles)}`);
  console.log(`保留: ${formatCount(filtered.kept.length)} | ${formatRange(filtered.kept)}`);
  console.log(`删除: ${formatCount(filtered.removed.length)}`);
  console.log(`删除分布: 周六 ${formatCount(removedBuckets.saturday)}，周日 ${formatCount(removedBuckets.sunday)}，周五21点后 ${formatCount(removedBuckets.fridayAfter21)}，其它 ${formatCount(removedBuckets.other)}`);

  if (options.mode === 'weekly-window') {
    console.log(`周窗口: ${formatCount(ranges.length)} 段 | ${ranges[0].key} -> ${ranges[ranges.length - 1].key}`);
  }

  if (!options.apply) {
    console.log('未传 --apply，只预览，不重写 raw 仓库。');
    return;
  }

  const summary = await marketHistoryStore.replaceHistory(
    options.symbol,
    options.period,
    filtered.kept,
    options.provider
  );
  const healthReport = marketHistoryHealthService.inspectCandles(
    options.symbol,
    options.period,
    filtered.kept
  );

  console.log('已重写 raw 仓库和 manifest。');
  console.log(`manifest: ${summary.startTime || '--'} -> ${summary.endTime || '--'} | ${formatCount(summary.candleCount)} 根`);
  console.log(`健康检查: 剔除非交易 ${formatCount(healthReport.removedNonTradingCount)}，异常缺口 ${formatCount(healthReport.gapCount)}，最大缺口 ${Math.round(healthReport.largestGapSeconds / 3600)} 小时`);
}

main().catch((error) => {
  console.error('[RawClean] 失败:', error instanceof Error ? error.message : error);
  process.exit(1);
});
