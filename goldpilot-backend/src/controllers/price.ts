import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils';

/**
 * 获取实时价格
 * 使用当前数据源获取价格
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    const price = await marketDataService.getPrice();

    const priceData: PriceData = {
      symbol: 'XAU/USD',
      price,
      change: 0,
      changePct: 0,
      high: price,
      low: price,
      timestamp: new Date(),
    };

    logger.info(`Price sent: ${price}`);

    res.json({
      success: true,
      data: priceData,
    });
  } catch (error) {
    logger.error('Error getting price:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_PRICE_ERROR',
        message: 'Failed to get price',
      },
    });
  }
}

/**
 * 获取K线数据
 */
export async function getCandles(req: Request, res: Response): Promise<void> {
  try {
    const { period = '1m', limit = '100' } = req.query;

    const candles = await marketDataService.getCandles(
      period as string,
      parseInt(limit as string, 10)
    );

    logger.info(`Candles data sent: ${candles.length} candles for ${period}`);

    res.json({
      success: true,
      data: {
        candles,
      },
    });
  } catch (error) {
    logger.error('Error fetching candles:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_CANDLES_ERROR',
        message: 'Failed to get candles data',
      },
    });
  }
}
