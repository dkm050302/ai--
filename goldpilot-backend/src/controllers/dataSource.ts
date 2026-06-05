import type { Request, Response } from 'express';
import { marketDataService, DataSource } from '../services/marketData';
import { twelveDataService } from '../services/twelveData';
import { logger } from '../utils';
import * as fs from 'fs';
import * as path from 'path';

type RefreshInterval = '1m' | '5m' | '10m' | 'never';

interface DataSourceSettings {
  source?: DataSource;
  refreshInterval?: RefreshInterval;
}

const VALID_SOURCES: DataSource[] = ['mock', 'twelvedata'];
const VALID_INTERVALS: RefreshInterval[] = ['1m', '5m', '10m', 'never'];

// Twelve Data API Key 存储文件路径
const API_KEY_FILE = path.join(process.cwd(), '.twelvedata-apikey');
const API_KEYS_FILE = path.join(process.cwd(), '.twelvedata-apikeys');
const SETTINGS_FILE = path.join(process.cwd(), '.datasource-settings.json');

function parseApiKeys(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((key) => key.trim())
    .filter(Boolean);
}

function readApiKeysFile(filePath: string): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((key) => String(key).trim()).filter(Boolean);
    }
  } catch {
    // 兼容换行/逗号/分号分隔的纯文本。
  }

  return parseApiKeys(raw);
}

function maskApiKey(apiKey: string): string {
  if (!apiKey) {
    return '';
  }

  if (apiKey.length <= 8) {
    return '••••';
  }

  return `••••••••${apiKey.slice(-4)}`;
}

function readSettings(): DataSourceSettings {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) {
      return {};
    }

    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as DataSourceSettings;
    return {
      source: parsed.source && VALID_SOURCES.includes(parsed.source) ? parsed.source : undefined,
      refreshInterval: parsed.refreshInterval && VALID_INTERVALS.includes(parsed.refreshInterval)
        ? parsed.refreshInterval
        : undefined,
    };
  } catch (error) {
    logger.warn('[数据源] 读取本地设置失败，将使用默认设置:', error);
    return {};
  }
}

function saveSettings(nextSettings: DataSourceSettings): void {
  const current = readSettings();
  const settings: DataSourceSettings = {
    ...current,
    ...nextSettings,
  };

  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), { mode: 0o600 });
}

const savedSettings = readSettings();

if (savedSettings.source) {
  marketDataService.setDataSource(savedSettings.source);
}

let refreshInterval: RefreshInterval = savedSettings.refreshInterval || 'never';
let lastRefreshTime = Date.now();

function getStoredTwelveDataApiKeys(): string[] {
  const envMulti = process.env.TWELVEDATA_API_KEYS || process.env.TWELVE_DATA_API_KEYS || '';
  if (envMulti.trim()) {
    return parseApiKeys(envMulti);
  }

  const envSingle = process.env.TWELVEDATA_API_KEY || process.env.TWELVE_DATA_API_KEY || '';
  if (envSingle.trim()) {
    return [envSingle.trim()];
  }

  const multiFileKeys = readApiKeysFile(API_KEYS_FILE);
  if (multiFileKeys.length > 0) {
    return multiFileKeys;
  }

  if (fs.existsSync(API_KEY_FILE)) {
    const singleKey = fs.readFileSync(API_KEY_FILE, 'utf-8').trim();
    return singleKey ? [singleKey] : [];
  }

  return [];
}

function getStoredTwelveDataApiKey(): string {
  return getStoredTwelveDataApiKeys()[0] || '';
}

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
    if (!VALID_SOURCES.includes(source)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_DATASOURCE',
          message: `Invalid data source. Must be one of: ${VALID_SOURCES.join(', ')}`,
        },
      });
      return;
    }

    // 设置数据源
    marketDataService.setDataSource(source);
    saveSettings({ source });

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

    if (!VALID_INTERVALS.includes(interval)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INTERVAL',
          message: `Invalid interval. Must be one of: ${VALID_INTERVALS.join(', ')}`,
        },
      });
      return;
    }

    refreshInterval = interval;
    saveSettings({ refreshInterval });
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
    const apiKeys = getStoredTwelveDataApiKeys();
    const status = twelveDataService.getApiKeyStatus();
    const activeKey = apiKeys[status.activeKeyIndex] || apiKeys[0] || '';
    const apiKeyLabel = apiKeys.length >= 2
      ? `${apiKeys.length} 个 Key（当前 ${status.activeKeyLabel}：${maskApiKey(activeKey)}）`
      : maskApiKey(activeKey);

    res.json({
      success: true,
      data: {
        apiKey: apiKeyLabel,
        hasKey: apiKeys.length > 0,
        keyCount: apiKeys.length,
        rotationMode: status.rotationMode,
        activeKeyIndex: status.activeKeyIndex,
        activeKeyLabel: status.activeKeyLabel,
        activeWindow: status.activeWindow,
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

    const apiKeys = parseApiKeys(apiKey);
    if (apiKeys.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APIKEY',
          message: 'API Key is required',
        },
      });
      return;
    }

    if (apiKeys.length >= 2) {
      fs.writeFileSync(API_KEYS_FILE, JSON.stringify(apiKeys, null, 2), { mode: 0o600 });
      if (fs.existsSync(API_KEY_FILE)) {
        fs.unlinkSync(API_KEY_FILE);
      }
      process.env.TWELVEDATA_API_KEYS = apiKeys.join(',');
      delete process.env.TWELVEDATA_API_KEY;
    } else {
      fs.writeFileSync(API_KEY_FILE, apiKeys[0], { mode: 0o600 });
      if (fs.existsSync(API_KEYS_FILE)) {
        fs.unlinkSync(API_KEYS_FILE);
      }
      process.env.TWELVEDATA_API_KEY = apiKeys[0];
      delete process.env.TWELVEDATA_API_KEYS;
    }

    // 更新 twelveDataService 的 API Keys
    twelveDataService.updateApiKeys(apiKeys);

    // 清除缓存，使用新 API Key
    twelveDataService.clearCache();

    logger.info(`Twelve Data API Key saved (${apiKeys.length} key${apiKeys.length > 1 ? 's' : ''})`);

    res.json({
      success: true,
      data: {
        message: 'API Key saved successfully',
        keyCount: apiKeys.length,
        rotationMode: apiKeys.length >= 2 ? 'split_12h' : 'single',
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
    const inputKeys = typeof apiKey === 'string' && apiKey.trim()
      ? parseApiKeys(apiKey)
      : [];
    const testKeys = inputKeys.length > 0 ? inputKeys : getStoredTwelveDataApiKeys();

    if (testKeys.length === 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_APIKEY',
          message: 'API Key is required',
        },
      });
      return;
    }

    const originalKeys = twelveDataService.getConfiguredApiKeys();

    try {
      for (let index = 0; index < testKeys.length; index += 1) {
        twelveDataService.updateApiKeys([testKeys[index]]);
        twelveDataService.clearCache();

        // 尝试获取一条数据来验证 API Key
        const testResult = await twelveDataService.getCandles('1day', 1);

        if (!testResult || testResult.length === 0) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_APIKEY',
              message: testKeys.length > 1
                ? `第 ${index + 1} 个 API Key 验证失败：未返回数据`
                : 'API Key validation failed: no data returned',
            },
          });
          return;
        }
      }

      logger.info(`Twelve Data API Key test successful (${testKeys.length} key${testKeys.length > 1 ? 's' : ''})`);
      res.json({
        success: true,
        data: {
          message: testKeys.length > 1 ? 'API Keys are valid' : 'API Key is valid',
          keyCount: testKeys.length,
        },
      });
    } catch (testError: any) {
      throw testError;
    } finally {
      twelveDataService.updateApiKeys(originalKeys);
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
        keyCount: quota.keyCount,
        activeKeyIndex: quota.activeKeyIndex,
        activeKeyLabel: quota.activeKeyLabel,
        activeWindow: quota.activeWindow,
        rotationMode: quota.rotationMode,
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
