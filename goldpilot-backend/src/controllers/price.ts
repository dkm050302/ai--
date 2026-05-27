import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { sinaGoldService } from '../services/sinaGold';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils';

/**
 * 获取实时价格
 * 使用新浪黄金数据源获取完整价格信息
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    const sinaData = await sinaGoldService.getRealTimePrice();

    if (!sinaData) {
      throw new Error('新浪黄金数据获取失败');
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

    logger.info(`Price sent: ${sinaData.price}, 涨跌: ${sinaData.change}, 涨跌幅: ${sinaData.changePct}%`);

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
