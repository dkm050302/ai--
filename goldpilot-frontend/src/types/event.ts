import type { Event, Flash } from './index';

function todayText(): string {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\//g, '-');
}

/**
 * 创建默认事件数据
 */
export function createDefaultEvents(): Event[] {
  const date = todayText();
  return [
    {
      date,
      time: '--:--',
      star: '⭐',
      text: '实时经济日历加载中，点击查看 Trading Economics 日历源头',
      source: '模拟数据',
      sourceUrl: 'https://tradingeconomics.com/calendar',
    },
  ];
}

/**
 * 创建默认快讯数据
 */
export function createDefaultFlashes(): Flash[] {
  const date = todayText();
  return [
    {
      date,
      time: '--:--',
      hot: false,
      text: '实时市场快讯加载中，点击查看东方财富快讯源头',
      source: '模拟数据',
      sourceUrl: 'https://kuaixun.eastmoney.com/index.html',
    },
  ];
}
