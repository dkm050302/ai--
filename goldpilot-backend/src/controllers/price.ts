import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { marketDataService } from '../services/marketData';
import { goldHistoryService } from '../services/goldHistory';
import { logger } from '../utils';

/**
 * 获取实时价格
 * 使用新浪黄金数据源获取完整价格信息
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    const quote = await marketDataService.getPriceQuote();

    const priceData: PriceData = {
      symbol: 'XAU/USD',
      price: quote.price,
      change: quote.change,
      changePct: quote.changePct,
      high: quote.high,
      low: quote.low,
      timestamp: new Date(),
    };

    logger.info(`Price sent: ${quote.price}, source: ${quote.source}, 涨跌: ${quote.change}, 涨跌幅: ${quote.changePct}%`);

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
    const { period = '1m', limit = '100', mode } = req.query;
    const parsedLimit = parseInt(limit as string, 10);

    if (mode === 'history') {
      const history = await goldHistoryService.getLongHistory(period, parsedLimit);
      logger.info(`History candles sent: ${history.candles.length} candles for ${period}`);

      res.json({
        success: true,
        data: {
          candles: history.candles,
          meta: history.meta,
        },
      });
      return;
    }

    const candles = await marketDataService.getCandles(
      period as string,
      parsedLimit
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
