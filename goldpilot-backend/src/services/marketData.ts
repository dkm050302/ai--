import { logger } from '../utils';
import { twelveDataService } from './twelveData';

/**
 * 数据源类型
 */
export type DataSource = 'mock' | 'twelvedata';

/**
 * 市场数据服务 - 获取真实黄金行情数据
 * 支持多数据源切换
 */
class MarketDataService {
  // 当前数据源（默认使用 Twelve Data）
  private currentSource: DataSource = 'twelvedata';

  // 缓存机制，减少API调用
  private priceCache: { price: number; timestamp: number; source: string } | null = null;
  private candlesCache: Map<string, { candles: any[]; timestamp: number; source: string }> = new Map();
  private readonly CACHE_DURATION = 5000; // 缓存5秒，确保K线时间同步

  /**
   * 设置数据源
   */
  setDataSource(source: DataSource): void {
    this.currentSource = source;
    // 清除缓存，确保使用新数据源
    this.clearCache();
    logger.info(`[数据源] 已切换到: ${this.getSourceName(source)}`);
  }

  /**
   * 获取当前数据源
   */
  getDataSource(): DataSource {
    return this.currentSource;
  }

  /**
   * 获取数据源名称
   */
  private getSourceName(source: DataSource): string {
    const names: Record<DataSource, string> = {
      mock: '模拟数据',
      twelvedata: 'Twelve Data',
    };
    return names[source] || source;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.priceCache = null;
    this.candlesCache.clear();
    logger.info('[缓存] 已清除所有缓存');
  }

  /**
   * 获取实时价格
   */
  async getPrice(): Promise<number> {
    // 检查缓存
    if (this.priceCache && (Date.now() - this.priceCache.timestamp) < this.CACHE_DURATION) {
      logger.info(`📦 [缓存] 使用缓存价格: ${this.priceCache.price} (来源: ${this.priceCache.source})`);
      return this.priceCache.price;
    }

    let price = 0;

    switch (this.currentSource) {
      case 'mock':
        price = this.getMockPrice();
        break;
      case 'twelvedata':
        const twelveDataData = await twelveDataService.getRealTimePrice();
        if (!twelveDataData || twelveDataData.price <= 0) {
          logger.warn('[Twelve Data] 价格数据获取失败或为空，使用模拟数据');
          price = this.getMockPrice();
        } else {
          price = twelveDataData.price;
        }
        break;
      default:
        price = this.getMockPrice();
        break;
    }

    logger.info(`✅ [${this.getSourceName(this.currentSource)}] Price: ${price}`);

    // 更新缓存
    this.priceCache = {
      price,
      timestamp: Date.now(),
      source: this.getSourceName(this.currentSource),
    };

    return price;
  }

  /**
   * 获取模拟价格
   */
  private getMockPrice(): number {
    const basePrice = 2380;
    const timeVariation = Math.sin(Date.now() / 300000) * 15;
    return basePrice + timeVariation;
  }

  /**
   * 获取K线数据
   * 使用当前选择的数据源
   * @param interval - 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit - 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[]> {
    // 检查缓存
    const cacheKey = `${interval}_${limit}`;
    const cached = this.candlesCache.get(cacheKey);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
      logger.info(`📦 [缓存] 使用缓存K线: ${interval} (${cached.candles.length}条, 来源: ${cached.source})`);
      return cached.candles;
    }

    let candles: any[] = [];

    switch (this.currentSource) {
      case 'mock':
        candles = this.generateMockCandles(interval, limit);
        break;
      case 'twelvedata':
        const twelveDataCandles = await twelveDataService.getCandles(interval, limit);
        if (!twelveDataCandles || twelveDataCandles.length === 0) {
          logger.warn('[Twelve Data] K线数据获取失败或为空');
          candles = [];
        } else {
          candles = twelveDataCandles;
        }
        break;
      default:
        candles = this.generateMockCandles(interval, limit);
        break;
    }

    logger.info(`✅ [${this.getSourceName(this.currentSource)}] K线: ${candles.length}条 for ${interval}`);

    // 更新缓存
    this.candlesCache.set(cacheKey, {
      candles,
      timestamp: Date.now(),
      source: this.getSourceName(this.currentSource),
    });

    return candles;
  }

  /**
   * 生成模拟K线数据
   */
  private generateMockCandles(interval: string, limit: number): any[] {
    const candles: any[] = [];
    const now = Date.now();
    const intervalMs = this.getIntervalMs(interval);

    let basePrice = 2380;

    for (let i = limit - 1; i >= 0; i--) {
      const time = Math.floor((now - i * intervalMs) / 1000);
      const volatility = 2 + Math.random() * 3;
      const change = (Math.random() - 0.5) * volatility;

      const open = basePrice;
      const close = basePrice + change;
      const high = Math.max(open, close) + Math.random() * 1;
      const low = Math.min(open, close) - Math.random() * 1;
      const volume = Math.floor(1000 + Math.random() * 5000);

      candles.push({ time, open, high, low, close, volume });

      basePrice = close;
    }

    return candles;
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
    return map[interval] || 60 * 1000;
  }
}

// 导出单例
export const marketDataService = new MarketDataService();
