import type { Request, Response } from 'express';
import { AccountModel } from '../models';
import type { Account } from '../types';

/**
 * 获取账户信息
 */
export async function getAccount(req: Request, res: Response): Promise<void> {
  try {
    // TODO: 从MetaAPI获取真实账户数据
    // 当前返回模拟数据
    const accountData: Account = {
      accountId: '27238218',
      server: 'VTMarkets-Live 8',
      balance: 125000,
      equity: 127180,
      margin: 38750,
      freeMargin: 86430,
      positions: [
        {
          symbol: 'XAU/USD',
          volume: 3.2,
          type: 'buy',
          profit: 2180,
        },
      ],
      dailyPnl: 2180,
      riskUsed: 31,
      updatedAt: new Date(),
    };

    res.json({
      success: true,
      data: accountData,
    });
  } catch (error) {
    console.error('Error fetching account:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACCOUNT_FETCH_ERROR',
        message: 'Failed to fetch account data',
      },
    });
  }
}
