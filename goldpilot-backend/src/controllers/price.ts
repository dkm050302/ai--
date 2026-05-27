import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils';

/**
 * 获取实时价格
 * 注意：价格固定使用新浪黄金数据源，不受数据源切换影响
 * K线数据可以通过数据源设置切换
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    // 价格固定使用新浪黄金数据源
    const { sinaGoldService } = await import('../services/sinaGold.js');
    const sinaData = await sinaGoldService.getRealTimePrice();

    if (!sinaData || sinaData.price <= 0) {
      throw new Error('新浪黄金API返回数据无效');
    }

    const priceData: PriceData = {
      symbol: 'XAU/USD',
      price: sinaData.price,
      change: sinaData.change,
      changePct: sinaData.changePct,
      high: sinaData.high,
      low: sinaData.low,
      timestamp: new Date(),
    };

    logger.info(`Price data sent (新浪黄金): ${sinaData.price}`);

    res.json({
      success: true,
      data: priceData,
    });
  } catch (error) {
    logger.error('Error fetching price:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'PRICE_FETCH_ERROR',
        message: 'Failed to fetch price data',
      },
    });
  }
}

/**
 * 获取K线数据
 */
export async function getCandles(req: Request, res: Response): Promise<void> {
  try {
    let { period = '1m', limit = 100 } = req.query;

    // 处理可能是数组的情况
    period = Array.isArray(period) ? period[0] : period;
    limit = Array.isArray(limit) ? limit[0] : limit;

    // 从当前数据源API获取数据
    const candles = await marketDataService.getCandles(String(period), Number(limit));

    logger.info(`Candles data sent: ${candles.length} candles for ${period}`);

    res.json({
      success: true,
      data: {
        period: String(period),
        candles,
      },
    });
  } catch (error) {
    logger.error('Error fetching candles:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDLES_FETCH_ERROR',
        message: 'Failed to fetch candle data',
      },
    });
  }
}
