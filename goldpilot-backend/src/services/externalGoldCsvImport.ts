import axios from 'axios';
import { marketHistoryStore, type MarketHistoryPeriod, type MarketHistorySummary } from './marketHistoryStore';

export interface ExternalGoldCsvImportResult {
  provider: string;
  sourceUrl: string;
  symbol: string;
  period: MarketHistoryPeriod;
  rawRows: number;
  parsedRows: number;
  skippedRows: number;
  firstTime?: string;
  lastTime?: string;
  summary: MarketHistorySummary;
}

interface ParsedCsvCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASEMAX_XAU_15M_URL = 'https://raw.githubusercontent.com/BaseMax/XAUUSD-LSTM/main/XAU_15m_data.csv';
const BASEMAX_PROVIDER = 'BaseMax GitHub CSV / Kaggle referenced';

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

function parseBaseMaxDate(value: string): number {
  const match = value.trim().match(/^(\d{4})[.-](\d{2})[.-](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return 0;

  const [, year, month, day, hour, minute, second = '0'] = match;
  return Math.floor(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ) / 1000);
}

function parseNumber(value: string): number {
  const normalized = value.trim().replace(/,/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseBaseMaxCsv(text: string): { candles: ParsedCsvCandle[]; rawRows: number; skippedRows: number } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return { candles: [], rawRows: 0, skippedRows: 0 };
  }

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const header = splitCsvLine(lines[0], delimiter).map((item) => item.toLowerCase());
  const dateIndex = header.findIndex((item) => item === 'date' || item === 'datetime' || item === 'time');
  const openIndex = header.findIndex((item) => item === 'open');
  const highIndex = header.findIndex((item) => item === 'high');
  const lowIndex = header.findIndex((item) => item === 'low');
  const closeIndex = header.findIndex((item) => item === 'close');
  const volumeIndex = header.findIndex((item) => item === 'volume' || item === 'tick volume');

  const required = [dateIndex, openIndex, highIndex, lowIndex, closeIndex];
  if (required.some((index) => index < 0)) {
    throw new Error(`CSV字段不完整，表头为: ${lines[0]}`);
  }

  const candles: ParsedCsvCandle[] = [];
  let skippedRows = 0;

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const cells = splitCsvLine(lines[lineIndex], delimiter);
    const time = parseBaseMaxDate(cells[dateIndex] || '');
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
  return {
    candles,
    rawRows: lines.length - 1,
    skippedRows,
  };
}

class ExternalGoldCsvImportService {
  async importBaseMaxXau15m(sourceUrl: string = BASEMAX_XAU_15M_URL): Promise<ExternalGoldCsvImportResult> {
    const response = await axios.get<string>(sourceUrl, {
      responseType: 'text',
      timeout: 120000,
      maxContentLength: 80 * 1024 * 1024,
      transformResponse: (data) => data,
    });

    const parsed = parseBaseMaxCsv(response.data);
    if (parsed.candles.length < 10_000) {
      throw new Error(`BaseMax 15m 数据量不足: ${parsed.candles.length}`);
    }

    const summary = await marketHistoryStore.upsertHistory('xauusd', '15m', parsed.candles, BASEMAX_PROVIDER);
    const first = parsed.candles[0];
    const last = parsed.candles[parsed.candles.length - 1];

    return {
      provider: BASEMAX_PROVIDER,
      sourceUrl,
      symbol: 'xauusd',
      period: '15m',
      rawRows: parsed.rawRows,
      parsedRows: parsed.candles.length,
      skippedRows: parsed.skippedRows,
      firstTime: first ? new Date(first.time * 1000).toISOString() : undefined,
      lastTime: last ? new Date(last.time * 1000).toISOString() : undefined,
      summary,
    };
  }
}

export const externalGoldCsvImportService = new ExternalGoldCsvImportService();
