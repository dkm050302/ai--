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
const TRADING_ECONOMICS_CALENDAR_URL = 'https://tradingeconomics.com/calendar';
const EASTMONEY_FLASH_URL = 'https://kuaixun.eastmoney.com/index.html';
const EASTMONEY_FAST_NEWS_API = 'https://np-weblist.eastmoney.com/comm/web/getFastNewsList';
const EASTMONEY_ARTICLE_BASE_URL = 'https://finance.eastmoney.com/a/';

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
  /** 数据来源 */
  source?: string;
  /** 来源链接 */
  sourceUrl?: string;
}

/**
 * 市场快讯类型
 */
export interface MarketFlash {
  /** 日期 */
  date: string;
  /** 时间 */
  time: string;
  /** 内容 */
  content: string;
  /** 是否热门 */
  hot?: boolean;
  /** 数据来源 */
  source?: string;
  /** 来源链接 */
  sourceUrl?: string;
}

/**
 * 爬虫服务类
 */
class ScraperService {
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  private readonly TIMEOUT = 10000; // 10秒超时

  private formatDate(date: Date = new Date()): string {
    const formatter = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date).replace(/\//g, '-');
  }

  private normalizeDate(date: string = ''): string {
    if (!date) return this.formatDate();
    if (/^\d{8}$/.test(date)) {
      return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
    }
    return date;
  }

  /**
   * 获取经济日历数据（多数据源降级）
   * 优先级: Trading Economics 官方API(需Key) -> Trading Economics网页 -> 模拟不可用提示
   * @param date 日期格式: YYYYMMDD 或 YYYY-MM-DD
   */
  async getEconomicCalendar(date: string = ''): Promise<EconomicEvent[]> {
    if (TE_API_KEY && TE_API_KEY !== 'guest') {
      try {
        return await this.getTradingEconomicsApiCalendar(date);
      } catch (error) {
        logger.warn(`[Scraper] Trading Economics 官方API失败，尝试网页解析: ${error}`);
      }
    }

    // 尝试使用 Trading Economics API（免费有限访问）
    try {
      return await this.getTradingEconomicsCalendar(date);
    } catch (error) {
      logger.warn(`[Scraper] Trading Economics API 失败，使用模拟数据: ${error}`);
      return this.getMockEconomicEvents();
    }
  }

  /**
   * 使用 Trading Economics 官方结构化API获取经济日历。
   * guest:guest 已停止可用，所以只在配置真实 Key 后启用。
   */
  private async getTradingEconomicsApiCalendar(date: string = ''): Promise<EconomicEvent[]> {
    const normalizedDate = this.normalizeDate(date);
    const endDate = new Date(`${normalizedDate}T00:00:00+08:00`);
    endDate.setDate(endDate.getDate() + 7);
    const endDateText = this.formatDate(endDate);

    const response = await axios.get(`${TE_API_BASE}/calendar/country/united states`, {
      params: {
        c: TE_API_KEY,
        d1: normalizedDate,
        d2: endDateText,
      },
      headers: {
        'User-Agent': this.USER_AGENT,
        Accept: 'application/json',
      },
      timeout: this.TIMEOUT,
    });

    if (!Array.isArray(response.data)) {
      throw new Error('Trading Economics 官方API未返回数组');
    }

    const events = response.data
      .map((row: Record<string, unknown>) => this.mapTradingEconomicsApiRow(row))
      .filter((event): event is EconomicEvent => Boolean(event));

    if (events.length === 0) {
      throw new Error('Trading Economics 官方API没有可用经济日历');
    }

    logger.info(`[Scraper] Trading Economics 官方API: 成功获取 ${events.length} 条数据`);
    return events.slice(0, 80);
  }

  private mapTradingEconomicsApiRow(row: Record<string, unknown>): EconomicEvent | null {
    const event = this.stringifyField(row.Event);
    if (!event) return null;

    const dateValue = this.stringifyField(row.Date);
    const parsedDate = dateValue ? new Date(dateValue) : null;
    const hasValidDate = parsedDate && Number.isFinite(parsedDate.getTime());
    const date = hasValidDate ? this.formatDate(parsedDate) : this.formatDate();
    const time = hasValidDate
      ? new Intl.DateTimeFormat('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(parsedDate)
      : '00:00';

    return {
      date,
      time,
      country: this.stringifyField(row.Country) || 'United States',
      event,
      importance: this.normalizeImportance(row.Importance),
      actual: this.stringifyField(row.Actual) || undefined,
      forecast: this.stringifyField(row.Forecast) || undefined,
      previous: this.stringifyField(row.Previous) || undefined,
      source: 'Trading Economics',
      sourceUrl: TRADING_ECONOMICS_CALENDAR_URL,
    };
  }

  private stringifyField(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim();
  }

  private normalizeImportance(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 1;
    return Math.max(1, Math.min(5, Math.round(numeric)));
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
      const response = await axios.get(TRADING_ECONOMICS_CALENDAR_URL, {
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
              date: this.normalizeDate(date),
              time: time || '00:00',
              country,
              event,
              importance: Math.min(importance + 1, 5),
              actual: actual || undefined,
              forecast: forecast || undefined,
              previous: previous || undefined,
              source: 'Trading Economics',
              sourceUrl: TRADING_ECONOMICS_CALENDAR_URL,
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
   * 只返回不可用提示，避免把过时样例误当作真实日历。
   */
  private getMockEconomicEvents(): EconomicEvent[] {
    const dateStr = this.formatDate();

    return [
      {
        date: dateStr,
        time: '--:--',
        country: '系统',
        event: '实时经济日历暂不可用，点击查看 Trading Economics 日历源头',
        importance: 1,
        source: '模拟数据',
        sourceUrl: TRADING_ECONOMICS_CALENDAR_URL,
      },
    ];
  }

  /**
   * 获取东方财富市场快讯
   */
  async getMarketNews(): Promise<MarketFlash[]> {
    try {
      logger.info('[Scraper] 开始获取市场快讯');

      const apiFlashes = await this.getEastmoneyFastNewsByApi();
      if (apiFlashes.length > 0) {
        return apiFlashes;
      }

      const response = await axios.get(EASTMONEY_FLASH_URL, {
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
              const $link = $item.find('a').first();
              const content = $link.text().trim() || $item.text().trim();
              const href = $link.attr('href');
              let sourceUrl = EASTMONEY_FLASH_URL;
              if (href) {
                const parsedUrl = new URL(href, EASTMONEY_FLASH_URL);
                if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                  sourceUrl = parsedUrl.toString();
                }
              }

              // 检查是否热门（通过class或文字判断）
              const hot = $item.find('[class*="hot"], [class*="urgent"], [class*="important"]').length > 0 ||
                           content.includes('重要') || content.includes('突发');

              if (content && content.length > 5) {
                flashes.push({
                  date: this.formatDate(),
                  time,
                  content: content.substring(0, 100), // 限制长度
                  hot,
                  source: '东方财富快讯',
                  sourceUrl,
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

  private async getEastmoneyFastNewsByApi(): Promise<MarketFlash[]> {
    try {
      const response = await axios.get(EASTMONEY_FAST_NEWS_API, {
        params: {
          client: 'web',
          biz: 'web_724',
          fastColumn: '102',
          sortEnd: '',
          pageSize: 10,
          req_trace: Date.now().toString(),
        },
        headers: {
          'User-Agent': this.USER_AGENT,
          'Accept': 'application/json,text/plain,*/*',
          'Referer': EASTMONEY_FLASH_URL,
        },
        timeout: this.TIMEOUT,
      });

      const items = response.data?.data?.fastNewsList;
      if (!Array.isArray(items)) return [];

      const flashes: MarketFlash[] = items
        .map<MarketFlash | null>((item: any) => {
          const showTime = String(item.showTime || '');
          const date = showTime.slice(0, 10) || this.formatDate();
          const time = showTime.slice(11, 16) || this.formatTime(new Date());
          const code = String(item.code || '');
          const summary = this.cleanText(String(item.summary || item.title || ''));
          const sourceUrl = code ? `${EASTMONEY_ARTICLE_BASE_URL}${code}.html` : EASTMONEY_FLASH_URL;
          const hot = Number(item.titleColor || 0) > 0 ||
            summary.includes('重要') ||
            summary.includes('突发') ||
            summary.includes('涨幅') ||
            summary.includes('跌幅');

          if (!summary) return null;

          return {
            date,
            time,
            content: summary.substring(0, 180),
            hot,
            source: '东方财富快讯',
            sourceUrl,
          } satisfies MarketFlash;
        })
        .filter((item: MarketFlash | null): item is MarketFlash => item !== null);

      logger.info(`[Scraper] 东方财富API: 成功获取 ${flashes.length} 条快讯`);
      return flashes;
    } catch (error) {
      logger.warn(`[Scraper] 东方财富API获取快讯失败，尝试HTML降级: ${error}`);
      return [];
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
        date: this.formatDate(now),
        time,
        content: '实时市场快讯暂不可用，点击查看东方财富快讯源头',
        hot: false,
        source: '模拟数据',
        sourceUrl: EASTMONEY_FLASH_URL,
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

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

// 导出单例
export const scraperService = new ScraperService();
