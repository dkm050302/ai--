// K线数据类型
export interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

import { Types } from 'mongoose';

// 价格数据类型
export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  timestamp: Date;
}

// 信号类型
export type SignalDirection = 'long' | 'short';
export type SignalStatus = 'pending' | 'profit' | 'loss';
export type SignalPeriod = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export interface Signal {
  _id?: Types.ObjectId | string;
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
  _id?: string;
  accountId: string;
  server: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  positions: Position[];
  dailyPnl: number;
  riskUsed: number;
  updatedAt: Date;
}

export interface Position {
  symbol: string;
  volume: number;
  type: 'buy' | 'sell';
  profit: number;
}

// 统计类型
export interface DailyStats {
  _id?: string;
  date: Date;
  signalCount: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  totalProfit: number;
  totalLoss: number;
  netProfit: number;
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

// 新闻条目类型 (Google News RSS 解析结果)
export interface NewsItem {
  time: string;     // UTC+8 格式 "MM/DD HH:mm"
  title: string;
  url: string;
  source: string;
  hot: boolean;
}

// Yahoo Finance 行情数据
export interface YahooPriceData {
  price: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  change: number;
  changePct: number;
  timestamp: number; // Unix 秒
  candles: YahooCandle[];
}

export interface YahooCandle {
  time: number;     // Unix 毫秒
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
