import { promises as fs } from 'fs';
import path from 'path';
import { marketHistoryStore, type MarketHistoryPeriod } from '../services/marketHistoryStore';

interface CsvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const SUPPORTED_PERIODS: MarketHistoryPeriod[] = ['1m', '5m', '15m', '1h', '4h', '1d'];

function splitCsvLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseUtcTime(value: string): number {
  const text = value.trim();
  if (!text) return 0;

  const normalized = text.includes('T') ? text : text.replace(' ', 'T');
  const timestamp = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function parseNumber(value: string): number {
  const parsed = Number(value.trim().replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function isHeaderLine(cells: string[]): boolean {
  const normalized = cells.map((cell) => cell.trim().toLowerCase());
  return normalized.includes('open') && normalized.includes('high') && normalized.includes('low') && normalized.includes('close');
}

function parseCsv(text: string): { candles: CsvCandle[]; rawRows: number; skippedRows: number } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return { candles: [], rawRows: 0, skippedRows: 0 };
  }

  const headerLine = lines.find((line) => /open/i.test(line) && /close/i.test(line));
  if (!headerLine) {
    throw new Error('CSV缺少表头');
  }

  const delimiter = headerLine.includes(';') ? ';' : ',';
  const header = splitCsvLine(headerLine, delimiter).map((item) => item.toLowerCase());
  const timeIndex = header.findIndex((item) => ['datetime', 'date', 'time'].includes(item));
  const openIndex = header.indexOf('open');
  const highIndex = header.indexOf('high');
  const lowIndex = header.indexOf('low');
  const closeIndex = header.indexOf('close');
  const volumeIndex = header.findIndex((item) => ['volume', 'tick volume'].includes(item));

  if ([timeIndex, openIndex, highIndex, lowIndex, closeIndex].some((index) => index < 0)) {
    throw new Error(`CSV字段不完整，表头为: ${headerLine}`);
  }

  const candles: CsvCandle[] = [];
  let skippedRows = 0;

  for (const line of lines) {
    const cells = splitCsvLine(line, delimiter);
    if (isHeaderLine(cells)) {
      continue;
    }

    const time = parseUtcTime(cells[timeIndex] || '');
    const open = parseNumber(cells[openIndex] || '');
    const high = parseNumber(cells[highIndex] || '');
    const low = parseNumber(cells[lowIndex] || '');
    const close = parseNumber(cells[closeIndex] || '');
    const volume = volumeIndex >= 0 ? parseNumber(cells[volumeIndex] || '0') : 0;

    if (!time || ![open, high, low, close].every(Number.isFinite)) {
      skippedRows += 1;
      continue;
    }

    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: Number.isFinite(volume) ? volume : 0,
    });
  }

  candles.sort((a, b) => a.time - b.time);
  return { candles, rawRows: lines.length - 1, skippedRows };
}

async function main(): Promise<void> {
  const [, , fileInput, periodInput = '15m', providerInput = 'Twelve Data manual CSV'] = process.argv;
  if (!fileInput) {
    throw new Error('用法: npm run history:import-local-csv -- /path/to/file.csv 15m "Twelve Data manual CSV"');
  }

  const period = SUPPORTED_PERIODS.includes(periodInput as MarketHistoryPeriod)
    ? periodInput as MarketHistoryPeriod
    : '15m';
  const filePath = path.resolve(process.cwd(), fileInput);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = parseCsv(raw);

  if (parsed.candles.length === 0) {
    throw new Error('CSV没有可导入的K线数据');
  }

  const summary = await marketHistoryStore.upsertHistory('xauusd', period, parsed.candles, providerInput);
  const first = parsed.candles[0];
  const last = parsed.candles[parsed.candles.length - 1];

  console.log(JSON.stringify({
    filePath,
    provider: providerInput,
    period,
    rawRows: parsed.rawRows,
    parsedRows: parsed.candles.length,
    skippedRows: parsed.skippedRows,
    firstTime: first ? new Date(first.time * 1000).toISOString() : undefined,
    lastTime: last ? new Date(last.time * 1000).toISOString() : undefined,
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
