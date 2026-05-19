import type { Request, Response } from 'express';
import { SignalModel, DailyStatsModel } from '../models';
import type { Signal, DailyStats } from '../types';
import mongoose from 'mongoose';

function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

function createDefaultTodayStats(): Omit<DailyStats, '_id'> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return {
    date: today,
    signalCount: 0,
    winCount: 0,
    lossCount: 0,
    winRate: 0,
    totalProfit: 0,
    totalLoss: 0,
    netProfit: 0,
  };
}

/**
 * 获取信号列表
 */
export async function getSignals(req: Request, res: Response): Promise<void> {
  try {
    const { date } = req.query;

    if (!isDatabaseReady()) {
      res.json({
        success: true,
        data: {
          date: date || new Date().toISOString().split('T')[0],
          signals: [],
          source: 'fallback',
          message: 'MongoDB is not connected; returning empty signals',
        },
      });
      return;
    }

    const query: any = {};

    if (date) {
      const startDate = new Date(date as string);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);

      query.timestamp = { $gte: startDate, $lte: endDate };
    }

    const signals = await SignalModel.find(query).sort({ timestamp: -1 }).limit(50);

    res.json({
      success: true,
      data: {
        date: date || new Date().toISOString().split('T')[0],
        signals,
      },
    });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SIGNALS_FETCH_ERROR',
        message: 'Failed to fetch signals',
      },
    });
  }
}

/**
 * 获取今日统计
 */
export async function getTodayStats(req: Request, res: Response): Promise<void> {
  try {
    if (!isDatabaseReady()) {
      res.json({
        success: true,
        data: {
          ...createDefaultTodayStats(),
          source: 'fallback',
          message: 'MongoDB is not connected; returning default stats',
        },
      });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let stats = await DailyStatsModel.findOne({ date: today });

    if (!stats) {
      // 如果没有今日统计数据，返回默认值
      const defaultStats = createDefaultTodayStats();

      res.json({
        success: true,
        data: defaultStats,
      });
      return;
    }

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'STATS_FETCH_ERROR',
        message: 'Failed to fetch today stats',
      },
    });
  }
}

/**
 * 创建新信号
 */
export async function createSignal(req: Request, res: Response): Promise<void> {
  try {
    if (!isDatabaseReady()) {
      res.status(503).json({
        success: false,
        error: {
          code: 'DATABASE_UNAVAILABLE',
          message: 'MongoDB is not connected; cannot create signal',
        },
      });
      return;
    }

    const signalData = req.body;

    const signal = new SignalModel(signalData);
    await signal.save();

    res.json({
      success: true,
      data: signal,
    });
  } catch (error) {
    console.error('Error creating signal:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SIGNAL_CREATE_ERROR',
        message: 'Failed to create signal',
      },
    });
  }
}
