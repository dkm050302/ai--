/**
 * Stock-sdk 数据服务
 * 使用 stock-sdk 获取美股黄金ETF（GLD）K线数据
 * 注意：stock-sdk 主要支持 A 股/港股/美股，这里使用美股 GLD ETF 作为黄金数据源
 */

import { StockSDK } from 'stock-sdk';
import { logger } from '../utils';

class StockSdkService {
  private sdk: StockSDK;
  // 缓存
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒缓存

  constructor() {
    this.sdk = new StockSDK();
  }

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

      // stock-sdk 主要支持美股，使用 GLD ETF 作为黄金代理
      // GLD 是 SPDR Gold Shares，追踪黄金价格
      const symbol = 'GLD'; // SPDR Gold Shares ETF
      const klineType = this.mapInterval(interval);

      logger.info(`[Stock-sdk] 请求参数: symbol=${symbol}, klineType=${klineType}`);

      // 使用 stock-sdk 获取美股历史K线数据
      const historicalData = await this.sdk.getUSHistoryKline(
        symbol,
        { period: klineType as 'daily' | 'weekly' | 'monthly' }
      );

      if (!historicalData || !Array.isArray(historicalData)) {
        throw new Error('Stock-sdk返回数据格式无效');
      }

      if (historicalData.length === 0) {
        throw new Error('Stock-sdk返回数据为空');
      }

      logger.info(`[Stock-sdk] 原始数据: ${historicalData.length}条`);
      logger.info(`[Stock-sdk] 数据样本:`, JSON.stringify(historicalData[0]));

      // 转换数据格式
      // stock-sdk 美股K线返回格式: { date, open, high, low, close, volume, ... }
      const candles = historicalData
        .map((item: any) => {
          const date = item.date;
          const open = typeof item.open === 'number' ? item.open : parseFloat(String(item.open || '0'));
          const high = typeof item.high === 'number' ? item.high : parseFloat(String(item.high || '0'));
          const low = typeof item.low === 'number' ? item.low : parseFloat(String(item.low || '0'));
          const close = typeof item.close === 'number' ? item.close : parseFloat(String(item.close || '0'));
          const volume = typeof item.volume === 'number' ? item.volume : parseFloat(String(item.volume || '0'));

          return {
            time: Math.floor(new Date(date).getTime() / 1000), // Unix时间戳（秒）
            open,
            high,
            low,
            close,
            volume,
          };
        })
        .filter((c: any) => !isNaN(c.close) && c.close > 0);

      logger.info(`✅ [Stock-sdk] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error: any) {
      logger.error('[Stock-sdk] K线数据获取失败:', error?.message || error);
      return null;
    }
  }

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      logger.info(`[Stock-sdk] 获取实时价格...`);

      // 使用 stock-sdk 获取美股实时行情
      const quotes = await this.sdk.getUSQuotes(['GLD']);

      if (!quotes || quotes.length === 0) {
        throw new Error('无法获取美股行情数据');
      }

      const quote = quotes[0];
      const price = quote.price;
      const change = (quote as any).change ?? 0;
      const changePct = (quote as any).changePercent ?? 0;
      const high = (quote as any).high ?? price;
      const low = (quote as any).low ?? price;

      logger.info(`✅ [Stock-sdk] 实时价格: ${price}`);

      return {
        price,
        change,
        changePct,
        high,
        low,
      };
    } catch (error) {
      logger.error('[Stock-sdk] 获取实时价格失败:', error);
      return null;
    }
  }

  /**
   * 映射周期格式
   * stock-sdk 美股历史K线支持: day, week, month
   * 注意：stock-sdk 不支持美股分钟K线
   */
  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': 'day',
      '5m': 'day',
      '15m': 'day',
      '30m': 'day',
      '1h': 'day',
      '4h': 'day',
      '1d': 'day',
      '1w': 'week',
      '1M': 'month',
    };
    return map[interval] || 'day';
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
