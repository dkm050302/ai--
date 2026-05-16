import type { Request, Response } from 'express';
import type { PriceData } from '../types';

/**
 * 获取实时价格
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    // TODO: 从真实行情API获取数据
    // 当前返回模拟数据
    const priceData: PriceData = {
      symbol: 'XAU/USD',
      price: 2388.50,
      change: 12.30,
      changePct: 0.52,
      high: 2392.80,
      low: 2375.60,
      timestamp: new Date(),
    };

    res.json({
      success: true,
      data: priceData,
    });
  } catch (error) {
    console.error('Error fetching price:', error);
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
    const { period = '1m', limit = 100 } = req.query;

    // TODO: 从真实行情API获取数据
    // 当前返回模拟数据
    const candles = generateMockCandles(Number(limit));

    res.json({
      success: true,
      data: {
        period: String(period),
        candles,
      },
    });
  } catch (error) {
    console.error('Error fetching candles:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDLES_FETCH_ERROR',
        message: 'Failed to fetch candle data',
      },
    });
  }
}

/**
 * 生成模拟K线数据
 */
function generateMockCandles(count: number) {
  const candles = [];
  let close = 2388.50;
  const now = Date.now();

  for (let i = count - 1; i >= 0; i -= 1) {
    const open = close + (Math.random() - 0.52) * 7;
    close = open + (Math.random() - 0.48) * 10;
    const high = Math.max(open, close) + Math.random() * 7;
    const low = Math.min(open, close) - Math.random() * 7;

    candles.push({
      time: new Date(now - i * 60000),
      open,
      high,
      low,
      close,
      volume: 800 + Math.random() * 900,
    });
  }

  return candles;
}
