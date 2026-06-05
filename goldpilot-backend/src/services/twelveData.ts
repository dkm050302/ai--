/**
 * Twelve Data 数据服务
 * 使用 Twelve Data API 获取黄金K线数据
 * 文档: https://twelvedata.com/docs
 */

import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils';

interface ActiveApiKeyInfo {
  apiKey: string;
  keyCount: number;
  activeKeyIndex: number;
  activeKeyLabel: string;
  activeWindow: string;
  rotationMode: 'single' | 'split_12h';
}

class TwelveDataService {
  private apiKey: string = '';
  private apiKeys: string[] = [];
  private baseUrl = 'https://api.twelvedata.com';
  // 缓存
  private candlesCache: Map<string, { candles: any[]; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 60秒缓存

  // 配额追踪（从响应头获取）
  private dailyLimit = 800; // 免费版每日限制
  private apiCreditsUsed = 0; // 从响应头获取：已使用额度
  private apiCreditsLeft = 800; // 从响应头获取：剩余额度
  private lastResetDate = new Date().getDate();

  // 速率限制：每分钟最多4次请求
  private rateLimitRequests: number[] = []; // 记录请求时间戳
  private readonly RATE_LIMIT_MAX_REQUESTS = 4; // 每分钟最大请求数
  private readonly RATE_LIMIT_WINDOW = 60000; // 时间窗口：60秒

  // API Key 文件路径
  private readonly API_KEY_FILE = path.join(process.cwd(), '.twelvedata-apikey');
  private readonly API_KEYS_FILE = path.join(process.cwd(), '.twelvedata-apikeys');

  constructor() {
    this.apiKeys = this.loadApiKeys();
    this.apiKey = this.getActiveKeyInfo().apiKey;

    if (this.apiKeys.length === 0) {
      logger.warn('[Twelve Data] 未配置 TWELVEDATA_API_KEY');
    } else if (this.apiKeys.length >= 2) {
      const active = this.getActiveKeyInfo();
      logger.info(`[Twelve Data] 双 Key 12小时轮换已启用，当前使用 ${active.activeKeyLabel} (${active.activeWindow})`);
    } else {
      logger.info('[Twelve Data] API Key 已配置');
    }
  }

  private parseApiKeys(raw: string): string[] {
    return raw
      .split(/[\n,;]+/)
      .map((key) => key.trim())
      .filter(Boolean);
  }

  private loadApiKeys(): string[] {
    const envMulti = process.env.TWELVEDATA_API_KEYS || process.env.TWELVE_DATA_API_KEYS || '';
    if (envMulti.trim()) {
      return this.parseApiKeys(envMulti);
    }

    const envSingle = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '';
    if (envSingle.trim()) {
      return [envSingle.trim()];
    }

    try {
      if (fs.existsSync(this.API_KEYS_FILE)) {
        const raw = fs.readFileSync(this.API_KEYS_FILE, 'utf-8').trim();
        if (!raw) {
          return [];
        }

        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            logger.info('[Twelve Data] 从双 Key 文件加载 API Keys');
            return parsed.map((key) => String(key).trim()).filter(Boolean);
          }
        } catch {
          // 兼容纯文本：换行、逗号或分号分隔
        }

        logger.info('[Twelve Data] 从双 Key 文本文件加载 API Keys');
        return this.parseApiKeys(raw);
      }

      if (fs.existsSync(this.API_KEY_FILE)) {
        const apiKey = fs.readFileSync(this.API_KEY_FILE, 'utf-8').trim();
        logger.info('[Twelve Data] 从文件加载 API Key');
        return apiKey ? [apiKey] : [];
      }
    } catch (error) {
      logger.warn('[Twelve Data] 读取 API Key 文件失败:', error);
    }

    return [];
  }

  private getBeijingHour(date: Date = new Date()): number {
    const hourPart = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      hour: '2-digit',
      hour12: false,
    }).formatToParts(date).find((part) => part.type === 'hour')?.value;

    return Number(hourPart || '0');
  }

  private getActiveKeyInfo(): ActiveApiKeyInfo {
    if (this.apiKeys.length >= 2) {
      const beijingHour = this.getBeijingHour();
      const activeKeyIndex = beijingHour < 12 ? 0 : 1;
      const activeKeyLabel = activeKeyIndex === 0 ? 'A' : 'B';

      return {
        apiKey: this.apiKeys[activeKeyIndex],
        keyCount: this.apiKeys.length,
        activeKeyIndex,
        activeKeyLabel,
        activeWindow: activeKeyIndex === 0 ? '北京时间 00:00-11:59' : '北京时间 12:00-23:59',
        rotationMode: 'split_12h',
      };
    }

    return {
      apiKey: this.apiKeys[0] || '',
      keyCount: this.apiKeys.length,
      activeKeyIndex: 0,
      activeKeyLabel: this.apiKeys.length === 1 ? '单 Key' : '未配置',
      activeWindow: '全天',
      rotationMode: 'single',
    };
  }

  private getActiveApiKey(): string {
    const active = this.getActiveKeyInfo();
    this.apiKey = active.apiKey;
    return active.apiKey;
  }

  /**
   * 获取剩余配额（从响应头获取的真实数据）
   */
  getRemainingQuota(): {
    limit: number;
    used: number;
    remaining: number;
    resetTime: string;
    keyCount: number;
    activeKeyIndex: number;
    activeKeyLabel: string;
    activeWindow: string;
    rotationMode: 'single' | 'split_12h';
  } {
    const now = new Date();
    const today = now.getDate();

    // 如果是新的一天，重置计数
    if (this.lastResetDate !== today) {
      this.apiCreditsUsed = 0;
      this.apiCreditsLeft = this.dailyLimit;
      this.lastResetDate = today;
    }

    // 计算重置时间（UTC午夜）
    const utcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
    const resetTime = utcMidnight.toISOString();

    // 如果有响应头数据，使用真实数据；否则使用默认值
    const used = this.apiCreditsUsed > 0 ? this.apiCreditsUsed : 0;
    const remaining = this.apiCreditsLeft > 0 ? this.apiCreditsLeft : this.dailyLimit;
    const limit = used + remaining;

    const active = this.getActiveKeyInfo();

    return {
      limit,
      used,
      remaining: Math.max(0, remaining),
      resetTime,
      keyCount: active.keyCount,
      activeKeyIndex: active.activeKeyIndex,
      activeKeyLabel: active.activeKeyLabel,
      activeWindow: active.activeWindow,
      rotationMode: active.rotationMode,
    };
  }

  /**
   * 速率限制检查和等待
   * 确保每分钟不超过指定次数的请求
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();

    // 清理过期的请求记录（超过时间窗口的）
    this.rateLimitRequests = this.rateLimitRequests.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW
    );

    // 检查是否超过速率限制
    if (this.rateLimitRequests.length >= this.RATE_LIMIT_MAX_REQUESTS) {
      // 计算需要等待的时间（最早的请求过期时间）
      const oldestRequest = this.rateLimitRequests[0];
      const waitTime = oldestRequest + this.RATE_LIMIT_WINDOW - now;

      if (waitTime > 0) {
        logger.warn(`[Twelve Data] 速率限制：等待 ${Math.ceil(waitTime / 1000)} 秒`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // 等待后再次清理过期记录
        const afterWait = Date.now();
        this.rateLimitRequests = this.rateLimitRequests.filter(
          timestamp => afterWait - timestamp < this.RATE_LIMIT_WINDOW
        );
      }
    }

    // 记录当前请求时间
    this.rateLimitRequests.push(now);
    logger.debug(`[Twelve Data] 当前分钟请求次数: ${this.rateLimitRequests.length}/${this.RATE_LIMIT_MAX_REQUESTS}`);
  }

  /**
   * 从响应头提取并更新配额信息
   */
  private updateQuotaFromHeaders(headers: any): void {
    const creditsUsed = headers['api-credits-used'];
    const creditsLeft = headers['api-credits-left'];

    if (creditsUsed !== undefined) {
      this.apiCreditsUsed = parseInt(creditsUsed, 10);
      logger.debug(`[Twelve Data] 已使用额度: ${this.apiCreditsUsed}`);
    }

    if (creditsLeft !== undefined) {
      this.apiCreditsLeft = parseInt(creditsLeft, 10);
      logger.debug(`[Twelve Data] 剩余额度: ${this.apiCreditsLeft}`);
    }

    // 计算总限额
    if (creditsUsed !== undefined && creditsLeft !== undefined) {
      const total = parseInt(creditsUsed, 10) + parseInt(creditsLeft, 10);
      if (total > 0) {
        this.dailyLimit = total;
        logger.debug(`[Twelve Data] 总限额: ${this.dailyLimit}`);
      }
    }
  }

  /**
   * 获取K线数据
   * @param interval 时间周期 (1m, 5m, 15m, 1h, 4h, 1d)
   * @param limit 数据条数
   */
  async getCandles(interval: string = '1m', limit: number = 100): Promise<any[] | null> {
    try {
      const activeApiKey = this.getActiveApiKey();
      if (!activeApiKey) {
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

      const recentCandles = await this.getRecentCandles(symbol, intervalStr, limit);
      if (recentCandles.length > 0) {
        logger.info(`✅ [Twelve Data] 最近K线数据: ${recentCandles.length}条 for ${interval}`);
        this.candlesCache.set(cacheKey, { candles: recentCandles, timestamp: Date.now() });
        return recentCandles;
      }

      logger.warn('[Twelve Data] 最近K线为空，停止本次请求以保护API额度');
      return [];

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
          // 速率限制检查
          await this.waitForRateLimit();

          const response = await axios.get(`${this.baseUrl}/time_series`, {
            params: {
              symbol,
              interval: intervalStr,
              start_date: startStr,
              end_date: endStr,
              timezone: 'UTC',
              apikey: activeApiKey,
            },
            timeout: 30000,
          });

          // 从响应头提取配额信息
          this.updateQuotaFromHeaders(response.headers);

          if (response.data.status === 'error') {
            const quota = this.getRemainingQuota();
            logger.warn(`[Twelve Data] 第 ${day + 1} 天错误: ${response.data.message}`);
            logger.warn(`[Twelve Data] 配额状态: ${quota.used}/${quota.limit} 已使用, 剩余 ${quota.remaining}`);

            // 如果是429错误（超限），记录日志
            if (response.data.code === 429) {
              logger.error(`[Twelve Data] API配额已用完! 今日已使用 ${quota.used}/${quota.limit}`);
            }
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
        } catch (error: any) {
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
      // datetime 格式: "YYYY-MM-DD HH:MM:SS" (指定 timezone=UTC 后为 UTC 时间)

      const candles: any[] = [];

      logger.info(`[Twelve Data] 开始转换 ${allCandles.length} 条数据`);

      // 转换每根K线
      for (let i = 0; i < allCandles.length; i++) {
        const item = allCandles[i];
        const datetime = item.datetime;
        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const volume = parseFloat(item.volume || '0');

        // Twelve Data 在指定 timezone=UTC 后返回的是 UTC 时间
        // 需要加 'Z' 后缀让 JavaScript 正确解析为 UTC 时间
        const date = new Date(datetime + 'Z');
        const time = Math.floor(date.getTime() / 1000);

        candles.push({ time, open, high, low, close, volume });
      }

      // 按时间排序（升序）
      candles.sort((a, b) => a.time - b.time);

      // 如果数据超过 limit，只保留最后的 limit 条
      if (candles.length > limit) {
        candles.splice(0, candles.length - limit);
      }

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

  private async getRecentCandles(symbol: string, interval: string, limit: number): Promise<any[]> {
    try {
      const activeApiKey = this.getActiveApiKey();
      if (!activeApiKey) {
        throw new Error('Twelve Data API Key 未配置');
      }

      await this.waitForRateLimit();

      const response = await axios.get(`${this.baseUrl}/time_series`, {
        params: {
          symbol,
          interval,
          outputsize: Math.min(Math.max(limit, 1), 5000),
          timezone: 'UTC',
          apikey: activeApiKey,
        },
        timeout: 30000,
      });

      this.updateQuotaFromHeaders(response.headers);

      if (response.data.status === 'error') {
        logger.warn(`[Twelve Data] 最近K线请求错误: ${response.data.message}`);
        return [];
      }

      if (!response.data.values || !Array.isArray(response.data.values)) {
        logger.warn('[Twelve Data] 最近K线返回格式无效');
        return [];
      }

      return this.convertValuesToCandles(response.data.values, limit);
    } catch (error) {
      logger.warn('[Twelve Data] 最近K线请求失败，准备回退到按天获取:', error);
      return [];
    }
  }

  private convertValuesToCandles(values: any[], limit: number): any[] {
    const candles = values
      .map((item) => {
        const datetime = item.datetime;
        const open = parseFloat(item.open);
        const high = parseFloat(item.high);
        const low = parseFloat(item.low);
        const close = parseFloat(item.close);
        const volume = parseFloat(item.volume || '0');
        const date = new Date(`${datetime}Z`);
        const time = Math.floor(date.getTime() / 1000);

        return { time, open, high, low, close, volume };
      })
      .filter((item) => item.time && [item.open, item.high, item.low, item.close].every(Number.isFinite))
      .sort((a, b) => a.time - b.time);

    return candles.slice(-limit);
  }

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{ price: number; change: number; changePct: number; high: number; low: number } | null> {
    try {
      if (!this.getActiveApiKey()) {
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
   * 更新 API Key
   */
  updateApiKey(apiKey: string): void {
    this.updateApiKeys(apiKey ? [apiKey] : []);
    logger.info('[Twelve Data] API Key 已更新');
  }

  /**
   * 更新多个 API Key。2个及以上时按北京时间 0-12 / 12-24 自动切换前两个 Key。
   */
  updateApiKeys(apiKeys: string[]): void {
    this.apiKeys = apiKeys.map((key) => key.trim()).filter(Boolean);
    this.apiKey = this.getActiveKeyInfo().apiKey;
    this.dailyLimit = 800;
    this.apiCreditsUsed = 0;
    this.apiCreditsLeft = 800;
    this.lastResetDate = new Date().getDate();
    this.rateLimitRequests = [];
    this.clearCache();

    if (this.apiKeys.length >= 2) {
      const active = this.getActiveKeyInfo();
      logger.info(`[Twelve Data] API Keys 已更新，双 Key 12小时轮换启用，当前使用 ${active.activeKeyLabel}`);
    } else {
      logger.info('[Twelve Data] API Key 已更新');
    }
  }

  getApiKeyStatus(): Omit<ActiveApiKeyInfo, 'apiKey'> & { hasKey: boolean } {
    const active = this.getActiveKeyInfo();
    return {
      hasKey: !!active.apiKey,
      keyCount: active.keyCount,
      activeKeyIndex: active.activeKeyIndex,
      activeKeyLabel: active.activeKeyLabel,
      activeWindow: active.activeWindow,
      rotationMode: active.rotationMode,
    };
  }

  getConfiguredApiKeys(): string[] {
    return [...this.apiKeys];
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.getActiveApiKey()) {
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
