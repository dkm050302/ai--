/**
 * API配置
 * 生产环境使用空字符串作为baseURL，通过Nginx代理
 */
export const API_CONFIG = {
  baseURL: import.meta.env.VITE_API_URL || '',
  wsURL: import.meta.env.VITE_WS_URL || (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host,
} as const;

/**
 * K线周期配置
 */
export const CHART_PERIODS = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '日线' },
] as const;

/**
 * 默认K线数量
 */
export const DEFAULT_CANDLE_COUNT = 100;

/**
 * 信号状态配置
 */
export const SIGNAL_STATUS = {
  pending: { label: '持仓中', color: 'blue' },
  profit: { label: '已止盈', color: 'green' },
  loss: { label: '已止损', color: 'red' },
} as const;

/**
 * 风险等级配置
 */
export const RISK_LEVELS = {
  low: { label: '低风险', threshold: 48, color: 'green' },
  medium: { label: '中风险', threshold: 70, color: 'amber' },
  high: { label: '高风险', threshold: 100, color: 'red' },
} as const;

/**
 * MT4测试账号
 */
export const MT4_TEST_ACCOUNT = {
  account: '27238218',
  server: 'VTMarkets-Live 8',
  password: 'Abc1234@',
} as const;
