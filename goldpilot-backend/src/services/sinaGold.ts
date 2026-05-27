/**
 * 新浪黄金数据服务
 * 获取实时黄金价格数据
 */

import axios from 'axios';
import { logger } from '../utils';

class SinaGoldService {
  private readonly baseUrl = 'http://hq.sinajs.cn';
  private readonly symbol = 's_sh600001'; // 现货黄金代码

  /**
   * 获取实时价格
   */
  async getRealTimePrice(): Promise<{
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  } | null> {
    try {
      logger.info('[新浪黄金] 获取实时价格...');

      const response = await axios.get(
        `${this.baseUrl}/list=${this.symbol}`,
        {
          timeout: 10000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
        }
      );

      // 新浪接口返回的数据格式
      const data = response.data;
      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error('新浪API返回数据无效');
      }

      // 解析数据
      const item = data[0];
      if (!item) {
        throw new Error('新浪API未找到黄金数据');
      }

      const price = parseFloat(item[1]) || 0; // 当前价
      const change = parseFloat(item[2]) || 0; // 涨跌额
      const changePct = parseFloat(item[3]) || 0; // 涨跌幅%

      // 计算最高和最低（如果新浪没有提供，使用当前价）
      const high = parseFloat(item[4]) || price;
      const low = parseFloat(item[5]) || price;

      logger.info(`✅ [新浪黄金] 价格: ${price}, 涨跌: ${change}, 涨跌幅: ${changePct}%`);

      return {
        price,
        change,
        changePct,
        high,
        low,
      };
    } catch (error) {
      logger.error('[新浪黄金] 获取价格失败:', error);
      return null;
    }
  }

  /**
   * 获取K线数据（新浪暂不支持，返回空数组）
   */
  async getCandles(): Promise<any[]> {
    logger.warn('[新浪黄金] K线数据暂不支持');
    return [];
  }
}

// 导出单例
export const sinaGoldService = new SinaGoldService();
