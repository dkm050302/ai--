import axios from 'axios';
import type { YahooPriceData, YahooCandle } from '../types';
import { logger } from '../utils';

class YahooPriceService {
  private cache: { data: any; ts: number } | null = null;
  private CACHE_TTL = 30000; // 30秒缓存
  private readonly CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d';

  async getPrice(): Promise<YahooPriceData> {
    const raw = await this.fetchChart();
    const meta = raw.meta;
    const price = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose;
    const change = price - prevClose;
    const changePct = (change / prevClose) * 100;

    // 日内最高最低
    const quotes = raw.indicators?.quote?.[0] || {};
    const highs = (quotes.high || []).filter((v: number | null) => v != null) as number[];
    const lows = (quotes.low || []).filter((v: number | null) => v != null) as number[];
    const opens = quotes.open || [];
    const firstOpen = opens.find((v: number | null) => v != null) ?? prevClose;

    // 构建K线
    const timestamps: number[] = raw.timestamp || [];
    const candles: YahooCandle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const c = (quotes.close as number[])?.[i];
      if (c == null) continue;
      candles.push({
        time: timestamps[i] * 1000,
        open: (quotes.open as number[])?.[i] ?? c,
        high: (quotes.high as number[])?.[i] ?? c,
        low: (quotes.low as number[])?.[i] ?? c,
        close: c,
        volume: (quotes.volume as number[])?.[i] ?? 0,
      });
    }

    return {
      price,
      open: firstOpen,
      high: highs.length ? Math.max(...highs) : price,
      low: lows.length ? Math.min(...lows) : price,
      prevClose,
      change,
      changePct,
      timestamp: Math.floor(Date.now() / 1000),
      candles,
    };
  }

  private async fetchChart(): Promise<any> {
    // 检查缓存
    if (this.cache && Date.now() - this.cache.ts < this.CACHE_TTL) {
      return this.cache.data;
    }

    try {
      const resp = await axios.get(this.CHART_URL, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      });

      const result = resp.data?.chart?.result?.[0];
      if (!result?.meta) throw new Error('No chart data from Yahoo');

      this.cache = { data: result, ts: Date.now() };
      logger.info(`[Yahoo] Price: ${result.meta.regularMarketPrice}`);
      return result;
    } catch (err: any) {
      logger.warn(`[Yahoo] Fetch failed: ${err.message}`);
      if (this.cache) return this.cache.data;
      throw err;
    }
  }
}

export const yahooPriceService = new YahooPriceService();
