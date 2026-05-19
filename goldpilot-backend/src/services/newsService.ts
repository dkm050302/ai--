import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import type { NewsItem } from '../types';
import { logger } from '../utils';

const TZ_OFFSET = 8 * 3600000; // UTC+8 毫秒偏移

class NewsService {
  private parser = new XMLParser({ ignoreAttributes: false });
  private cache = new Map<string, { data: NewsItem[]; ts: number }>();
  private CACHE_TTL = 60000; // 60秒缓存

  // RSS 源配置
  private readonly GOLD_RSS = [
    'https://news.google.com/rss/search?q=%E9%BB%84%E9%87%91+%E4%BB%B7%E6%A0%BC&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans',
    'https://news.google.com/rss/search?q=gold+price+XAUUSD&hl=en-US&gl=US&ceid=US%3Aen',
  ];
  private readonly ECON_RSS = 'https://news.google.com/rss/search?q=%E7%BE%8E%E5%9B%BD+%E7%BB%8F%E6%B5%8E&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans';
  private readonly FED_RSS = 'https://news.google.com/rss/search?q=%E7%BE%8E%E8%81%94%E5%82%A8+%E5%88%A9%E7%8E%87&hl=zh-CN&gl=CN&ceid=CN%3Azh-Hans';

  async fetchGoldNews(): Promise<NewsItem[]> {
    // 尝试中文源，失败用英文源
    for (const url of this.GOLD_RSS) {
      const items = await this.fetchRss(url);
      if (items.length > 0) return items;
    }
    return [];
  }

  async fetchEconNews(): Promise<NewsItem[]> {
    return this.fetchRss(this.ECON_RSS);
  }

  async fetchFedNews(): Promise<NewsItem[]> {
    return this.fetchRss(this.FED_RSS);
  }

  private async fetchRss(rssUrl: string): Promise<NewsItem[]> {
    // 检查缓存
    const cached = this.cache.get(rssUrl);
    if (cached && Date.now() - cached.ts < this.CACHE_TTL) {
      return cached.data;
    }

    try {
      const resp = await axios.get(rssUrl, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GoldPilot/1.0)' },
      });

      const xml = resp.data;
      if (!xml || typeof xml !== 'string' || !xml.includes('<item>')) {
        return cached?.data ?? [];
      }

      const items = this.parseXml(xml);
      if (items.length > 0) {
        this.cache.set(rssUrl, { data: items, ts: Date.now() });
        logger.info(`[News] RSS fetched: ${items.length} items from ${rssUrl.split('?')[0]}`);
      }
      return items;
    } catch (err: any) {
      logger.warn(`[News] RSS fetch failed: ${err.message}`);
      return cached?.data ?? [];
    }
  }

  private parseXml(xml: string): NewsItem[] {
    try {
      const parsed = this.parser.parse(xml);
      const channel = parsed?.rss?.channel;
      if (!channel) return [];

      // 确保 items 是数组
      let items = channel.item;
      if (!items) return [];
      if (!Array.isArray(items)) items = [items];

      return items.slice(0, 20).map((item: any, i: number) => {
        // 解析时间 -> UTC+8
        let timeStr = '';
        try {
          const pubDate = new Date(item.pubDate);
          if (!isNaN(pubDate.getTime())) {
            const cn = new Date(pubDate.getTime() + pubDate.getTimezoneOffset() * 60000 + TZ_OFFSET);
            const mon = String(cn.getMonth() + 1).padStart(2, '0');
            const day = String(cn.getDate()).padStart(2, '0');
            const h = String(cn.getHours()).padStart(2, '0');
            const m = String(cn.getMinutes()).padStart(2, '0');
            timeStr = `${mon}/${day} ${h}:${m}`;
          }
        } catch { /* keep empty */ }

        // 标题拆分来源: "标题 - 来源"
        let title = String(item.title || '');
        let source = String(item.source?.['#text'] || item.source || '');
        const dashIdx = title.lastIndexOf(' - ');
        if (dashIdx > 0) {
          source = title.slice(dashIdx + 3).trim();
          title = title.slice(0, dashIdx).trim();
        }

        return {
          time: timeStr,
          title,
          url: String(item.link || ''),
          source,
          hot: i < 5,
        };
      }).filter((n: NewsItem) => n.title);
    } catch (err: any) {
      logger.warn(`[News] XML parse failed: ${err.message}`);
      return [];
    }
  }
}

export const newsService = new NewsService();
