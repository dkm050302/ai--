/**
 * Dukascopy 数据服务
 * 使用 dukascopy-node 获取真实的黄金价格和K线数据
 * 优化内存使用，避免获取过多数据
 */

import { getHistoricalRates } from 'dukascopy-node';
import { logger } from '../utils';

interface DukascopyCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

class DukascopyService {
  // 缓存机制
  private priceCache: { price: number; data: any; timestamp: number } | null = null;
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 缓存60秒

  // 最大数据条数限制（防止内存溢出）
  private readonly MAX_LIMITS: Record<string, number> = {
    '1m': 500,   // 1分钟最多500条（约8小时）
    '5m': 500,   // 5分钟最多500条（约42小时）
    '15m': 300,  // 15分钟最多300条（约75小时）
    '30m': 200,  // 30分钟最多200条（约100小时）
    '1h': 200,   // 1小时最多200条（约200小时）
    '4h': 100,   // 4小时最多100条（约400小时）
    '1d': 100,   // 1天最多100条（约100天）
  };

  /**
   * 将项目周期映射到 Dukascopy 周期
   */
  private mapInterval(interval: string): 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h4' | 'd1' {
    const map: Record<string, 'm1' | 'm5' | 'm15' | 'm30' | 'h1' | 'h4' | 'd1'> = {
      '1m': 'm1',
      '5m': 'm5',
      '15m': 'm15',
      '30m': 'm30',
      '1h': 'h1',
      '4h': 'h4',
      '1d': 'd1',
    };
    return map[interval] || 'm1';
  }

  /**
   * 获取实时黄金价格
   * 使用较小的日期范围来避免内存问题
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      // 检查缓存
      const now = Date.now();
      if (this.priceCache && (now - this.priceCache.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [Dukascopy缓存] 使用缓存价格: ${this.priceCache.price}`);
        return {
          price: this.priceCache.price,
          change: 0,
          changePct: 0,
          high: this.priceCache.data?.high || this.priceCache.price,
          low: this.priceCache.data?.low || this.priceCache.price,
        };
      }

      // 获取最近30分钟的数据来计算实时价格（避免过多数据）
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 30 * 60 * 1000); // 30分钟前

      logger.info(`[Dukascopy] 获取实时价格...`);

      // 设置超时（10秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 10000);
      });

      const dataPromise = getHistoricalRates({
        instrument: 'xauusd',
        dates: {
          from: startDate,
          to: endDate,
        },
        timeframe: 'm1', // 使用1分钟数据获取最新价格
        format: 'json',
      });

      const data = await Promise.race([dataPromise, timeoutPromise]) as DukascopyCandle[];

      if (!data || data.length === 0) {
        throw new Error('No data returned from Dukascopy');
      }

      // 获取最新的数据点
      const latest = data[data.length - 1];
      const price = latest.close;

      // 计算涨跌（与前一个数据点比较）
      const previous = data.length > 1 ? data[data.length - 2] : data[0];
      const change = price - previous.close;
      const changePct = (change / previous.close) * 100;

      // 计算高低点（使用最近的数据）
      const recentData = data.slice(-30); // 最近30分钟
      const high = Math.max(...recentData.map((d: DukascopyCandle) => d.high));
      const low = Math.min(...recentData.map((d: DukascopyCandle) => d.low));

      logger.info(`✅ [Dukascopy] 实时价格: ${price} (涨跌: ${change.toFixed(2)}, ${changePct.toFixed(2)}%)`);

      // 更新缓存
      this.priceCache = {
        price,
        data: { high, low },
        timestamp: Date.now(),
      };

      return { price, change, changePct, high, low };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`⚠️ [Dukascopy] 获取实时价格失败: ${message}`);
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
      // 限制请求的数据量
      const maxLimit = this.MAX_LIMITS[interval] || 100;
      const actualLimit = Math.min(limit, maxLimit);

      // 检查缓存
      const cacheKey = `${interval}_${actualLimit}`;
      const cached = this.candlesCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [Dukascopy缓存] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
        return cached.candles;
      }

      const dukascopyInterval = this.mapInterval(interval);
      const intervalMs = this.getIntervalMs(interval);

      // 计算日期范围（限制在合理范围内）
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - intervalMs * actualLimit * 1.2);

      logger.info(`[Dukascopy] 获取K线数据: ${interval}, limit=${actualLimit}`);

      // 设置超时（15秒）
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 15000);
      });

      const dataPromise = getHistoricalRates({
        instrument: 'xauusd',
        dates: {
          from: startDate,
          to: endDate,
        },
        timeframe: dukascopyInterval,
        format: 'json',
      });

      const data = await Promise.race([dataPromise, timeoutPromise]) as DukascopyCandle[];

      if (!data || data.length === 0) {
        throw new Error('No candle data returned from Dukascopy');
      }

      // 转换为项目统一格式
      const candles = data
        .slice(-actualLimit) // 只取最后 actualLimit 条
        .map((item: DukascopyCandle) => ({
          time: new Date(item.timestamp),
          open: item.open,
          high: item.high,
          low: item.low,
          close: item.close,
          volume: item.volume || 0,
        }));

      logger.info(`✅ [Dukascopy] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`⚠️ [Dukascopy] 获取K线失败: ${message}`);
      return null;
    }
  }

  /**
   * 获取周期对应的毫秒数
   */
  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 1000;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.priceCache = null;
    this.candlesCache.clear();
    logger.info('[Dukascopy] 缓存已清除');
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
export const dukascopyService = new DukascopyService();
