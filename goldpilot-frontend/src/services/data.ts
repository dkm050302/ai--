/**
 * 数据服务 - 经济事件和市场快讯API
 */

import { api } from './api';

/**
 * 经济事件类型
 */
export interface EconomicEvent {
  date: string;
  time: string;
  country: string;
  event: string;
  importance: number;
  actual?: string;
  forecast?: string;
  previous?: string;
}

/**
 * 市场快讯类型
 */
export interface MarketFlash {
  time: string;
  content: string;
  hot?: boolean;
}

/**
 * 数据API
 */
export const dataApi = {
  /**
   * 获取经济日历
   * @param date 日期格式: YYYY-MM-DD，不传则获取今天
   */
  getEconomicCalendar: (date?: string): Promise<{ success: boolean; data: EconomicEvent[] }> => {
    const params = date ? `?date=${date}` : '';
    return api.get(`/api/events/calendar${params}`);
  },

  /**
   * 获取市场快讯
   */
  getMarketNews: (): Promise<{ success: boolean; data: MarketFlash[] }> => {
    return api.get('/api/events/news');
  },
};
