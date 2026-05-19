import type { PriceData } from './index';

/**
 * 创建默认价格数据
 */
export function createDefaultPriceData(): PriceData {
  return {
    symbol: 'XAU/USD',
    price: 2388.50,
    change: 12.30,
    changePct: 0.52,
    high: 2392.80,
    low: 2375.60,
    timestamp: new Date(),
    support1: 2380.00,
    support2: 2375.00,
    resistance1: 2395.00,
  };
}
