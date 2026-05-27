import { logger } from '../utils';
import { eastmoneyService } from './eastmoney';
import { sinaGoldService } from './sinaGold';
import { metalsLiveService } from './metalsLive';

/**
 * 数据源类型
 */
export type DataSource = 'mock' | 'eastmoney' | 'sina' | 'metalslive';

/**
 * 市场数据服务 - 获取真实黄金行情数据
 * 支持多数据源切换
 */
class MarketDataService {
  // 当前数据源（默认使用 metalslive，因为它的K线数据最新）
  private currentSource: DataSource = 'metalslive';

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
      'mock': '模拟数据',
      'eastmoney': '东方财富',
      'sina': '新浪黄金',
      'metalslive': 'Metals.live',
    };
    return names[source];
  }

  /**
   * 清除所有缓存
   */
  clearCache(): void {
    this.priceCache = null;
    this.candlesCache.clear();
    logger.info('[数据源] 缓存已清除');
  }

  /**
   * 获取实时黄金价格（现货）
   * 使用当前选择的数据源
   */
  async getRealTimePrice(): Promise<number> {
    // 检查缓存
    const now = Date.now();
    if (this.priceCache && (now - this.priceCache.timestamp) < this.CACHE_DURATION) {
      logger.info(`📦 [缓存] 使用缓存价格: ${this.priceCache.price} (来源: ${this.priceCache.source})`);
      return this.priceCache.price;
    }

    let price = 0;

    switch (this.currentSource) {
      case 'mock':
        price = this.getMockPrice();
        break;
      case 'sina':
        const sinaData = await sinaGoldService.getRealTimePrice();
        if (!sinaData || sinaData.price <= 0) {
          throw new Error('新浪黄金API返回数据无效');
        }
        price = sinaData.price;
        break;
      case 'metalslive':
        const metalsData = await metalsLiveService.getRealTimePrice();
        if (!metalsData || metalsData.price <= 0) {
          // 备用方案：使用K线数据的最新收盘价
          logger.warn('Metals.live价格获取失败，使用K线数据备用');
          try {
            const candles = await this.getCandles('1m', 1);
            if (candles && candles.length > 0) {
              price = candles[candles.length - 1].close;
              logger.info(`✅ [Metals.live备用] K线价格: ${price}`);
            } else {
              throw new Error('K线数据也获取失败');
            }
          } catch (e) {
            throw new Error('Metals.live API返回数据无效，且备用数据源失败');
          }
        } else {
          price = metalsData.price;
        }
        break;
      case 'eastmoney':
      default:
        const eastmoneyData = await eastmoneyService.getRealTimePrice();
        if (!eastmoneyData || eastmoneyData.price <= 0) {
          throw new Error('东方财富API返回数据无效');
        }
        price = eastmoneyData.price;
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
      case 'sina':
        const sinaCandles = await sinaGoldService.getCandles(interval, limit);
        if (!sinaCandles || sinaCandles.length === 0) {
          throw new Error('新浪黄金API返回K线数据无效');
        }
        candles = sinaCandles;
        break;
      case 'metalslive':
        const metalsCandles = await metalsLiveService.getCandles(interval, limit);
        if (!metalsCandles || metalsCandles.length === 0) {
          throw new Error('Metals.live API返回K线数据无效');
        }
        candles = metalsCandles;
        break;
      case 'eastmoney':
      default:
        const eastmoneyCandles = await eastmoneyService.getCandles(interval, limit);
        if (!eastmoneyCandles || eastmoneyCandles.length === 0) {
          throw new Error('东方财富API返回K线数据无效');
        }
        candles = eastmoneyCandles;
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
  private generateMockCandles(interval: string, count: number): any[] {
    const candles: any[] = [];
    const now = new Date();
    const intervalMs = this.getIntervalMs(interval);

    let price = 2380 + Math.sin(Date.now() / 300000) * 15;

    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(now.getTime() - i * intervalMs);
      const volatility = this.getVolatilityForInterval(interval);
      const trend = Math.sin(i / 20) * 2;
      const noise = (Math.random() - 0.5) * volatility;

      const open = price;
      const change = trend + noise;
      const close = open + change;

      const high = Math.max(open, close) + Math.random() * volatility * 0.5;
      const low = Math.min(open, close) - Math.random() * volatility * 0.5;

      candles.push({
        time,
        open: parseFloat(open.toFixed(2)),
        high: parseFloat(high.toFixed(2)),
        low: parseFloat(low.toFixed(2)),
        close: parseFloat(close.toFixed(2)),
        volume: Math.floor(Math.random() * 1000 + 500),
      });

      price = close;
    }

    return candles;
  }

  /**
   * 获取各周期对应的波动率
   */
  private getVolatilityForInterval(interval: string): number {
    const volatilityMap: Record<string, number> = {
      '1m': 3,
      '5m': 8,
      '15m': 15,
      '1h': 25,
      '4h': 40,
      '1d': 60,
    };
    return volatilityMap[interval] || 5;
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

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ source: string; healthy: boolean }> {
    try {
      switch (this.currentSource) {
        case 'mock':
          return { source: '模拟数据', healthy: true };
        case 'sina':
          const sinaData = await sinaGoldService.getRealTimePrice();
          return { source: '新浪黄金', healthy: sinaData !== null };
        case 'metalslive':
          const metalsData = await metalsLiveService.getRealTimePrice();
          return { source: 'Metals.live', healthy: metalsData !== null };
        case 'eastmoney':
        default:
          const eastmoneyData = await eastmoneyService.getRealTimePrice();
          return { source: '东方财富', healthy: eastmoneyData !== null };
      }
    } catch (error) {
      return { source: this.getSourceName(this.currentSource), healthy: false };
    }
  }
}

// 导出单例
export const marketDataService = new MarketDataService();
