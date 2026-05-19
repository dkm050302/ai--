// 市场数据类型
export interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  timestamp: Date;
  // 支撑压力位
  support1?: number;
  support2?: number;
  resistance1?: number;
}

// 信号类型
export type SignalDirection = 'long' | 'short';
export type SignalStatus = 'pending' | 'profit' | 'loss';
export type SignalPeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Signal {
  id: string;
  timestamp: Date;
  direction: SignalDirection;
  entryPrice: number;
  exitPrice?: number;
  takeProfit?: number;
  stopLoss?: number;
  profit?: number;
  status: SignalStatus;
  period: SignalPeriod;
  atr: number;
}

// 账户类型
export interface Account {
  accountId: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  positions: Position[];
  dailyPnl: number;
  riskUsed: number;
}

export interface Position {
  symbol: string;
  volume: number;
  type: 'buy' | 'sell';
  profit: number;
}

// 统计类型
export interface DailyStats {
  date: Date;
  signalCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
  // 概率和风险
  upProb?: number;
  downProb?: number;
  risk?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  positionAdvice?: number;
  stopLoss?: number;
}

// 事件类型
export interface Event {
  time: string;
  star: string;
  text: string;
}

export interface Flash {
  time: string;
  hot: boolean;
  text: string;
}

// API响应类型
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
