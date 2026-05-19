import { signalService } from './signal';
import { logger } from '../utils';

/**
 * 定时任务调度器
 */
class SchedulerService {
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * 启动信号检测定时任务
   */
  startSignalDetection(): void {
    // 每分钟检测一次1分钟周期信号
    this.schedule('signal-detection-1m', 60 * 1000, async () => {
      try {
        logger.debug('Running signal detection for 1m period');
        // TODO: 从MetaAPI获取K线数据并检测信号
        // const candles = await metaApiService.getCandles('1m', 300);
        // await signalService.analyzeAndDetect(candles, '1m');
      } catch (error) {
        logger.error('Error in 1m signal detection:', error);
      }
    });

    // 每5分钟检测一次5分钟周期信号
    this.schedule('signal-detection-5m', 5 * 60 * 1000, async () => {
      try {
        logger.debug('Running signal detection for 5m period');
        // TODO: 从MetaAPI获取K线数据并检测信号
      } catch (error) {
        logger.error('Error in 5m signal detection:', error);
      }
    });

    // 每15分钟检测一次15分钟周期信号
    this.schedule('signal-detection-15m', 15 * 60 * 1000, async () => {
      try {
        logger.debug('Running signal detection for 15m period');
        // TODO: 从MetaAPI获取K线数据并检测信号
      } catch (error) {
        logger.error('Error in 15m signal detection:', error);
      }
    });

    // 每小时检测一次1小时周期信号
    this.schedule('signal-detection-1h', 60 * 60 * 1000, async () => {
      try {
        logger.debug('Running signal detection for 1h period');
        // TODO: 从MetaAPI获取K线数据并检测信号
      } catch (error) {
        logger.error('Error in 1h signal detection:', error);
      }
    });

    logger.info('Signal detection scheduler started');
  }

  /**
   * 启动待处理信号检查定时任务
   */
  startPendingSignalCheck(): void {
    // 每10秒检查一次待处理信号
    this.schedule('pending-signal-check', 10 * 1000, async () => {
      try {
        // TODO: 从MetaAPI获取当前价格
        const currentPrice = 2400; // 模拟价格
        await signalService.checkPendingSignals(currentPrice);
      } catch (error) {
        logger.error('Error in pending signal check:', error);
      }
    });

    logger.info('Pending signal check scheduler started');
  }

  /**
   * 启动旧数据清理定时任务
   */
  startCleanupTask(): void {
    // 每天凌晨2点清理旧信号
    this.schedule('cleanup-old-signals', 24 * 60 * 60 * 1000, async () => {
      try {
        const now = new Date();
        const hour = now.getHours();

        if (hour === 2) {
          logger.info('Running daily cleanup task');
          await signalService.cleanupOldSignals();
        }
      } catch (error) {
        logger.error('Error in cleanup task:', error);
      }
    });

    logger.info('Cleanup scheduler started');
  }

  /**
   * 启动所有定时任务
   */
  startAll(): void {
    logger.info('Starting all schedulers...');

    this.startSignalDetection();
    this.startPendingSignalCheck();
    this.startCleanupTask();

    logger.info('All schedulers started');
  }

  /**
   * 停止所有定时任务
   */
  stopAll(): void {
    logger.info('Stopping all schedulers...');

    this.intervals.forEach((interval, name) => {
      clearInterval(interval);
      logger.debug(`Stopped scheduler: ${name}`);
    });

    this.intervals.clear();
    logger.info('All schedulers stopped');
  }

  /**
   * 调度定时任务
   */
  private schedule(name: string, interval: number, callback: () => void): void {
    // 如果已存在，先清除
    if (this.intervals.has(name)) {
      clearInterval(this.intervals.get(name)!);
    }

    // 立即执行一次
    callback();

    // 设置定时执行
    const timeout = setInterval(callback, interval);
    this.intervals.set(name, timeout);

    logger.debug(`Scheduled ${name} every ${interval}ms`);
  }

  /**
   * 手动触发信号检测
   */
  async triggerSignalDetection(period: string): Promise<void> {
    logger.info(`Manual signal detection triggered for period: ${period}`);
    // TODO: 从MetaAPI获取K线数据并检测信号
  }
}

// 导出单例
export const schedulerService = new SchedulerService();
