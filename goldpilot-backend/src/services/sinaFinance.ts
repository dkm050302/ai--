/**
 * 新浪财经黄金数据爬虫服务
 * 爬取 https://finance.sina.com.cn/futures/quotes/XAU.shtml
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils';

interface SinaGoldPriceData {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  bid: number;
  ask: number;
  timestamp: Date;
}

interface SinaKlineData {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

class SinaFinanceScraper {
  private readonly baseUrl = 'https://finance.sina.com.cn/futures/quotes/XAU.shtml';
  private readonly apiBaseUrl = 'https://hq.sinajs.cn';

  /**
   * 爬取新浪财经网页获取完整数据
   */
  async scrapeWebPage(): Promise<SinaGoldPriceData | null> {
    try {
      logger.info('[新浪网页] 开始爬取页面...');

      const response = await axios.get(this.baseUrl, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });

      const $ = cheerio.load(response.data);

      // 方法1: 尝试从页面中提取数据表格
      const result: SinaGoldPriceData = {
        symbol: 'XAU/USD',
        name: '现货黄金',
        currentPrice: 0,
        change: 0,
        changePercent: 0,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        turnover: 0,
        bid: 0,
        ask: 0,
        timestamp: new Date(),
      };

      // 查找包含项目数值的数据行
      $('tr').each((_, element) => {
        const $row = $(element);
        const $cells = $row.find('td');

        if ($cells.length >= 2) {
          const label = $cells.eq(0).text().trim();
          const value = $cells.eq(1).text().trim();

          // 解析数值
          const numValue = parseFloat(value.replace(/[^0-9.-]/g, ''));

          switch(label) {
            case '最新价':
              result.currentPrice = numValue;
              break;
            case '涨跌额':
              result.change = numValue;
              break;
            case '涨跌幅':
              // 去掉百分号
              result.changePercent = parseFloat(value.replace(/[^0-9.-]/g, ''));
              break;
            case '开盘价':
              result.open = numValue;
              break;
            case '最高价':
              result.high = numValue;
              break;
            case '最低价':
              result.low = numValue;
              break;
            case '结算价':
              result.close = numValue;
              break;
            case '成交量':
              result.volume = numValue;
              break;
            case '买价（Bid）':
              result.bid = numValue;
              break;
            case '卖价（Ask）':
              result.ask = numValue;
              break;
          }
        }
      });

      // 验证数据
      if (result.currentPrice > 0) {
        logger.info(`✅ [新浪网页] 爬取成功: 最新价=${result.currentPrice}, 涨跌=${result.change}`);
        return result;
      } else {
        throw new Error('未能获取到有效价格数据');
      }

    } catch (error) {
      logger.error('[新浪网页] 爬取失败:', error);
      return null;
    }
  }

  /**
   * 使用新浪财经API获取期货数据
   * 尝试多个可能的黄金期货代码
   */
  async getFuturesData(): Promise<SinaGoldPriceData | null> {
    const symbols = [
      'GC0Y',     // COMEX黄金期货
      'GC=F',     // Yahoo格式的黄金期货
      'XAUUSD',   // 新浪外汇黄金
      'XAU=',     // 新浪黄金现货
      'hf_GC',    // 新浪国际黄金
    ];

    for (const symbol of symbols) {
      try {
        const data = await this.fetchSymbolData(symbol);
        if (data && data.currentPrice > 0) {
          logger.info(`✅ [新浪API] 获取成功 (${symbol}): ${data.currentPrice}`);
          return data;
        }
      } catch (error) {
        // 继续尝试下一个symbol
        continue;
      }
    }

    return null;
  }

  /**
   * 获取单个symbol的数据
   */
  private async fetchSymbolData(symbol: string): Promise<SinaGoldPriceData | null> {
    try {
      const url = `${this.apiBaseUrl}/list=${symbol}`;

      const response = await axios.get(url, {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.sina.com.cn/',
        },
      });

      const data = response.data;

      // 解析格式: var hq_str_SYMBOL="数据"
      const match = data.match(new RegExp(`var hq_str_${symbol.replace('=', '\\\\=')}="([^"]+)"`));

      if (!match || !match[1]) {
        // 尝试另一种格式
        const match2 = data.match(/var hq_str_[^=]+="([^"]+)"/);
        if (!match2 || !match2[1]) {
          throw new Error('无法解析数据格式');
        }
      }

      const parts = match[1].split(',');

      if (parts.length < 6) {
        throw new Error('数据格式异常');
      }

      // 新浪数据格式: 名称,当前价,昨收,今开,最高,最低,买一,卖一,成交量...
      const name = parts[0];
      const currentPrice = parseFloat(parts[1]) || 0;
      const prevClose = parseFloat(parts[2]) || 0;
      const open = parseFloat(parts[3]) || 0;
      const high = parseFloat(parts[4]) || 0;
      const low = parseFloat(parts[5]) || 0;
      const bid = parseFloat(parts[6]) || 0;
      const ask = parseFloat(parts[7]) || 0;
      const volume = parseFloat(parts[8]) || 0;

      if (currentPrice <= 0) {
        throw new Error('价格数据无效');
      }

      const change = currentPrice - prevClose;
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

      return {
        symbol: 'XAU/USD',
        name: name || '现货黄金',
        currentPrice,
        change,
        changePercent,
        open,
        high,
        low,
        close: prevClose,
        volume,
        turnover: 0,
        bid,
        ask,
        timestamp: new Date(),
      };

    } catch (error) {
      logger.debug(`[新浪API] ${symbol} 获取失败`);
      return null;
    }
  }

  /**
   * 从TradingView获取备用数据（免费）
   */
  async getTradingViewData(): Promise<SinaGoldPriceData | null> {
    try {
      // 使用一些免费的黄金价格API
      const response = await axios.get('https://api.metals.live/v1/spot/gold', {
        timeout: 8000,
        headers: {
          'User-Agent': 'Mozilla/5.0',
        },
      });

      if (response.data && response.data.price) {
        const price = parseFloat(response.data.price);

        return {
          symbol: 'XAU/USD',
          name: '现货黄金',
          currentPrice: price,
          change: 0,
          changePercent: 0,
          open: 0,
          high: 0,
          low: 0,
          close: 0,
          volume: 0,
          turnover: 0,
          bid: 0,
          ask: 0,
          timestamp: new Date(),
        };
      }

      return null;
    } catch (error) {
      logger.error('[TradingView] 获取失败:', error);
      return null;
    }
  }

  /**
   * 获取K线数据（分时、日K等）
   * @param period 周期: 1min, 5min, 15min, 30min, 60min, day, week, month
   * @param count 数据条数
   */
  async getKlineData(period: string = '1min', count: number = 500): Promise<SinaKlineData[]> {
    try {
      // 使用新浪的历史数据接口
      const periodMap: Record<string, string> = {
        '1m': '1min',
        '5m': '5min',
        '15m': '15min',
        '30m': '30min',
        '1h': '60min',
        '1d': 'day',
        '1w': 'week',
        '1M': 'month',
      };

      const sinaPeriod = periodMap[period] || '1min';

      // 新浪期货历史数据接口
      const url = `https://stock.finance.sina.com.cn/futures/api/jsonp.php/var%20_Gold${sinaPeriod}=/InnerFuturesNewService.getInnerFuturesDailyKLine?symbol=0&tab=`;

      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://finance.sina.com.cn/',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
      });

      // 解析JSONP响应
      const jsonpMatch = response.data.match(/var _Gold\d+=\s*(\[[\s\S]*\]);/);

      if (!jsonpMatch || !jsonpMatch[1]) {
        throw new Error('无法解析K线数据');
      }

      const klineData = JSON.parse(jsonpMatch[1]);

      if (!Array.isArray(klineData) || klineData.length === 0) {
        throw new Error('K线数据为空');
      }

      // 转换数据格式
      const candles: SinaKlineData[] = klineData
        .slice(-count)
        .map((item: any) => ({
          time: new Date(item.d || item.date),
          open: parseFloat(item.o || item.open),
          high: parseFloat(item.h || item.high),
          low: parseFloat(item.l || item.low),
          close: parseFloat(item.c || item.close),
          volume: parseFloat(item.v || item.volume) || 0,
        }))
        .filter((c: any) => !isNaN(c.close) && c.close > 0);

      logger.info(`✅ [新浪财经] K线数据: ${candles.length}条 (${period})`);
      return candles;

    } catch (error) {
      logger.error('[新浪财经] K线数据获取失败:', error);
      return [];
    }
  }

  /**
   * 获取完整的黄金数据（尝试多个数据源）
   */
  async getGoldData(): Promise<SinaGoldPriceData | null> {
    // 方案1: 优先爬取网页（最准确）
    let data = await this.scrapeWebPage();

    if (data && data.currentPrice > 0) {
      return data;
    }

    // 方案2: 尝试新浪API
    data = await this.getFuturesData();

    if (data && data.currentPrice > 0) {
      return data;
    }

    // 方案3: 使用TradingView备用
    data = await this.getTradingViewData();

    return data;
  }
}

export const sinaFinanceScraper = new SinaFinanceScraper();
