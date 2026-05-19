/**
 * MetaAPI 路由
 * 提供MT4/MT5账户连接和行情数据
 */

import express from 'express';
import { metaApiService } from '../services/metaApi';
import { logger } from '../utils/logger';

const router = express.Router();

/**
 * 添加MT4/MT5账户
 */
router.post('/add-account', async (req, res) => {
  try {
    const { login, password, server, platform = 'mt4' } = req.body;

    if (!login || !password || !server) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FIELDS',
          message: 'Missing required fields: login, password, server',
        },
      });
    }

    await metaApiService.addAccount({
      login,
      password,
      server,
      platform,
    });

    res.json({
      success: true,
      message: 'Account added successfully',
    });
  } catch (error) {
    logger.error('Add account error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ADD_ACCOUNT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to add account',
      },
    });
  }
});

/**
 * 初始化MT4/MT5连接
 */
router.post('/connect', async (req, res) => {
  try {
    await metaApiService.initialize();

    if (metaApiService.isMetaApiConnected()) {
      res.json({
        success: true,
        message: 'Connected to MT4/MT5 successfully',
      });
    } else {
      res.json({
        success: false,
        message: 'Failed to connect, check credentials',
      });
    }
  } catch (error) {
    logger.error('MT4/MT5 connection error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CONNECTION_ERROR',
        message: error instanceof Error ? error.message : 'Connection failed',
      },
    });
  }
});

/**
 * 获取实时报价
 */
router.get('/quote', async (req, res) => {
  try {
    const { symbol = 'XAUUSD' } = req.query;

    const quote = await metaApiService.getQuote(symbol as string);

    if (!quote) {
      return res.json({
        success: false,
        error: {
          code: 'NOT_CONNECTED',
          message: 'Not connected to MT4/MT5',
        },
      });
    }

    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    logger.error('Quote fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'QUOTE_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch quote',
      },
    });
  }
});

/**
 * 获取K线数据
 */
router.get('/candles', async (req, res) => {
  try {
    const {
      symbol = 'XAUUSD',
      timeframe = 'M1',
      limit = '500',
    } = req.query;

    const candles = await metaApiService.getCandles(
      symbol as string,
      timeframe as string,
      parseInt(limit as string, 10)
    );

    res.json({
      success: true,
      data: { candles },
    });
  } catch (error) {
    logger.error('Candles fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'CANDLES_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch candles',
      },
    });
  }
});

/**
 * 获取账户信息
 */
router.get('/account', async (req, res) => {
  try {
    const accountInfo = await metaApiService.getAccountInfo();

    if (!accountInfo) {
      return res.json({
        success: false,
        error: {
          code: 'NOT_CONNECTED',
          message: 'Not connected to MT4/MT5',
        },
      });
    }

    res.json({
      success: true,
      data: accountInfo,
    });
  } catch (error) {
    logger.error('Account info fetch error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'ACCOUNT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch account info',
      },
    });
  }
});

/**
 * 断开连接
 */
router.post('/disconnect', async (req, res) => {
  try {
    await metaApiService.disconnect();

    res.json({
      success: true,
      message: 'Disconnected from MT4/MT5',
    });
  } catch (error) {
    logger.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'DISCONNECT_ERROR',
        message: error instanceof Error ? error.message : 'Failed to disconnect',
      },
    });
  }
});

export default router;
