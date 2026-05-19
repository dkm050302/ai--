import axios from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { API_CONFIG } from '@/utils/constants';
import { logger } from '@/utils/logger';
import type { Candle, PriceData, Signal, Account, DailyStats } from '@/types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface ExtendedAxiosRequestConfig extends InternalAxiosRequestConfig {
  metadata?: {
    startTime: number;
  };
}

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_CONFIG.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // 请求拦截器
    this.client.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        (config as ExtendedAxiosRequestConfig).metadata = { startTime };
        logger.debug(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.client.interceptors.response.use(
      (response: AxiosResponse) => {
        const duration = Date.now() - ((response.config as ExtendedAxiosRequestConfig).metadata?.startTime || Date.now());
        logger.api(
          response.config.method?.toUpperCase() || 'GET',
          response.config.url || '',
          response.status,
          duration
        );
        return response;
      },
      (error) => {
        const duration = Date.now() - ((error.config as ExtendedAxiosRequestConfig)?.metadata?.startTime || Date.now());
        logger.error(
          `[API Error] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || 'NETWORK_ERROR'} (${duration}ms)`
        );

        // 处理不同的错误状态码
        if (error.response) {
          // 服务器响应了错误状态码
          const status = error.response.status;
          if (status >= 500) {
            logger.error(`Server Error (${status}):`, error.response.data);
          } else if (status >= 400) {
            logger.warn(`Client Error (${status}):`, error.response.data);
          }
        } else if (error.request) {
          // 请求已发出但没有收到响应
          logger.error('Network Error - No response received');
        } else {
          // 请求配置出错
          logger.error('Request Config Error:', error.message);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 获取实时价格
   */
  async getPrice(): Promise<PriceData> {
    const response = await this.client.get<ApiResponse<PriceData>>('/api/price');

    if (response.data.success && response.data.data) {
      return response.data.data;
    }

    throw new Error(response.data.error?.message || '获取价格失败');
  }

  /**
   * 获取K线数据
   */
  async getCandles(period: string = '1m', limit: number = 100): Promise<Candle[]> {
    const response = await this.client.get<ApiResponse<{ candles: Candle[] }>>('/api/candles', {
      params: { period, limit },
    });

    if (response.data.success && response.data.data?.candles) {
      return response.data.data.candles;
    }

    throw new Error(response.data.error?.message || '获取K线数据失败');
  }

  /**
   * 获取信号列表
   */
  async getSignals(date?: string): Promise<Signal[]> {
    const response = await this.client.get<ApiResponse<{ signals: Signal[] }>>('/api/signals', {
      params: date ? { date } : {},
    });

    if (response.data.success && response.data.data?.signals) {
      return response.data.data.signals;
    }

    throw new Error(response.data.error?.message || '获取信号列表失败');
  }

  /**
   * 获取今日统计
   */
  async getTodayStats(): Promise<DailyStats> {
    const response = await this.client.get<ApiResponse<DailyStats>>('/api/stats/today');

    if (response.data.success && response.data.data) {
      return response.data.data;
    }

    throw new Error(response.data.error?.message || '获取今日统计失败');
  }

  /**
   * 获取账户信息
   */
  async getAccount(): Promise<Account> {
    const response = await this.client.get<ApiResponse<Account>>('/api/account');

    if (response.data.success && response.data.data) {
      return response.data.data;
    }

    throw new Error(response.data.error?.message || '获取账户信息失败');
  }
}

// 导出单例
export const api = new ApiService();
