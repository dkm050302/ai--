/**
 * Twelve Data 数据服务
 * 使用 Twelve Data API 获取黄金K线数据
 * 文档: https://twelvedata.com/docs
 */

import axios from 'axios';
import { logger } from '../utils';

class TwelveDataService {
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';
  // 缓存
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒缓存

  constructor() {
    // 从环境变量获取API密钥
    this.apiKey = process.env.TWELVE_DATA_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('[Twelve Data] 未配置 TWELVE_DATA_API_KEY 环境变量');
    }
  }

  /**
   * 获取K线数据
   * @param interval 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Twelve Data API Key 未配置');
      }

      // 检查缓存
      const cacheKey = `${interval}_${limit}`;
      const cached = this.candlesCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [Twelve Data] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
        return cached.candles;
      }

      logger.info(`[Twelve Data] 获取K线数据: ${interval}, limit=${limit}`);

      // Twelve Data 使用 XAU/USD 作为黄金交易对
      const symbol = 'XAU/USD';
      const intervalStr = this.mapInterval(interval);
      const outputsize = Math.min(limit, 500); // Twelve Data 限制最多500条

      logger.info(`[Twelve Data] 请求参数: symbol=${symbol}, interval=${intervalStr}, outputsize=${outputsize}`);

      // 调用 Twelve Data time_series API
      const response = await axios.get(`${this.baseUrl}/time_series`, {
        params: {
          symbol,
          interval: intervalStr,
          outputsize,
          apikey: this.apiKey,
        },
        timeout: 30000,
      });

      if (response.data.status === 'error') {
        throw new Error(response.data.message || 'Twelve Data API 返回错误');
      }

      const data = response.data;

      if (!data.values || !Array.isArray(data.values)) {
        throw new Error('Twelve Data 返回数据格式无效');
      }

      if (data.values.length === 0) {
        throw new Error('Twelve Data 返回数据为空');
      }

      logger.info(`[Twelve Data] 原始数据: ${data.values.length}条`);
      logger.info(`[Twelve Data] 数据样本:`, JSON.stringify(data.values[0]));

      // 转换数据格式
      // Twelve Data 返回格式: { datetime, open, high, low, close, volume }
      const candles = data.values.map((item: any) => {
        const datetime = item.datetime;
        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const volume = parseFloat(item.volume || '0');

        return {
          time: Math.floor(new Date(datetime).getTime() / 1000), // Unix时间戳（秒）
          open,
          high,
          low,
          close,
          volume,
        };
      }).filter((c: any) => !isNaN(c.close) && c.close > 0)
        .reverse(); // Twelve Data 返回的是倒序（最新在前），需要翻转

      logger.info(`✅ [Twelve Data] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          logger.error('[Twelve Data] API Key 无效或已过期');
          return null;
        }
        if (error.response?.status === 429) {
          logger.error('[Twelve Data] API 请求次数超限');
          return null;
        }
        logger.error(`[Twelve Data] API 请求失败: ${error.message}`);
      } else {
        logger.error('[Twelve Data] K线数据获取失败:', error?.message || error);
      }
      return null;
    }
  }

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Twelve Data API Key 未配置');
      }

      logger.info(`[Twelve Data] 获取实时价格...`);

      // 使用最新的K线数据获取价格
      const candles = await this.getCandles('1m', 1);

      if (!candles || candles.length === 0) {
        throw new Error('无法获取K线数据');
      }

      const latest = candles[candles.length - 1];
      const price = latest.close;

      logger.info(`✅ [Twelve Data] 实时价格: ${price}`);

      return {
        price,
        change: 0,
        changePct: 0,
        high: price,
        low: price,
      };
    } catch (error) {
      logger.error('[Twelve Data] 获取实时价格失败:', error);
      return null;
    }
  }

  /**
   * 映射周期格式
   * Twelve Data 支持的周期: 1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week, 1month
   */
  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1h',
      '4h': '4h',
      '1d': '1day',
    };
    return map[interval] || '1min';
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.candlesCache.clear();
    logger.info('[Twelve Data] 缓存已清除');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }
      const result = await this.getCandles('1day', 1);
      return result !== null && result.length > 0;
    } catch {
      return false;
    }
  }
}

// 导出单例
export const twelveDataService = new TwelveDataService();
