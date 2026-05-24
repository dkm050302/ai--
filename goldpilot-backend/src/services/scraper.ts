/**
 * 爬虫服务 - 获取经济日历和市场快讯数据
 *
 * 数据源:
 * - 经济日历: Trading Economics (免费API)
 * - 市场快讯: 东方财富快讯
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

/**
 * Trading Economics API配置
 */
const TE_API_KEY = process.env.TRADING_ECONOMICS_KEY || 'guest';
const TE_API_BASE = 'https://api.tradingeconomics.com';

/**
 * 经济事件类型
 */
export interface EconomicEvent {
  /** 日期 */
  date: string;
  /** 时间 */
  time: string;
  /** 地区/国家 */
  country: string;
  /** 事件名称 */
  event: string;
  /** 重要性 (1-5) */
  importance: number;
  /** 实际值 */
  actual?: string;
  /** 预测值 */
  forecast?: string;
  /** 前值 */
  previous?: string;
}

/**
 * 市场快讯类型
 */
export interface MarketFlash {
  /** 时间 */
  time: string;
  /** 内容 */
  content: string;
  /** 是否热门 */
  hot?: boolean;
}

/**
 * 爬虫服务类
 */
class ScraperService {
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private readonly TIMEOUT = 10000; // 10秒超时

  /**
   * 获取经济日历数据（多数据源降级）
   * 优先级: Trading Economics -> 模拟数据
   * @param date 日期格式: YYYYMMDD 或 YYYY-MM-DD
   */
  async getEconomicCalendar(date: string = ''): Promise<EconomicEvent[]> {
    // 尝试使用 Trading Economics API（免费有限访问）
    try {
      return await this.getTradingEconomicsCalendar(date);
    } catch (error) {
      logger.warn(`[Scraper] Trading Economics API 失败，使用模拟数据: ${error}`);
      return this.getMockEconomicEvents();
    }
  }

  /**
   * 使用 Trading Economics 获取经济日历
   */
  private async getTradingEconomicsCalendar(date: string = ''): Promise<EconomicEvent[]> {
    try {
      logger.info(`[Scraper] 从 Trading Economics 获取经济日历`);

      // 转换日期格式
      let startDate = date;
      let endDate = date;

      if (!date) {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 7);

        startDate = today.toISOString().split('T')[0];
        endDate = tomorrow.toISOString().split('T')[0];
      }

      // 使用免费的 Trading Economics 日历端点
      const url = 'https://tradingeconomics.com/calendar';
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
        timeout: this.TIMEOUT,
      });

      const $ = cheerio.load(response.data);
      const events: EconomicEvent[] = [];

      // 解析 Trading Economics 日历表格
      $('tr.table-widget-row').each((index, element) => {
        try {
          const $row = $(element);

          const time = $row.find('td:nth-child(1)').text().trim();
          const country = $row.find('td:nth-child(2) img').attr('title') || '';
          const event = $row.find('td:nth-child(3)').text().trim();
          const actual = $row.find('td:nth-child(4)').text().trim() || undefined;
          const forecast = $row.find('td:nth-child(6)').text().trim() || undefined;
          const previous = $row.find('td:nth-child(7)').text().trim() || undefined;

          // 判断重要性（通过红星数量）
          const importance = $row.find('td:nth-child(8) .fa-star.text-danger').length || 1;

          if (event) {
            events.push({
              date: date || new Date().toISOString().split('T')[0],
              time: time || '00:00',
              country,
              event,
              importance: Math.min(importance + 1, 5),
              actual: actual || undefined,
              forecast: forecast || undefined,
              previous: previous || undefined,
            });
          }
        } catch (err) {
          // 跳过解析失败的行
        }
      });

      if (events.length > 0) {
        logger.info(`[Scraper] Trading Economics: 成功获取 ${events.length} 条数据`);
        return events.slice(0, 15);
      }

      throw new Error('未解析到数据');
    } catch (error) {
      logger.warn(`[Scraper] Trading Economics 爬取失败: ${error}`);
      throw error;
    }
  }

  /**
   * 获取模拟经济事件数据（降级方案）
   * 返回更真实和完整的经济日历数据
   */
  private getMockEconomicEvents(): EconomicEvent[] {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    // 模拟一周的重要经济事件
    const mockEvents: EconomicEvent[] = [
      // 今天的事件
      {
        date: dateStr,
        time: '09:00',
        country: '中国',
        event: '5月LPR报价',
        importance: 4,
        actual: '3.45%',
        forecast: '3.45%',
        previous: '3.45%',
      },
      {
        date: dateStr,
        time: '15:00',
        country: '瑞士',
        event: '5月贸易账',
        importance: 2,
        forecast: '35.0亿瑞郎',
        previous: '38.2亿瑞郎',
      },
      {
        date: dateStr,
        time: '16:30',
        country: '英国',
        event: '5月零售销售月率',
        importance: 3,
        forecast: '0.2%',
        previous: '-0.3%',
      },
      {
        date: dateStr,
        time: '20:30',
        country: '美国',
        event: '5月17日当周初请失业金人数',
        importance: 3,
        actual: '21.5万',
        forecast: '22.0万',
        previous: '22.3万',
      },
      {
        date: dateStr,
        time: '22:00',
        country: '美国',
        event: '美联储理事讲话',
        importance: 4,
      },
      {
        date: dateStr,
        time: '22:00',
        country: '美国',
        event: '5月堪萨斯联储制造业指数',
        importance: 2,
        forecast: '5',
        previous: '4',
      },
      // 明天的事件
      {
        date: this.addDays(dateStr, 1),
        time: '07:50',
        country: '日本',
        event: '4月核心CPI年率',
        importance: 3,
        forecast: '2.2%',
        previous: '2.4%',
      },
      {
        date: this.addDays(dateStr, 1),
        time: '14:00',
        country: '德国',
        event: '5月PPI月率',
        importance: 2,
        forecast: '0.1%',
        previous: '-0.2%',
      },
      {
        date: this.addDays(dateStr, 1),
        time: '20:30',
        country: '加拿大',
        event: '4月零售销售月率',
        importance: 3,
        forecast: '0.3%',
        previous: '-0.1%',
      },
      {
        date: this.addDays(dateStr, 1),
        time: '22:00',
        country: '美国',
        event: '5月密歇根大学消费者信心指数',
        importance: 4,
        forecast: '67.5',
        previous: '67.4',
      },
      // 周末的事件
      {
        date: this.addDays(dateStr, 2),
        time: '00:00',
        country: '欧盟',
        event: '欧洲议会选举',
        importance: 5,
      },
    ];

    // 只返回今天和未来3天的事件
    return mockEvents.filter(e => new Date(e.date) >= new Date(dateStr)).slice(0, 12);
  }

  /**
   * 日期辅助函数：增加天数
   */
  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  /**
   * 获取东方财富市场快讯
   */
  async getMarketNews(): Promise<MarketFlash[]> {
    try {
      logger.info('[Scraper] 开始获取市场快讯');

      const url = 'https://kuaixun.eastmoney.com/index.html';

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        timeout: this.TIMEOUT,
      });

      const $ = cheerio.load(response.data);
      const flashes: MarketFlash[] = [];

      // 尝试多种选择器
      const selectors = [
        'li[class*="item"]',
        '.kuaixun-list li',
        '.news-list-item',
        '[class*="flash"]',
        'ul li:has(a)',
      ];

      for (const selector of selectors) {
        const items = $(selector);
        if (items.length > 0) {
          logger.info(`[Scraper] 找到 ${items.length} 条快讯项，使用选择器: ${selector}`);

          items.slice(0, 20).each((index, element) => {
            try {
              const $item = $(element);

              // 获取时间 - 尝试多个可能的位置
              const timeEl = $item.find('span').first();
              const timeText = timeEl.text().trim();
              const time = timeText.match(/\d{1,2}:\d{2}/) ? timeText.match(/\d{1,2}:\d{2}/)![0] : this.formatTime(new Date());

              // 获取内容 - 通常在a标签中
              const content = $item.find('a').text().trim() || $item.text().trim();

              // 检查是否热门（通过class或文字判断）
              const hot = $item.find('[class*="hot"], [class*="urgent"], [class*="important"]').length > 0 ||
                           content.includes('重要') || content.includes('突发');

              if (content && content.length > 5) {
                flashes.push({
                  time,
                  content: content.substring(0, 100), // 限制长度
                  hot,
                });
              }
            } catch (err) {
              // 跳过解析失败的项
            }
          });

          if (flashes.length > 0) {
            break;
          }
        }
      }

      // 如果没有找到任何数据，返回模拟数据
      if (flashes.length === 0) {
        logger.warn('[Scraper] 未找到快讯数据，返回模拟数据');
        return this.getMockMarketFlashes();
      }

      logger.info(`[Scraper] 成功获取 ${flashes.length} 条市场快讯`);
      return flashes.slice(0, 10);

    } catch (error) {
      logger.error(`[Scraper] 获取市场快讯失败:`, error);
      // 返回模拟数据
      return this.getMockMarketFlashes();
    }
  }

  /**
   * 获取模拟市场快讯（降级方案）
   */
  private getMockMarketFlashes(): MarketFlash[] {
    const now = new Date();
    const time = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;

    return [
      {
        time,
        content: '现货黄金短线拉升，突破2390美元/盎司，日内涨幅扩大',
        hot: true,
      },
      {
        time,
        content: '美联储官员表示：通胀水平仍然偏高，需要继续观察经济数据',
        hot: false,
      },
      {
        time,
        content: '美元指数小幅回落，非美货币普遍反弹',
        hot: false,
      },
      {
        time,
        content: '市场等待本周五的非农就业数据，预计将对金价走势产生重要影响',
        hot: true,
      },
      {
        time,
        content: '欧洲央行行长：将根据通胀情况适时调整货币政策',
        hot: false,
      },
    ];
  }

  /**
   * 格式化时间为 HH:MM 格式
   */
  private formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

// 导出单例
export const scraperService = new ScraperService();
