/**
 * 格式化数字
 */
export function formatNumber(value: number, decimals: number = 2): string {
  return value.toFixed(decimals);
}

/**
 * 格式化货币
 */
export function formatMoney(value: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * 格式化日期
 */
export function formatDate(date: Date, format: string = 'YYYY-MM-DD'): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 格式化时间
 */
export function formatTime(date: Date): string {
  return formatDate(date, 'HH:mm');
}

/**
 * 获取今天的日期字符串
 */
export function getTodayString(): string {
  return formatDate(new Date(), 'YYYY/MM/DD');
}

/**
 * 价格颜色类名
 */
export function getPriceColorClass(value: number): string {
  if (value > 0) return 'text-green-500';
  if (value < 0) return 'text-red-500';
  return 'text-gray-500';
}

/**
 * 信号方向文本
 */
export function getSignalDirectionText(direction: 'long' | 'short'): string {
  return direction === 'long' ? '做多' : '做空';
}

/**
 * 信号方向颜色类名
 */
export function getSignalDirectionColor(direction: 'long' | 'short'): string {
  return direction === 'long' ? 'text-green-500' : 'text-red-500';
}
