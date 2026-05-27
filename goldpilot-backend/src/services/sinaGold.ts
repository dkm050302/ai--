/**
 * 新浪黄金数据服务
 * API来源：新浪财经 (sina.com.cn)
 * 文档：http://finance.sina.com.cn/futures/quotes/gold.shtml
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils';

interface SinaGoldPriceData {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  timestamp: Date;
}

interface SinaKlineData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

class SinaGoldService {
  private readonly BASE_URL = 'http://hq.sinajs.cn/list=hf_XAU';
  private readonly KLINE_DAILY_URL = 'http://stock2.finance.sina.com.cn/futures/api/jsonp.php/var_XAU=/GlobalFuturesService.getGlobalFuturesDailyKLine';
  private readonly KLINE_MIN_URL = 'http://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var_XAU_1=/NewForexService.getOldMinKline';

  // 缓存
  private priceCache: { data: SinaGoldPriceData | null; timestamp: number } | null = null;
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒

  /**
   * 获取实时黄金价格
   * API: http://hq.sinajs.cn/list=hf_XAU
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      // 检查缓存
      const now = Date.now();
      if (this.priceCache && (now - this.priceCache.timestamp) < this.CACHE_DURATION && this.priceCache.data) {
        logger.info(`📦 [新浪黄金] 使用缓存价格: ${this.priceCache.data.price}`);
        return {
          price: this.priceCache.data.price,
          change: this.priceCache.data.change,
          changePct: this.priceCache.data.changePct,
          high: this.priceCache.data.high,
          low: this.priceCache.data.low,
        };
      }

      logger.info(`[新浪黄金] 获取实时价格...`);

      const response = await axios.get(this.BASE_URL, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'http://finance.sina.com.cn/',
        },
      });

      // 解析响应: var hq_str_hf_XAU="伦敦金/美元,开盘,最高,最低,昨收,最新,时间";
      const data = response.data;
      const match = data.match(/var hq_str_hf_XAU="([^"]+)"/);

      if (!match || !match[1]) {
        throw new Error('无法解析新浪黄金数据');
      }

      const parts = match[1].split(',');
      if (parts.length < 7) {
        throw new Error('新浪黄金数据格式异常');
      }

      const name = parts[0]; // 伦敦金/美元
      const open = parseFloat(parts[1]) || 0;
      const high = parseFloat(parts[2]) || 0;
      const low = parseFloat(parts[3]) || 0;
      const prevClose = parseFloat(parts[4]) || 0;
      const price = parseFloat(parts[5]) || 0;
      const time = parts[6];

      if (price <= 0) {
        throw new Error('新浪黄金价格无效');
      }

      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      logger.info(`✅ [新浪黄金] 实时价格: ${price} (涨跌: ${change.toFixed(2)}, ${changePct.toFixed(2)}%)`);

      // 更新缓存
      this.priceCache = {
        data: {
          symbol: 'XAU/USD',
          name,
          price,
          change,
          changePct,
          high,
          low,
          open,
          prevClose,
          timestamp: new Date(),
        },
        timestamp: Date.now(),
      };

      return { price, change, changePct, high, low };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`⚠️ [新浪黄金] 获取实时价格失败: ${message}`);
      return null;
    }
  }

  /**
   * 获取日K线数据
   * API: http://stock2.finance.sina.com.cn/futures/api/jsonp.php/var _XAU=/GlobalFuturesService.getGlobalFuturesDailyKLine?symbol=XAU
   */
  async getDailyCandles(limit: number = 100): Promise<any[] | null> {
    try {
      logger.info(`[新浪黄金] 获取日K线数据...`);

      const response = await axios.get(this.KLINE_DAILY_URL, {
        params: {
          symbol: 'XAU',
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'http://finance.sina.com.cn/',
        },
      });

      // 解析JSONP响应
      const jsonpMatch = response.data.match(/var _XAU=\s*(\[[\s\S]*\]);/);

      if (!jsonpMatch || !jsonpMatch[1]) {
        throw new Error('无法解析新浪日K线数据');
      }

      const klineData = JSON.parse(jsonpMatch[1]);

      if (!Array.isArray(klineData) || klineData.length === 0) {
        throw new Error('新浪日K线数据为空');
      }

      // 转换数据格式
      const candles: any[] = klineData
        .slice(-limit)
        .map((item: any) => ({
          time: new Date(item.d || item.date),
          open: parseFloat(item.o || item.open),
          high: parseFloat(item.h || item.high),
          low: parseFloat(item.l || item.low),
          close: parseFloat(item.c || item.close),
          volume: 0,
        }))
        .filter((c: any) => !isNaN(c.close) && c.close > 0);

      logger.info(`✅ [新浪黄金] 日K线数据: ${candles.length}条`);

      return candles;
    } catch (error) {
      logger.error('[新浪黄金] 日K线数据获取失败:', error);
      return null;
    }
  }

  /**
   * 获取分钟K线数据
   * API: http://vip.stock.finance.sina.com.cn/forex/api/jsonp.php/var _XAU_1=/NewForexService.getOldMinKline?symbol=XAU
   */
  async getMinCandles(interval: string = '1', limit: number = 100): Promise<any[] | null> {
    try {
      logger.info(`[新浪黄金] 获取${interval}分钟K线数据...`);

      const response = await axios.get(this.KLINE_MIN_URL, {
        params: {
          symbol: 'XAU',
          type: interval, // 1=1分钟, 5=5分钟, 15=15分钟, 30=30分钟, 60=1小时
        },
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Referer': 'http://finance.sina.com.cn/',
        },
      });

      // 解析JSONP响应
      const jsonpMatch = response.data.match(/var _XAU_\d+=\s*(\[[\s\S]*\]);/);

      if (!jsonpMatch || !jsonpMatch[1]) {
        throw new Error('无法解析新浪分钟K线数据');
      }

      const klineData = JSON.parse(jsonpMatch[1]);

      if (!Array.isArray(klineData) || klineData.length === 0) {
        throw new Error('新浪分钟K线数据为空');
      }

      // 转换数据格式
      const candles: any[] = klineData
        .slice(-limit)
        .map((item: any) => ({
          time: new Date(item.d || item.date),
          open: parseFloat(item.o || item.open),
          high: parseFloat(item.h || item.high),
          low: parseFloat(item.l || item.low),
          close: parseFloat(item.c || item.close),
          volume: 0,
        }))
        .filter((c: any) => !isNaN(c.close) && c.close > 0);

      logger.info(`✅ [新浪黄金] ${interval}分钟K线数据: ${candles.length}条`);

      return candles;
    } catch (error) {
      logger.error('[新浪黄金] 分钟K线数据获取失败:', error);
      return null;
    }
  }

  /**
   * 获取K线数据（统一接口）
   * @param interval 时间周期 (1m, 5m, 15m, 30m, 1h, 1d)
   * @param limit 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    // 检查缓存
    const cacheKey = `${interval}_${limit}`;
    const cached = this.candlesCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      logger.info(`📦 [新浪黄金] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
      return cached.candles;
    }

    let candles: any[] | null = null;

    // 根据周期调用不同API
    if (interval === '1d') {
      candles = await this.getDailyCandles(limit);
    } else {
      // 映射周期到分钟数
      const intervalMap: Record<string, string> = {
        '1m': '1',
        '5m': '5',
        '15m': '15',
        '30m': '30',
        '1h': '60',
      };
      const minInterval = intervalMap[interval] || '1';
      candles = await this.getMinCandles(minInterval, limit);
    }

    if (candles && candles.length > 0) {
      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });
    }

    return candles;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.priceCache = null;
    this.candlesCache.clear();
    logger.info('[新浪黄金] 缓存已清除');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.getRealTimePrice();
      return result !== null;
    } catch {
      return false;
    }
  }
}

// 导出单例
export const sinaGoldService = new SinaGoldService();
