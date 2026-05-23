import type { Request, Response } from 'express';
import { AccountModel } from '../models';
import type { Account } from '../types';
import { metaApiService } from '../services/metaApi';
import { logger } from '../utils/logger';

/**
 * 获取账户信息
 */
export async function getAccount(req: Request, res: Response): Promise<void> {
  try {
    // 尝试从 MetaAPI 获取真实账户数据
    if (metaApiService.isMetaApiConnected()) {
      logger.info('Fetching account data from MetaAPI...');
      const accountData = await metaApiService.getAccountInfo();

      if (accountData) {
        logger.info('✅ Account data fetched from MetaAPI successfully');
        res.json({
          success: true,
          data: {
            ...accountData,
            updatedAt: new Date(),
          },
        });
        return;
      }
    }

    // MetaAPI 未连接或获取失败，返回模拟数据
    logger.warn('MetaAPI not connected, using fallback data');

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
      isDemo: true, // 标记为模拟数据
    });
  } catch (error) {
    logger.error('Error fetching account:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACCOUNT_FETCH_ERROR',
        message: 'Failed to fetch account data',
      },
    });
  }
}
