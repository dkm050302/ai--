import type { Request, Response } from 'express';
import { marketDataService, DataSource } from '../services/marketData';
import { twelveDataService } from '../services/twelveData';
import { logger } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

// 刷新间隔存储（内存中，重启后重置）
let refreshInterval: '1m' | '5m' | '10m' | 'never' = 'never';
let lastRefreshTime = Date.now();

// Twelve Data API Key 存储文件路径
const API_KEY_FILE = path.join(process.cwd(), '.twelvedata-apikey');

/**
 * 获取当前数据源
 */
export async function getDataSource(req: Request, res: Response): Promise<void> {
  try {
    const currentSource = marketDataService.getDataSource();

    res.json({
      success: true,
      data: {
        currentSource,
      },
    });
  } catch (error) {
    logger.error('Error getting data source:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DATASOURCE_ERROR',
        message: 'Failed to get data source',
      },
    });
  }
}

/**
 * 设置数据源
 */
export async function setDataSource(req: Request, res: Response): Promise<void> {
  try {
    const { source } = req.body;

    // 验证数据源
    const validSources: DataSource[] = ['mock', 'twelvedata'];
    if (!validSources.includes(source)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATASOURCE',
          message: `Invalid data source. Must be one of: ${validSources.join(', ')}`,
        },
      });
      return;
    }

    // 设置数据源
    marketDataService.setDataSource(source);

    logger.info(`Data source changed to: ${source}`);

    res.json({
      success: true,
      data: {
        currentSource: source,
      },
    });
  } catch (error) {
    logger.error('Error setting data source:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SET_DATASOURCE_ERROR',
        message: 'Failed to set data source',
      },
    });
  }
}

/**
 * 获取可用的数据源列表
 */
export async function getDataSources(req: Request, res: Response): Promise<void> {
  try {
    const dataSources = [
      {
        id: 'mock',
        name: '模拟数据',
        description: '使用模拟数据进行演示',
        enabled: true,
      },
      {
        id: 'twelvedata',
        name: 'Twelve Data',
        description: '使用Twelve Data API获取的黄金K线数据（需配置API Key）',
        enabled: true,
      },
    ];

    res.json({
      success: true,
      data: {
        dataSources,
      },
    });
  } catch (error) {
    logger.error('Error getting data sources:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_DATASOURCES_ERROR',
        message: 'Failed to get data sources',
      },
    });
  }
}

/**
 * 获取刷新间隔
 */
export async function getRefreshInterval(req: Request, res: Response): Promise<void> {
  try {
    res.json({
      success: true,
      data: {
        interval: refreshInterval,
        lastRefreshTime,
      },
    });
  } catch (error) {
    logger.error('Error getting refresh interval:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_REFRESH_INTERVAL_ERROR',
        message: 'Failed to get refresh interval',
      },
    });
  }
}

/**
 * 设置刷新间隔
 */
export async function setRefreshInterval(req: Request, res: Response): Promise<void> {
  try {
    const { interval } = req.body;

    const validIntervals = ['1m', '5m', '10m', 'never'];
    if (!validIntervals.includes(interval)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INTERVAL',
          message: `Invalid interval. Must be one of: ${validIntervals.join(', ')}`,
        },
      });
      return;
    }

    refreshInterval = interval as '1m' | '5m' | '10m' | 'never';
    logger.info(`Refresh interval set to: ${interval}`);

    res.json({
      success: true,
      data: {
        interval: refreshInterval,
      },
    });
  } catch (error) {
    logger.error('Error setting refresh interval:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SET_REFRESH_INTERVAL_ERROR',
        message: 'Failed to set refresh interval',
      },
    });
  }
}

/**
 * 手动刷新数据源
 */
export async function refreshDataSource(req: Request, res: Response): Promise<void> {
  try {
    // 清除缓存
    marketDataService.clearCache();

    lastRefreshTime = Date.now();
    logger.info('Data source cache cleared and refreshed');

    res.json({
      success: true,
      data: {
        lastRefreshTime,
      },
    });
  } catch (error) {
    logger.error('Error refreshing data source:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'REFRESH_DATASOURCE_ERROR',
        message: 'Failed to refresh data source',
      },
    });
  }
}

/**
 * 获取 Twelve Data API Key
 */
export async function getTwelveDataApiKey(req: Request, res: Response): Promise<void> {
  try {
    let apiKey = '';

    // 先尝试从环境变量读取
    if (process.env.TWELVEDATA_API_KEY) {
      apiKey = process.env.TWELVEDATA_API_KEY;
    }

    // 如果环境变量没有，尝试从文件读取
    if (!apiKey && fs.existsSync(API_KEY_FILE)) {
      apiKey = fs.readFileSync(API_KEY_FILE, 'utf-8').trim();
    }

    res.json({
      success: true,
      data: {
        apiKey: apiKey ? '••••••••' + apiKey.slice(-4) : '', // 只显示最后4位
        hasKey: !!apiKey,
      },
    });
  } catch (error) {
    logger.error('Error getting Twelve Data API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_APIKEY_ERROR',
        message: 'Failed to get API key',
      },
    });
  }
}

/**
 * 保存 Twelve Data API Key
 */
export async function saveTwelveDataApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APIKEY',
          message: 'API Key is required',
        },
      });
      return;
    }

    // 保存到文件
    fs.writeFileSync(API_KEY_FILE, apiKey.trim(), { mode: 0o600 });

    // 更新环境变量（当前进程）
    process.env.TWELVEDATA_API_KEY = apiKey.trim();

    // 更新 twelveDataService 的 API Key
    twelveDataService.updateApiKey(apiKey.trim());

    // 清除缓存，使用新 API Key
    twelveDataService.clearCache();

    logger.info('Twelve Data API Key saved');

    res.json({
      success: true,
      data: {
        message: 'API Key saved successfully',
      },
    });
  } catch (error) {
    logger.error('Error saving Twelve Data API key:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'SAVE_APIKEY_ERROR',
        message: 'Failed to save API key',
      },
    });
  }
}

/**
 * 测试 Twelve Data API Key
 */
export async function testTwelveDataApiKey(req: Request, res: Response): Promise<void> {
  try {
    const { apiKey } = req.body;

    if (!apiKey || typeof apiKey !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APIKEY',
          message: 'API Key is required',
        },
      });
      return;
    }

    // 临时设置 API Key 进行测试
    const originalKey = process.env.TWELVEDATA_API_KEY;
    process.env.TWELVEDATA_API_KEY = apiKey.trim();

    try {
      // 尝试获取一条数据来验证 API Key
      const testResult = await twelveDataService.getCandles('1day', 1);

      // 恢复原始 API Key
      if (originalKey) {
        process.env.TWELVEDATA_API_KEY = originalKey;
      } else {
        delete process.env.TWELVEDATA_API_KEY;
      }

      if (testResult && testResult.length > 0) {
        logger.info('Twelve Data API Key test successful');
        res.json({
          success: true,
          data: {
            message: 'API Key is valid',
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_APIKEY',
            message: 'API Key validation failed: no data returned',
          },
        });
      }
    } catch (testError: any) {
      // 恢复原始 API Key
      if (originalKey) {
        process.env.TWELVEDATA_API_KEY = originalKey;
      } else {
        delete process.env.TWELVEDATA_API_KEY;
      }

      throw testError;
    }
  } catch (error: any) {
    logger.error('Error testing Twelve Data API key:', error);
    res.status(400).json({
      success: false,
      error: {
        code: 'TEST_APIKEY_ERROR',
        message: error.message || 'API Key test failed',
      },
    });
  }
}

/**
 * 获取 Twelve Data 配额信息
 */
export async function getTwelveDataQuota(req: Request, res: Response): Promise<void> {
  try {
    const quota = twelveDataService.getRemainingQuota();

    res.json({
      success: true,
      data: {
        limit: quota.limit,
        used: quota.used,
        remaining: quota.remaining,
        resetTime: quota.resetTime,
      },
    });
  } catch (error) {
    logger.error('Error getting Twelve Data quota:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'GET_QUOTA_ERROR',
        message: 'Failed to get quota information',
      },
    });
  }
}
