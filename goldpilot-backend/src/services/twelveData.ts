/**
 * Twelve Data 数据服务
 * 使用 Twelve Data API 获取黄金K线数据
 * 文档: https://twelvedata.com/docs
 */

import axios from 'axios';
import { logger } from '../utils';

class TwelveDataService {
  private apiKey: string;
  private baseUrl = 'https://api.twelvedata.com';
  // 缓存
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒缓存

  constructor() {
    // 从环境变量获取API密钥（支持两种命名方式）
    this.apiKey = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '';
    if (!this.apiKey) {
      logger.warn('[Twelve Data] 未配置 TWELVEDATA_API_KEY 环境变量');
    }
  }

  /**
   * 获取K线数据
   * @param interval 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Twelve Data API Key 未配置');
      }

      // 检查缓存
      const cacheKey = `${interval}_${limit}`;
      const cached = this.candlesCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        logger.info(`📦 [Twelve Data] 使用缓存K线: ${interval} (${cached.candles.length}条)`);
        return cached.candles;
      }

      logger.info(`[Twelve Data] 获取K线数据: ${interval}, limit=${limit}`);

      // Twelve Data 使用 XAU/USD 作为黄金交易对
      const symbol = 'XAU/USD';
      const intervalStr = this.mapInterval(interval);

      const allCandles: any[] = [];

      // 计算需要跨越多少天
      // 1分钟：1440条/天，5分钟：288条/天，15分钟：96条/天，1小时：24条/天
      const intervalMs = this.getIntervalMs(interval);
      const candlesPerDay = Math.floor(24 * 60 * 60 * 1000 / intervalMs);
      const daysNeeded = Math.ceil(limit / candlesPerDay) + 1; // 多加1天确保足够

      logger.info(`[Twelve Data] 需要 ${daysNeeded} 天数据，每天约 ${candlesPerDay} 条`);

      // 从今天开始往前获取多天数据
      for (let day = 0; day < daysNeeded; day++) {
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - day);
        endDate.setHours(23, 59, 59);

        const startDate = new Date(endDate);
        startDate.setHours(0, 0, 0);

        const startStr = this.formatDateTime(startDate);
        const endStr = this.formatDateTime(endDate);

        logger.info(`[Twelve Data] 第 ${day + 1}/${daysNeeded} 天: ${startStr} 到 ${endStr}`);

        try {
          const response = await axios.get(`${this.baseUrl}/time_series`, {
            params: {
              symbol,
              interval: intervalStr,
              start_date: startStr,
              end_date: endStr,
              apikey: this.apiKey,
            },
            timeout: 30000,
          });

          if (response.data.status === 'error') {
            logger.warn(`[Twelve Data] 第 ${day + 1} 天错误: ${response.data.message}`);
            continue;
          }

          const data = response.data;

          if (!data.values || !Array.isArray(data.values)) {
            logger.warn(`[Twelve Data] 第 ${day + 1} 天返回格式无效`);
            continue;
          }

          const dayCandles = data.values;
          logger.info(`[Twelve Data] 第 ${day + 1} 天获取 ${dayCandles.length} 条`);
          if (dayCandles.length > 0) {
            logger.info(`[Twelve Data] 样本数据: ${JSON.stringify(dayCandles[0])}`);
          }

          // 添加到总数据中
          allCandles.push(...dayCandles);

          // API限制：每秒8次请求，添加延迟避免超限
          await new Promise(resolve => setTimeout(resolve, 200));

          // 如果已经获取足够数据，停止
          if (allCandles.length >= limit) {
            logger.info(`[Twelve Data] 已获取足够数据: ${allCandles.length} 条`);
            break;
          }
        } catch (error) {
          if (axios.isAxiosError(error)) {
            if (error.response?.status === 429) {
              logger.error(`[Twelve Data] API 请求次数超限，等待后重试...`);
              await new Promise(resolve => setTimeout(resolve, 5000));
            }
          }
          logger.error(`[Twelve Data] 第 ${day + 1} 天获取失败:`, error);
          // 继续获取下一天
        }
      }

      logger.info(`[Twelve Data] 原始数据总计: ${allCandles.length}条`);

      // 转换数据格式
      // Twelve Data 返回格式: { datetime, open, high, low, close, volume }
      // datetime 格式: "YYYY-MM-DD HH:MM:SS"
      // 需要重新计算时间戳，使其与当前时间对齐

      const candles: any[] = [];

      // 获取最后一根K线的时间（Twelve Data返回的最新时间）
      const lastDatetime = allCandles[allCandles.length - 1].datetime;
      const lastDataDate = new Date(lastDatetime);
      const lastDataTime = lastDataDate.getTime();

      // 当前时间
      const currentTime = Date.now();

      // 计算时间差（毫秒）
      const timeDiff = lastDataTime - currentTime;

      logger.info(`[Twelve Data] 时间调整: 数据时间=${lastDatetime}, 时间差=${Math.round(timeDiff/1000)}秒`);

      // 先收集所有数据并解析时间，然后调整时间戳
      for (let i = 0; i < allCandles.length; i++) {
        const item = allCandles[i];
        const datetime = item.datetime;
        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const volume = parseFloat(item.volume || '0');

        // 解析原始时间并计算调整后的时间戳
        const originalDate = new Date(datetime);
        const adjustedTime = originalDate.getTime() - timeDiff;
        const time = Math.floor(adjustedTime / 1000);

        // 调试：显示前几条和最后一条的时间调整
        if (i < 3 || i === allCandles.length - 1) {
          const adjustedDate = new Date(adjustedTime);
          logger.info(`[Twelve Data] 时间调整 [${i}]: ${datetime} → ${adjustedDate.toISOString()}`);
        }

        // 只保留时间合理的数据（调整后不超过当前时间）
        if (adjustedTime <= currentTime) {
          candles.push({ time, open, high, low, close, volume });
        }
      }

      // 按时间排序（升序）
      candles.sort((a, b) => a.time - b.time);

      logger.info(`✅ [Twelve Data] K线数据: ${candles.length}条 for ${interval}`);

      // 更新缓存
      this.candlesCache.set(cacheKey, { candles, timestamp: Date.now() });

      return candles;
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          logger.error('[Twelve Data] API Key 无效或已过期');
          return null;
        }
        if (error.response?.status === 429) {
          logger.error('[Twelve Data] API 请求次数超限');
          return null;
        }
        logger.error(`[Twelve Data] API 请求失败: ${error.message}`);
      } else {
        logger.error('[Twelve Data] K线数据获取失败:', error?.message || error);
      }
      return null;
    }
  }

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      if (!this.apiKey) {
        throw new Error('Twelve Data API Key 未配置');
      }

      logger.info(`[Twelve Data] 获取实时价格...`);

      // 使用最新的K线数据获取价格
      const candles = await this.getCandles('1m', 1);

      if (!candles || candles.length === 0) {
        throw new Error('无法获取K线数据');
      }

      const latest = candles[candles.length - 1];
      const price = latest.close;

      logger.info(`✅ [Twelve Data] 实时价格: ${price}`);

      return {
        price,
        change: 0,
        changePct: 0,
        high: price,
        low: price,
      };
    } catch (error) {
      logger.error('[Twelve Data] 获取实时价格失败:', error);
      return null;
    }
  }

  /**
   * 映射周期格式
   * Twelve Data 支持的周期: 1min, 5min, 15min, 30min, 1h, 4h, 1day, 1week, 1month
   */
  private mapInterval(interval: string): string {
    const map: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1h',
      '4h': '4h',
      '1d': '1day',
    };
    return map[interval] || '1min';
  }

  /**
   * 解析 UTC 时间字符串
   * Twelve Data 返回格式: "YYYY-MM-DD HH:MM:SS" (UTC时间)
   */
  private parseUTCTime(datetimeStr: string): number {
    // 解析格式: "2026-05-27 13:54:00"
    const parts = datetimeStr.split(/[\s\-:]+/);
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // 月份从0开始
    const day = parseInt(parts[2]);
    const hour = parseInt(parts[3]);
    const minute = parseInt(parts[4]);
    const second = parseInt(parts[5]);

    // 创建 UTC 时间
    const date = new Date(Date.UTC(year, month, day, hour, minute, second));

    return date.getTime();
  }

  /**
   * 格式化日期时间为 YYYY-MM-DD HH:MM:SS 格式
   */
  private formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  }

  /**
   * 格式化日期为 YYYY-MM-DD 格式
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * 获取周期对应的毫秒数
   */
  private getIntervalMs(interval: string): number {
    const map: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return map[interval] || 60 * 1000;
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.candlesCache.clear();
    logger.info('[Twelve Data] 缓存已清除');
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.apiKey) {
        return false;
      }
      const result = await this.getCandles('1day', 1);
      return result !== null && result.length > 0;
    } catch {
      return false;
    }
  }
}

// 导出单例
export const twelveDataService = new TwelveDataService();
