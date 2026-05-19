import type { Signal, DailyStats } from './index';

/**
 * 创建默认信号数据
 */
export function createDefaultSignals(): Signal[] {
  const now = new Date();
  return [
    {
      id: '1',
      timestamp: new Date(now.setHours(10, 23, 0, 0)),
      direction: 'long',
      entryPrice: 2380.50,
      exitPrice: 2388.50,
      profit: 320,
      status: 'profit',
      period: '1m',
      atr: 2.5,
    },
    {
      id: '2',
      timestamp: new Date(new Date().setHours(11, 45, 0, 0)),
      direction: 'short',
      entryPrice: 2390.00,
      exitPrice: 2385.00,
      profit: 280,
      status: 'profit',
      period: '1m',
      atr: 2.8,
    },
    {
      id: '3',
      timestamp: new Date(new Date().setHours(13, 12, 0, 0)),
      direction: 'long',
      entryPrice: 2382.00,
      exitPrice: 2378.00,
      profit: -150,
      status: 'loss',
      period: '1m',
      atr: 2.3,
    },
    {
      id: '4',
      timestamp: new Date(new Date().setHours(14, 30, 0, 0)),
      direction: 'short',
      entryPrice: 2388.50,
      status: 'pending',
      period: '1m',
      atr: 2.6,
    },
  ];
}

/**
 * 创建默认统计数据
 */
export function createDefaultDailyStats(): DailyStats {
  return {
    date: new Date(),
    signalCount: 8,
    winCount: 6,
    lossCount: 2,
    winRate: 75,
    totalProfit: 1850,
    totalLoss: 450,
    netProfit: 1400,
    upProb: 55,
    downProb: 45,
    risk: 50,
    riskLevel: 'medium',
    positionAdvice: 50,
    stopLoss: 2.5,
  };
}
