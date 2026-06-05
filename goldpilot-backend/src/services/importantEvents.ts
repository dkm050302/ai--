import { eventDataCacheService, EventDataMeta, EventDataSource } from './eventDataCache';
import { EconomicEvent } from './scraper';

export type ImportantCalendarCategory = 'data' | 'event';

export interface ImportantCalendarItem extends EconomicEvent {
  category: ImportantCalendarCategory;
  importanceLabel: string;
}

export interface ImportantSourceLink {
  name: string;
  url: string;
  note: string;
}

export interface ImportantEventsFilters {
  country: string;
  todayWindow: string;
  dataImportanceMin: number;
  eventImportanceMin: number;
  weekDays: number;
}

export interface ImportantEventsPayload {
  todayData: ImportantCalendarItem[];
  todayEvents: ImportantCalendarItem[];
  weekData: ImportantCalendarItem[];
  weekEvents: ImportantCalendarItem[];
  sourceLinks: ImportantSourceLink[];
  filters: ImportantEventsFilters;
}

interface CalendarFetchResult {
  events: EconomicEvent[];
  meta: EventDataMeta;
}

const WEEK_DAYS = 7;
const JIN10_CALENDAR_URL = 'https://rili.jin10.com';
const JIN10_EVENT_URL = 'https://rili.jin10.com/?tab=event';
const TRADING_ECONOMICS_CALENDAR_URL = 'https://tradingeconomics.com/calendar';

const EVENT_KEYWORDS = [
  '讲话',
  '发言',
  '致辞',
  '发表',
  '会议',
  '纪要',
  '听证',
  '票委',
  '主席',
  '理事',
  '官员',
  'FOMC',
  'FED',
  'SPEECH',
  'TESTIMONY',
  'MEETING',
  'MINUTES',
  'POWELL',
  '美联储',
  '白宫',
  '财长',
  '国会',
  '论坛',
  '峰会',
];

const DATA_KEYWORDS = [
  'CPI',
  'PPI',
  'PCE',
  'GDP',
  'PMI',
  'ISM',
  'ADP',
  'API',
  'EIA',
  '非农',
  '初请',
  '续请',
  '失业',
  '就业',
  '薪资',
  '零售',
  '耐用品',
  '订单',
  '库存',
  '消费者信心',
  '房屋',
  '营建',
  '贸易帐',
  '通胀',
  '工业产出',
  '新屋',
  '成屋',
];

function normalizeDate(date: string = ''): string {
  if (!date) return formatBeijingDate();
  if (/^\d{8}$/.test(date)) return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
  return date;
}

function parseBeijingDate(date: string): Date {
  return new Date(`${normalizeDate(date)}T00:00:00+08:00`);
}

function addDays(date: string, days: number): string {
  const next = parseBeijingDate(date);
  next.setDate(next.getDate() + days);
  return formatBeijingDate(next);
}

function formatBeijingDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date).replace(/\//g, '-');
}

function parseTimeMinutes(time: string): number | null {
  const text = (time || '').trim().replace(/\s+/g, ' ');
  if (!text || text.includes('--')) return null;

  const amPmMatch = text.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    const marker = amPmMatch[3].toUpperCase();
    if (marker === 'PM' && hour < 12) hour += 12;
    if (marker === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour < 24 && minute >= 0 && minute < 60) return hour * 60 + minute;
  }

  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function isUnitedStatesEvent(item: EconomicEvent): boolean {
  const country = `${item.country || ''}`.toLowerCase();
  const content = `${item.event || ''}`.toLowerCase();
  return country.includes('united states') ||
    country === 'us' ||
    country === 'usa' ||
    country.includes('u.s') ||
    item.country?.includes('美国') ||
    item.event?.includes('美国') ||
    item.event?.includes('美联储') ||
    content.includes('fomc');
}

function includesKeyword(content: string, keyword: string): boolean {
  if (/^[A-Z]+$/i.test(keyword)) {
    return content.toUpperCase().includes(keyword.toUpperCase());
  }
  return content.includes(keyword);
}

function classifyEvent(item: EconomicEvent): ImportantCalendarCategory {
  const content = `${item.country || ''} ${item.event || ''}`;
  if (EVENT_KEYWORDS.some((keyword) => includesKeyword(content, keyword))) return 'event';
  if (DATA_KEYWORDS.some((keyword) => includesKeyword(content, keyword))) return 'data';
  return 'data';
}

function isTradingWindowHour(item: EconomicEvent): boolean {
  const minutes = parseTimeMinutes(item.time);
  if (minutes === null) return false;
  return minutes >= 18 * 60 || minutes <= 5 * 60;
}

function isInTodayWindow(item: EconomicEvent, today: string): boolean {
  const minutes = parseTimeMinutes(item.time);
  if (minutes === null) return false;

  const itemDate = normalizeDate(item.date || today);
  const nextDate = addDays(today, 1);
  return (itemDate === today && minutes >= 18 * 60) ||
    (itemDate === nextDate && minutes <= 5 * 60);
}

function isWithinWeek(item: EconomicEvent, today: string): boolean {
  const itemDate = normalizeDate(item.date || today);
  const weekEnd = addDays(today, WEEK_DAYS - 1);
  return itemDate >= today && itemDate <= weekEnd;
}

function isImportant(item: EconomicEvent, category: ImportantCalendarCategory): boolean {
  const minImportance = category === 'data' ? 4 : 3;
  return item.importance >= minImportance;
}

function toImportantItem(item: EconomicEvent, category: ImportantCalendarCategory): ImportantCalendarItem {
  return {
    ...item,
    category,
    importanceLabel: '★'.repeat(Math.max(1, Math.min(5, item.importance))),
    sourceUrl: item.sourceUrl || getFallbackSourceUrl(item.source),
  };
}

function getFallbackSourceUrl(source?: string): string {
  if (source === 'Trading Economics') return TRADING_ECONOMICS_CALENDAR_URL;
  return JIN10_CALENDAR_URL;
}

function dedupeItems(items: ImportantCalendarItem[]): ImportantCalendarItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.date}|${item.time}|${item.event}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortByDateTime(a: EconomicEvent, b: EconomicEvent): number {
  return `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);
}

function isMockEvent(item: EconomicEvent): boolean {
  return item.source === '模拟数据';
}

function mergeMeta(results: CalendarFetchResult[]): EventDataMeta {
  const metas = results.map((result) => result.meta);
  const sourcePriority: EventDataSource[] = ['live', 'cache', 'mock'];
  const source = sourcePriority.find((candidate) => metas.some((meta) => meta.source === candidate)) || 'mock';
  const latestUpdatedAt = metas
    .map((meta) => meta.updatedAt)
    .sort()
    .at(-1) || new Date().toISOString();
  const firstMeta = metas[0];

  return {
    source,
    updatedAt: latestUpdatedAt,
    cacheFile: firstMeta?.cacheFile || '',
    stale: metas.some((meta) => meta.stale),
    message: source === 'mock'
      ? '没有可展示的真实重要日历，请打开源信息核对'
      : '已按美国、北京时间18:00-05:00和重要星级筛选',
  };
}

class ImportantEventsService {
  async getImportantEvents(date: string = ''): Promise<{ data: ImportantEventsPayload; meta: EventDataMeta }> {
    const today = normalizeDate(date);
    const calendarResult = await eventDataCacheService.getEconomicCalendar(today);
    const results: CalendarFetchResult[] = [{
      events: calendarResult.data,
      meta: calendarResult.meta,
    }];

    const rawItems = results
      .flatMap((result) => result.events)
      .filter((item) => !isMockEvent(item) && isUnitedStatesEvent(item));

    const importantItems = dedupeItems(
      rawItems
        .map((item) => {
          const category = classifyEvent(item);
          if (!isImportant(item, category)) return null;
          return toImportantItem(item, category);
        })
        .filter((item): item is ImportantCalendarItem => Boolean(item))
    ).sort(sortByDateTime);

    const todayData = importantItems
      .filter((item) => item.category === 'data' && isInTodayWindow(item, today))
      .slice(0, 6);
    const todayEvents = importantItems
      .filter((item) => item.category === 'event' && isInTodayWindow(item, today))
      .slice(0, 6);
    const weekData = importantItems
      .filter((item) => item.category === 'data' && isWithinWeek(item, today) && isTradingWindowHour(item))
      .slice(0, 12);
    const weekEvents = importantItems
      .filter((item) => item.category === 'event' && isWithinWeek(item, today) && isTradingWindowHour(item))
      .slice(0, 12);

    return {
      data: {
        todayData,
        todayEvents,
        weekData,
        weekEvents,
        sourceLinks: [
          { name: '金十财经日历', url: JIN10_CALENDAR_URL, note: '人工核对当天重要数据' },
          { name: '金十重要事件', url: JIN10_EVENT_URL, note: '人工核对当天重要事项' },
          { name: 'Trading Economics', url: TRADING_ECONOMICS_CALENDAR_URL, note: '当前缓存/抓取源' },
        ],
        filters: {
          country: '美国',
          todayWindow: '北京时间18:00-次日05:00',
          dataImportanceMin: 4,
          eventImportanceMin: 3,
          weekDays: WEEK_DAYS,
        },
      },
      meta: mergeMeta(results),
    };
  }
}

export const importantEventsService = new ImportantEventsService();
