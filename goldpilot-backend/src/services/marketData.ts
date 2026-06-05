import { logger } from '../utils';
import { twelveDataService } from './twelveData';
import { sinaGoldService } from './sinaGold';

/**
 * 数据源类型
 */
export type DataSource = 'mock' | 'twelvedata';

/**
 * 市场数据服务 - 获取真实黄金行情数据
 * 支持多数据源切换
 */
class MarketDataService {
  // 单人样品默认使用模拟K线，避免未配置 Twelve Data 时首页无法分析
  private currentSource: DataSource = process.env.DEFAULT_DATA_SOURCE === 'twelvedata' ? 'twelvedata' : 'mock';

  // 缓存机制，减少API调用
  private priceCache: { price: number; timestamp: number; source: string } | null = null;
  private candlesCache: Map<string, { candles: any[]; timestamp: number; source: string }> = new Map();
  private readonly CACHE_DURATION = 60 * 1000;

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
   * 获取实时价格（始终使用新浪黄金）
   */
  async getPrice(): Promise<number> {
    const quote = await this.getPriceQuote();
    return quote.price;
  }

  async getPriceQuote(): Promise<{ price: number; change: number; changePct: number; high: number; low: number; source: string }> {
    if (this.priceCache && (Date.now() - this.priceCache.timestamp) < this.CACHE_DURATION) {
      logger.info(`📦 [缓存] 使用缓存价格: ${this.priceCache.price} (来源: ${this.priceCache.source})`);
      const candles = await this.getCandles('1m', 360);
      return this.buildQuoteFromCandles(candles, this.priceCache.source);
    }

    if (this.currentSource === 'twelvedata') {
      const candles = await this.getCandles('1m', 360);
      const quote = this.buildQuoteFromCandles(candles, 'Twelve Data');
      this.priceCache = {
        price: quote.price,
        timestamp: Date.now(),
        source: quote.source,
      };
      return quote;
    }

    const sinaData = await sinaGoldService.getRealTimePrice();
    if (!sinaData || sinaData.price <= 0) {
      logger.warn('[新浪黄金] 价格数据获取失败或为空，使用模拟数据');
      const candles = await this.getCandles('1m', 120);
      const quote = this.buildQuoteFromCandles(candles, '模拟数据');
      this.priceCache = {
        price: quote.price,
        timestamp: Date.now(),
        source: quote.source,
      };
      return quote;
    }

    logger.info(`✅ [新浪黄金] Price: ${sinaData.price}`);

    this.priceCache = {
      price: sinaData.price,
      timestamp: Date.now(),
      source: '新浪黄金',
    };

    return {
      ...sinaData,
      source: '新浪黄金',
    };
  }

  private buildQuoteFromCandles(candles: any[], source: string): { price: number; change: number; changePct: number; high: number; low: number; source: string } {
    if (!candles || candles.length === 0) {
      const price = this.getMockPrice();
      return {
        price,
        change: 0,
        changePct: 0,
        high: price,
        low: price,
        source,
      };
    }

    const latest = candles[candles.length - 1];
    const previous = candles.length > 1 ? candles[candles.length - 2] : latest;
    const price = Number(latest.close || 0);
    const previousClose = Number(previous.close || price);
    const change = Number((price - previousClose).toFixed(2));
    const changePct = previousClose > 0 ? Number(((change / previousClose) * 100).toFixed(2)) : 0;
    const recent = candles.slice(-120);

    return {
      price,
      change,
      changePct,
      high: Number(Math.max(...recent.map((item) => Number(item.high || price))).toFixed(2)),
      low: Number(Math.min(...recent.map((item) => Number(item.low || price))).toFixed(2)),
      source,
    };
  }

  /**
   * 获取模拟价格
   */
  private getMockPrice(): number {
    const basePrice = this.priceCache?.price || 4450;
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
          candles = this.getCachedCandlesForInterval(interval, limit) || this.generateMockCandles(interval, limit);
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

    let basePrice = this.priceCache?.price || 4450;

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

  private getCachedCandlesForInterval(interval: string, limit: number): any[] | null {
    const prefix = `${interval}_`;
    const candidates = [...this.candlesCache.entries()]
      .filter(([key, cached]) => key.startsWith(prefix) && cached.candles.length > 0)
      .sort((a, b) => b[1].timestamp - a[1].timestamp);

    if (candidates.length === 0) {
      return null;
    }

    const cached = candidates[0][1].candles;
    logger.warn(`[缓存] Twelve Data 暂无新K线，回退到最近可用缓存: ${cached.length}条`);
    return cached.slice(-limit);
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
