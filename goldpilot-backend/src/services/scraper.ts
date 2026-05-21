/**
 * 爬虫服务 - 获取经济日历和市场快讯数据
 *
 * 数据源:
 * - 经济日历: Investing.com财经日历
 * - 市场快讯: 东方财富快讯
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';

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
   * 获取Investing.com经济日历数据
   * @param date 日期格式: YYYYMMDD 或 YYYY-MM-DD
   */
  async getEconomicCalendar(date: string = ''): Promise<EconomicEvent[]> {
    try {
      logger.info(`[Scraper] 开始获取经济日历数据: ${date || '今天'}`);

      // Investing.com经济日历URL
      const url = 'https://cn.investing.com/economic-calendar/';
      const params = date ? `?date=${date}` : '';

      const response = await axios.get(url + params, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://cn.investing.com/',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
        },
        timeout: this.TIMEOUT,
      });

      const $ = cheerio.load(response.data);
      const events: EconomicEvent[] = [];

      // 解析经济日历表格 - 使用更通用的选择器
      // Investing.com使用动态类名，尝试多种选择器
      const tableRows = $('tr.js-event-item, tr[data-event-id], tr[id*="event"]');

      tableRows.each((index, element) => {
        try {
          const $row = $(element);

          // 获取时间
          const timeCell = $row.find('td:first, .js-event-time, [data-cell-id="time"]');
          const time = timeCell.text().trim() || '';

          // 获取日期（从data属性中获取）
          const fullDate = $row.attr('data-event-datetime') || '';

          // 获取重要性（通过图标判断）
          const bullIcon = $row.find('.bullishIcon, .grayFullBullishIcon, .sentiment-icon--bull, .sentiment-icon--bull--full');
          const importance = bullIcon.length + 1;

          // 获取国家/地区
          const flagCell = $row.find('.ceFlag, .flag, [class*="flag"]');
          const country = flagCell.attr('title') || flagCell.text().trim() || '';

          // 获取事件名称
          const eventCell = $row.find('.js-event-name, .event-name, a, [data-cell-id="name"]');
          const event = eventCell.text().trim();

          // 获取实际值、预测值、前值
          const actual = $row.find('#eventActual, [id*="actual"], [data-cell-id="actual"]').text().trim() || undefined;
          const forecast = $row.find('#eventForecast, [id*="forecast"], [data-cell-id="forecast"]').text().trim() || undefined;
          const previous = $row.find('#eventPrevious, [id*="previous"], [data-cell-id="previous"]').text().trim() || undefined;

          if (event && time) {
            events.push({
              date: fullDate || date,
              time,
              country,
              event,
              importance: Math.min(importance, 5),
              actual: actual || undefined,
              forecast: forecast || undefined,
              previous: previous || undefined,
            });
          }
        } catch (err) {
          logger.warn(`[Scraper] 解析单行事件失败: ${err}`);
        }
      });

      logger.info(`[Scraper] 成功获取 ${events.length} 条经济日历数据`);
      return events;

    } catch (error: any) {
      logger.error(`[Scraper] 获取经济日历失败:`, error.message);

      // 如果是403错误，Investing.com阻止了爬虫
      if (error.response?.status === 403) {
        logger.warn('[Scraper] Investing.com返回403，可能需要使用其他数据源');
        // 返回模拟数据作为降级方案
        return this.getMockEconomicEvents();
      }

      return [];
    }
  }

  /**
   * 获取模拟经济事件数据（降级方案）
   */
  private getMockEconomicEvents(): EconomicEvent[] {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    return [
      {
        date: dateStr,
        time: '20:30',
        country: '美国',
        event: '当周初请失业金人数',
        importance: 3,
        actual: '21.5万',
        forecast: '22万',
        previous: '22.3万',
      },
      {
        date: dateStr,
        time: '22:00',
        country: '美国',
        event: '美联储主席讲话',
        importance: 4,
      },
      {
        date: dateStr,
        time: '23:00',
        country: '欧元区',
        event: '欧洲央行利率决议',
        importance: 5,
        forecast: '4.25%',
        previous: '4.00%',
      },
    ];
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
