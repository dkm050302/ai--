/**
 * Stock-sdk 数据服务
 * 使用 stock-sdk 获取黄金K线数据
 */

import { getTicker, getHistoricalTicker } from 'stock-sdk';
import { logger } from '../utils';

class StockSdkService {
  // 缓存
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒缓存

  /**
   * 获取K线数据
   * @param interval 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    try {
      // 检查缓存
      const cacheKey = `${interval}_${limit}`;
      const cached = this.candlesCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [Stock-sdk] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
        return cached.candles;
      }

      logger.info(`[Stock-sdk] 获取K线数据: ${interval}, limit=${limit}`);

      // stock-sdk 支持的周期格式
      // 1m, 5m, 15m, 30m, 1h, 1d
      const period = this.mapInterval(interval);

      // 获取历史数据
      // 使用 XAUUSD 作为黄金代码
      const endDate = new Date();
      const startDate = new Date(Date.now() - this.getIntervalMs(interval) * limit);

      logger.info(`[Stock-sdk] 请求时间范围: ${startDate.toISOString()} 到 ${endDate.toISOString()}`);

      // 使用 stock-sdk 获取历史数据
      const historicalData = await getHistoricalTicker({
        symbol: 'XAUUSD',
        period,
        start: startDate,
        end: endDate,
      });

      if (!historicalData || !Array.isArray(historicalData) || historicalData.length === 0) {
        throw new Error('Stock-sdk返回数据为空');
      }

      // 转换数据格式
      const candles = historicalData.map((item: any) => ({
        time: Math.floor(new Date(item.date || item.time).getTime() / 1000), // Unix时间戳（秒）
        open: parseFloat(item.open || 0),
        high: parseFloat(item.high || 0),
        low: parseFloat(item.low || 0),
        close: parseFloat(item.close || 0),
        volume: parseFloat(item.volume || 0),
      })).filter((c: any) => c.close > 0);

      // 按时间排序
      candles.sort((a, b) => a.time - b.time);

      logger.info(`✅ [Stock-sdk] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error) {
      logger.error('[Stock-sdk] K线数据获取失败:', error);
      return null;
    }
  }

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      logger.info(`[Stock-sdk] 获取实时价格...`);

      const ticker = await getTicker('XAUUSD');

      if (!ticker || !ticker.price) {
        throw new Error('Stock-sdk返回价格无效');
      }

      const price = parseFloat(ticker.price);
      const change = parseFloat(ticker.change || 0);
      const changePct = parseFloat(tailer.changePercent || 0);
      const high = parseFloat(ticker.high || price);
      const low = parseFloat(ticker.low || price);

      logger.info(`✅ [Stock-sdk] 实时价格: ${price}`);

      return { price, change, changePct, high, low };
    } catch (error) {
      logger.error('[Stock-sdk] 获取实时价格失败:', error);
      return null;
    }
  }

  /**
   * 映射周期格式
   */
  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '30m': '30m',
      '1h': '1h',
      '4h': '4h',
      '1d': '1d',
    };
    return map[interval] || '1d';
  }

  /**
   * 获取周期对应的毫秒数
   */
  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 60 * 1000;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.candlesCache.clear();
    logger.info('[Stock-sdk] 缓存已清除');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.getCandles('1d', 1);
      return result !== null && result.length > 0;
    } catch {
      return false;
    }
  }
}

// 导出单例
export const stockSdkService = new StockSdkService();
