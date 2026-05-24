/**
 * 东方财富数据服务
 * 获取 XAU/USD 现货黄金的实时价格和K线数据
 * API来源：东方财富网 (eastmoney.com)
 */

import axios from 'axios';
import { logger } from '../utils';

class EastMoneyService {
  // 缓存机制
  private priceCache: { price: number; data: any; timestamp: number } | null = null;
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 缓存60秒

  // 基础URL
  private readonly QUOTE_API = 'https://push2.eastmoney.com/api/qt/stock/get';
  private readonly KLINE_API = 'https://push2his.eastmoney.com/api/qt/stock/klt';

  // 请求头
  private readonly headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
    'Referer': 'https://quote.eastmoney.com/',
  };

  // Axios 配置
  private readonly axiosConfig = {
    timeout: 30000, // 30秒超时
    httpsAgent: undefined, // 允许自签名证书
  };

  /**
   * 将项目周期映射到东方财富周期参数
   */
  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '101',
      '5m': '102',
      '15m': '103',
      '30m': '104',
      '1h': '106',
      '4h': '107',
      '1d': '105',
      '1w': '108',
      '1M': '109',
    };
    return map[interval] || '101';
  }

  /**
   * 获取实时黄金价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      // 检查缓存
      const now = Date.now();
      if (this.priceCache && (now - this.priceCache.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [东方财富缓存] 使用缓存价格: ${this.priceCache.price}`);
        return {
          price: this.priceCache.price,
          change: this.priceCache.data?.change || 0,
          changePct: this.priceCache.data?.changePct || 0,
          high: this.priceCache.data?.high || this.priceCache.price,
          low: this.priceCache.data?.low || this.priceCache.price,
        };
      }

      logger.info(`[东方财富] 获取实时价格...`);

      // 字段说明：
      // f43: 最新价, f44: 昨收, f45: 今开, f46: 最高, f47: 最低
      // f48: 涨跌幅(%), f49: 涨跌额, f60: 昨收, f162: 市场状态
      const fields = 'f43,f44,f45,f46,f47,f48,f49,f60,f162';

      const response = await axios.get(this.QUOTE_API, {
        params: {
          secid: '122.XAU', // XAU/USD 现货黄金
          fields,
          ut: 'fa5fd1943c7b386f172d6893dbfba10b',
        },
        headers: this.headers,
        timeout: 10000,
      });

      if (!response.data || !response.data.data) {
        throw new Error('Invalid response from East Money');
      }

      const data = response.data.data;

      // 解析数据
      const price = data.f43 || 0; // 最新价
      const prevClose = data.f44 || data.f60 || price; // 昨收价
      const open = data.f45 || price; // 今开
      const high = data.f46 || price; // 最高
      const low = data.f47 || price; // 最低
      const changePct = data.f48 || 0; // 涨跌幅(%)
      const change = data.f49 || 0; // 涨跌额

      logger.info(`✅ [东方财富] 实时价格: ${price} (涨跌: ${change.toFixed(2)}, ${changePct.toFixed(2)}%)`);

      // 更新缓存
      this.priceCache = {
        price,
        data: { change, changePct, high, low },
        timestamp: Date.now(),
      };

      return { price, change, changePct, high, low };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`⚠️ [东方财富] 获取实时价格失败: ${message}`);
      return null;
    }
  }

  /**
   * 获取K线数据
   * @param interval - 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit - 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    try {
      // 检查缓存
      const cacheKey = `${interval}_${limit}`;
      const cached = this.candlesCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [东方财富缓存] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
        return cached.candles;
      }

      const klt = this.mapInterval(interval);

      logger.info(`[东方财富] 获取K线数据: ${interval}, limit=${limit}`);

      // 字段说明：
      // fields1: 基础字段
      // fields2: f51=开, f52=高, f53=低, f54=收, f55=量, f56=额, f57=振幅, f58=涨跌幅, f59=涨跌额, f60=昨收
      const response = await axios.get(this.KLINE_API, {
        params: {
          secid: '122.XAU',
          ut: 'fa5fd1943c7b386f172d6893dbfba10b',
          fields1: 'f1,f2,f3,f4,f5,f6',
          fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
          klt: klt, // 周期
          fqt: '0', // 不复权
          end: '20500101',
          lmt: limit.toString(), // 数据条数
        },
        headers: this.headers,
        timeout: 15000,
      });

      if (!response.data || !response.data.data || !response.data.data.klines) {
        throw new Error('Invalid kline response from East Money');
      }

      // 解析K线数据
      // 格式: "日期,开,高,低,收,量,额,振幅,涨跌幅,涨跌额,昨收"
      const klineStrings = response.data.data.klines;
      const candles = klineStrings.map((kline: string) => {
        const parts = kline.split(',');
        return {
          time: new Date(parts[0]),
          open: parseFloat(parts[1]),
          high: parseFloat(parts[2]),
          low: parseFloat(parts[3]),
          close: parseFloat(parts[4]),
          volume: parseFloat(parts[5]) || 0,
        };
      });

      logger.info(`✅ [东方财富] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`⚠️ [东方财富] 获取K线失败: ${message}`);
      return null;
    }
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.priceCache = null;
    this.candlesCache.clear();
    logger.info('[东方财富] 缓存已清除');
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
export const eastmoneyService = new EastMoneyService();
