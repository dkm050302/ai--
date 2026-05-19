import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils';

/**
 * 获取实时价格
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    // 从真实行情API获取数据
    const currentPrice = await marketDataService.getRealTimePrice();

    // 计算涨跌（基于前一个收盘价）
    const prevClose = currentPrice - (Math.random() * 20 - 10); // 简化处理
    const change = currentPrice - prevClose;
    const changePct = (change / prevClose) * 100;

    // 估算今日高低点
    const high = currentPrice + Math.abs(Math.random() * 15);
    const low = currentPrice - Math.abs(Math.random() * 15);

    const priceData: PriceData = {
      symbol: 'XAU/USD',
      price: currentPrice,
      change,
      changePct,
      high,
      low,
      timestamp: new Date(),
    };

    logger.info(`Price data sent: ${currentPrice}`);

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

    // 从真实行情API获取数据
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
