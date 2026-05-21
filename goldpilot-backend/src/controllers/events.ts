/**
 * 事件控制器 - 处理经济日历和市场快讯相关请求
 */

import { Request, Response } from 'express';
import { scraperService } from '../services/scraper';
import { logger } from '../utils/logger';

/**
 * 获取经济日历数据
 * GET /api/events/calendar?date=2026-05-21
 */
export async function getEconomicCalendar(req: Request, res: Response): Promise<void> {
  try {
    const { date } = req.query;

    // 格式化日期参数
    let dateParam = '';
    if (date && typeof date === 'string') {
      // 移除日期中的连字符，格式化为YYYYMMDD
      dateParam = date.replace(/-/g, '');
    }

    logger.info(`[Events] 获取经济日历: ${dateParam || '今天'}`);

    const events = await scraperService.getEconomicCalendar(dateParam);

    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    logger.error('[Events] 获取经济日历失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'EVENTS_CALENDAR_ERROR',
        message: '获取经济日历失败',
      },
    });
  }
}

/**
 * 获取市场快讯
 * GET /api/events/news
 */
export async function getMarketNews(req: Request, res: Response): Promise<void> {
  try {
    logger.info('[Events] 获取市场快讯');

    const news = await scraperService.getMarketNews();

    res.json({
      success: true,
      data: news,
    });
  } catch (error) {
    logger.error('[Events] 获取市场快讯失败:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'EVENTS_NEWS_ERROR',
        message: '获取市场快讯失败',
      },
    });
  }
}
