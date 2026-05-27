import type { Request, Response } from 'express';
import type { PriceData } from '../types';
import { marketDataService } from '../services/marketData';
import { logger } from '../utils';

/**
 * 获取实时价格
 */
export async function getPrice(req: Request, res: Response): Promise<void> {
  try {
    // 使用当前选择的数据源获取价格
    const price = await marketDataService.getRealTimePrice();

    // 获取当前数据源信息
    const currentSource = marketDataService.getDataSource();

    // 根据数据源获取完整的价格数据（包括高低价）
    let priceData: PriceData;

    switch (currentSource) {
      case 'sina': {
        const { sinaGoldService } = await import('../services/sinaGold.js');
        const sinaData = await sinaGoldService.getRealTimePrice();

        if (!sinaData || sinaData.price <= 0) {
          throw new Error('新浪黄金API返回数据无效');
        }

        priceData = {
          symbol: 'XAU/USD',
          price: sinaData.price,
          change: sinaData.change,
          changePct: sinaData.changePct,
          high: sinaData.high,
          low: sinaData.low,
          timestamp: new Date(),
        };

        logger.info(`Price data sent (新浪黄金): ${sinaData.price}`);
        break;
      }

      case 'metalslive': {
        const { metalsLiveService } = await import('../services/metalsLive.js');
        const metalsData = await metalsLiveService.getRealTimePrice();

        if (!metalsData || metalsData.price <= 0) {
          // 如果metalslive失败，尝试获取最新K线的收盘价作为备用
          logger.warn('Metals.live价格获取失败，尝试使用K线数据作为备用');
          try {
            const candles = await marketDataService.getCandles('1m', 1);
            if (candles && candles.length > 0) {
              const latestCandle = candles[candles.length - 1];
              priceData = {
                symbol: 'XAU/USD',
                price: latestCandle.close,
                change: 0,
                changePct: 0,
                high: latestCandle.high,
                low: latestCandle.low,
                timestamp: new Date(),
              };
              logger.info(`Price data sent (K线备用): ${latestCandle.close}`);
              break;
            }
          } catch (e) {
            logger.error('K线数据获取也失败:', e);
          }
          throw new Error('Metals.live API返回数据无效，且备用数据源失败');
        }

        priceData = {
          symbol: 'XAU/USD',
          price: metalsData.price,
          change: metalsData.change,
          changePct: metalsData.changePct,
          high: metalsData.high,
          low: metalsData.low,
          timestamp: new Date(),
        };

        logger.info(`Price data sent (Metals.live): ${metalsData.price}`);
        break;
      }

      case 'mock': {
        const mockHigh = price + Math.abs(Math.random() * 15);
        const mockLow = price - Math.abs(Math.random() * 15);
        const mockChange = (Math.random() - 0.5) * 10;
        const mockPrevClose = price - mockChange;
        const mockChangePct = (mockChange / mockPrevClose) * 100;

        priceData = {
          symbol: 'XAU/USD',
          price,
          change: mockChange,
          changePct: mockChangePct,
          high: mockHigh,
          low: mockLow,
          timestamp: new Date(),
        };

        logger.info(`Price data sent (模拟数据): ${price}`);
        break;
      }

      case 'eastmoney':
      default: {
        const { eastmoneyService } = await import('../services/eastmoney.js');
        const eastmoneyData = await eastmoneyService.getRealTimePrice();

        if (!eastmoneyData || eastmoneyData.price <= 0) {
          throw new Error('东方财富API返回数据无效');
        }

        priceData = {
          symbol: 'XAU/USD',
          price: eastmoneyData.price,
          change: eastmoneyData.change,
          changePct: eastmoneyData.changePct,
          high: eastmoneyData.high,
          low: eastmoneyData.low,
          timestamp: new Date(),
        };

        logger.info(`Price data sent (东方财富): ${eastmoneyData.price}`);
        break;
      }
    }

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
