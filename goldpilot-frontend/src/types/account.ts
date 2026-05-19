import type { Account } from './index';

/**
 * 创建默认账户数据
 */
export function createDefaultAccountData(): Account {
  return {
    accountId: '27238218',
    server: 'VTMarkets-Live 8',
    balance: 125000,
    equity: 127180,
    margin: 38750,
    freeMargin: 86430,
    positions: [
      { symbol: 'XAU/USD', volume: 3.2, type: 'buy', profit: 2180 },
    ],
    dailyPnl: 2180,
    riskUsed: 31,
  };
}
