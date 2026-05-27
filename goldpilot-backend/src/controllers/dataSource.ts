import type { Request, Response } from 'express';
import { marketDataService, DataSource } from '../services/marketData';
import { logger } from '../utils';

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
    const validSources: DataSource[] = ['mock', 'eastmoney', 'sina', 'stocksdk'];
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
        id: 'eastmoney',
        name: '东方财富',
        description: '来自东方财富网的实时黄金数据',
        enabled: true,
      },
      {
        id: 'sina',
        name: '新浪黄金',
        description: '来自新浪财经的实时黄金数据',
        enabled: true,
      },
      {
        id: 'stocksdk',
        name: 'Stock-sdk',
        description: '使用stock-sdk库获取的K线数据',
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
