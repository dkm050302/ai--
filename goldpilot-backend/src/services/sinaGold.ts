/**
 * 新浪黄金数据服务
 * 获取实时黄金价格数据
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils';

class SinaGoldService {
  private readonly goldApiUrl = 'https://hq.sinajs.cn/list=hf_GC';
  private readonly fallbackUrl = 'https://finance.sina.com.cn/futuremarket/goldsilver.shtml';

  /**
   * 获取实时价格（通过新浪国际黄金期货API）
   */
  async getRealTimePrice(): Promise<{
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  } | null> {
    try {
      // 方法1：尝试获取新浪国际黄金期货数据
      const result = await this.getSinaGoldPrice();
      if (result) {
        return result;
      }

      // 方法2：爬取新浪财经页面
      return await this.scrapeSinaGoldPage();
    } catch (error) {
      logger.error('[新浪黄金] 获取价格失败:', error);
      return null;
    }
  }

  /**
   * 方法1：通过新浪API获取
   */
  private async getSinaGoldPrice(): Promise<{
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  } | null> {
    try {
      const response = await axios.get(this.goldApiUrl, {
        timeout: 10000,
        headers: {
          'Referer': 'https://finance.sina.com.cn',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      // 新浪返回格式: var hq_str_hf_GC="国际银,2385.5,2386.8,..."
      const data = response.data;
      const match = data.match(/var hq_str_hf_GC="([^"]+)"/);

      if (!match || !match[1]) {
        logger.warn('[新浪黄金] API返回数据格式不匹配');
        return null;
      }

      const parts = match[1].split(',');
      if (parts.length < 7) {
        logger.warn('[新浪黄金] 数据字段不足');
        return null;
      }

      // 解析新浪国际黄金期货数据
      // 格式: 当前价,,昨收,开盘,最高,最低,时间,...
      const price = parseFloat(parts[0]) || 0; // 当前价
      const prevClose = parseFloat(parts[2]) || price; // 昨收
      const high = parseFloat(parts[4]) || price; // 最高
      const low = parseFloat(parts[5]) || price; // 最低

      const change = price - prevClose;
      const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

      logger.info(`✅ [新浪黄金] 价格: ${price}, 涨跌: ${change.toFixed(2)}, 涨跌幅: ${changePct.toFixed(2)}%`);

      return { price, change, changePct, high, low };
    } catch (error) {
      logger.warn('[新浪黄金] API请求失败:', error);
      return null;
    }
  }

  /**
   * 方法2：爬取新浪财经页面
   */
  private async scrapeSinaGoldPage(): Promise<{
    price: number;
    change: number;
    changePct: number;
    high: number;
    low: number;
  } | null> {
    try {
      const response = await axios.get(this.fallbackUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const $ = cheerio.load(response.data);

      // 尝试从页面中提取黄金价格数据
      // 新浪财经页面结构可能变化，这里提供基本框架
      const priceText = $('.goldPrice').first().text().trim();
      const price = parseFloat(priceText.replace(/[^\d.]/g, '')) || 0;

      if (price > 0) {
        logger.info(`✅ [新浪黄金-页面] 价格: ${price}`);
        return {
          price,
          change: 0,
          changePct: 0,
          high: price,
          low: price,
        };
      }

      logger.warn('[新浪黄金] 页面未找到价格数据');
      return null;
    } catch (error) {
      logger.error('[新浪黄金] 页面抓取失败:', error);
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
