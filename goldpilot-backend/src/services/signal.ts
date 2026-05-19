import { SignalModel } from '../models';
import { calculateEMA, calculateATR, detectSignal, calculateTakeProfit, calculateStopLoss } from './indicator';
import { logger } from '../utils';
import type { Candle, Signal } from '../types';

/**
 * 信号服务类
 */
export class SignalService {
  /**
   * 分析K线数据并检测信号
   */
  async analyzeAndDetect(candles: Candle[], period: string): Promise<Signal | null> {
    try {
      // 检测信号
      const detected = detectSignal(candles);

      if (!detected) {
        return null;
      }

      // 计算ATR
      const atr = calculateATR(candles);

      // 计算止盈止损
      const takeProfit = calculateTakeProfit(detected.entry, atr, detected.direction);
      const stopLoss = calculateStopLoss(detected.entry, atr, detected.direction);

      // 检查是否已存在相同时间的信号
      const now = new Date();
      const existingSignal = await SignalModel.findOne({
        timestamp: {
          $gte: new Date(now.getTime() - 60000), // 1分钟内
        },
        period: period as any,
      });

      if (existingSignal) {
        logger.debug(`Signal already exists for period ${period}`);
        return null;
      }

      // 创建新信号
      const signal = new SignalModel({
        timestamp: now,
        direction: detected.direction,
        entryPrice: detected.entry,
        takeProfit,
        stopLoss,
        status: 'pending',
        period,
        atr,
      });

      await signal.save();

      logger.info(`New ${detected.direction} signal detected`, {
        period,
        entry: detected.entry,
        takeProfit,
        stopLoss,
      });

      return signal;
    } catch (error) {
      logger.error('Error analyzing and detecting signal:', error);
      return null;
    }
  }

  /**
   * 更新信号状态
   */
  async updateSignalStatus(signalId: string, status: 'profit' | 'loss', exitPrice?: number): Promise<Signal | null> {
    try {
      const signal = await SignalModel.findById(signalId);

      if (!signal) {
        logger.warn(`Signal not found: ${signalId}`);
        return null;
      }

      signal.status = status;
      if (exitPrice) {
        signal.exitPrice = exitPrice;
        signal.profit = this.calculateProfit(signal.entryPrice, exitPrice, signal.direction);
      }

      await signal.save();

      logger.info(`Signal updated`, {
        id: signalId,
        status,
        exitPrice,
        profit: signal.profit,
      });

      return signal;
    } catch (error) {
      logger.error('Error updating signal status:', error);
      return null;
    }
  }

  /**
   * 检查所有待处理信号的止盈止损
   */
  async checkPendingSignals(currentPrice: number): Promise<void> {
    try {
      const pendingSignals = await SignalModel.find({ status: 'pending' });

      for (const signal of pendingSignals) {
        let shouldClose = false;
        let exitPrice: number | undefined;
        let status: 'profit' | 'loss' | undefined;

        if (signal.direction === 'long') {
          // 做多信号
          if (signal.takeProfit && currentPrice >= signal.takeProfit) {
            shouldClose = true;
            exitPrice = signal.takeProfit;
            status = 'profit';
          } else if (signal.stopLoss && currentPrice <= signal.stopLoss) {
            shouldClose = true;
            exitPrice = signal.stopLoss;
            status = 'loss';
          }
        } else {
          // 做空信号
          if (signal.takeProfit && currentPrice <= signal.takeProfit) {
            shouldClose = true;
            exitPrice = signal.takeProfit;
            status = 'profit';
          } else if (signal.stopLoss && currentPrice >= signal.stopLoss) {
            shouldClose = true;
            exitPrice = signal.stopLoss;
            status = 'loss';
          }
        }

        if (shouldClose && exitPrice && status) {
          await this.updateSignalStatus(signal._id.toString(), status, exitPrice);
        }
      }
    } catch (error) {
      logger.error('Error checking pending signals:', error);
    }
  }

  /**
   * 计算盈亏
   */
  private calculateProfit(entryPrice: number, exitPrice: number, direction: 'long' | 'short'): number {
    const priceDiff = exitPrice - entryPrice;

    if (direction === 'long') {
      return priceDiff * 100; // 假每点100美元（1手）
    } else {
      return -priceDiff * 100;
    }
  }

  /**
   * 获取最新信号
   */
  async getLatestSignals(limit: number = 10): Promise<Signal[]> {
    try {
      return await SignalModel.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting latest signals:', error);
      return [];
    }
  }

  /**
   * 获取指定周期的信号
   */
  async getSignalsByPeriod(period: string, limit: number = 50): Promise<Signal[]> {
    try {
      return await SignalModel.find({ period: period as any })
        .sort({ timestamp: -1 })
        .limit(limit)
        .lean();
    } catch (error) {
      logger.error('Error getting signals by period:', error);
      return [];
    }
  }

  /**
   * 获取待处理信号
   */
  async getPendingSignals(): Promise<Signal[]> {
    try {
      return await SignalModel.find({ status: 'pending' })
        .sort({ timestamp: -1 })
        .lean();
    } catch (error) {
      logger.error('Error getting pending signals:', error);
      return [];
    }
  }

  /**
   * 清理旧信号（保留最近30天）
   */
  async cleanupOldSignals(): Promise<void> {
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await SignalModel.deleteMany({
        timestamp: { $lt: thirtyDaysAgo },
        status: { $in: ['profit', 'loss'] },
      });

      if (result.deletedCount > 0) {
        logger.info(`Cleaned up ${result.deletedCount} old signals`);
      }
    } catch (error) {
      logger.error('Error cleaning up old signals:', error);
    }
  }
}

// 导出单例
export const signalService = new SignalService();
