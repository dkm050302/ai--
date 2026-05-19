/**
 * MetaAPI 集成服务
 * 连接MT4/MT5经纪商获取真实行情数据
 */

import MetaApi from 'metaapi.cloud-sdk';
import { logger } from '../utils/logger';

// MetaAPI配置
const META_API_TOKEN = process.env.METAAPI_TOKEN || '';
const ACCOUNT_ID = process.env.METAAPI_ACCOUNT || '27238218';

interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  spread: number;
  timestamp: Date;
}

class MetaApiService {
  private metaApi: any = null;
  private connection: any = null;
  private isConnected = false;

  /**
   * 初始化MetaAPI连接
   */
  async initialize(): Promise<void> {
    if (!META_API_TOKEN) {
      logger.warn('META_API_TOKEN not configured in .env');
      return;
    }

    try {
      logger.info('Initializing MetaAPI...');
      this.metaApi = new MetaApi(META_API_TOKEN);

      // 添加账户
      logger.info(`Connecting to account: ${ACCOUNT_ID}`);

      // 连接到账户
      this.connection = await this.metaApi.connect(ACCOUNT_ID);

      // 等待连接
      await this.connection.waitConnected();

      this.isConnected = true;
      logger.info('✅ MetaAPI connected successfully!');
      logger.info(`Account: ${ACCOUNT_ID}`);
    } catch (error: any) {
      logger.error('Failed to connect to MetaAPI:', error?.message || error);

      // 如果账户不存在，尝试添加
      if (error?.message?.includes('not found')) {
        logger.info('Account not found. Please add account via MetaAPI dashboard:');
        logger.info('https://app.metaapi.cloud/provisioning');
      }

      this.isConnected = false;
    }
  }

  /**
   * 获取实时报价
   */
  async getQuote(symbol: string = 'XAUUSD'): Promise<Quote | null> {
    if (!this.isConnected || !this.connection) {
      logger.warn('MetaAPI not connected, using fallback data');
      return null;
    }

    try {
      const price = await this.connection.getSymbolPrice(symbol);

      return {
        symbol,
        bid: price.bid,
        ask: price.ask,
        spread: price.ask - price.bid,
        timestamp: new Date(),
      };
    } catch (error: any) {
      logger.error(`Failed to get quote for ${symbol}:`, error?.message);
      return null;
    }
  }

  /**
   * 获取历史K线数据
   */
  async getCandles(
    symbol: string = 'XAUUSD',
    timeframe: string = 'M1',
    limit: number = 500
  ): Promise<any[]> {
    if (!this.isConnected || !this.connection) {
      logger.warn('MetaAPI not connected');
      return [];
    }

    try {
      // 时间范围
      const startTime = new Date(Date.now() - limit * 60000);
      const endTime = new Date();

      const candles = await this.connection.getHistoricalCandles(
        symbol,
        timeframe,
        {
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }
      );

      return candles.map((candle: any) => ({
        time: new Date(candle.time),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.tickVolume || 0,
      }));
    } catch (error: any) {
      logger.error(`Failed to get candles for ${symbol}:`, error?.message);
      return [];
    }
  }

  /**
   * 订阅实时报价更新
   */
  async subscribeToQuotes(
    symbol: string,
    callback: (quote: Quote) => void
  ): Promise<void> {
    if (!this.isConnected || !this.connection) {
      logger.warn('MetaAPI not connected');
      return;
    }

    try {
      await this.connection.subscribeToMarketData(symbol);

      this.connection.on('symbolPrice', (price: any) => {
        if (price.symbol === symbol) {
          callback({
            symbol: price.symbol,
            bid: price.bid,
            ask: price.ask,
            spread: price.ask - price.bid,
            timestamp: new Date(),
          });
        }
      });

      logger.info(`✅ Subscribed to quotes for ${symbol}`);
    } catch (error: any) {
      logger.error(`Failed to subscribe to ${symbol}:`, error?.message);
    }
  }

  /**
   * 获取账户信息
   */
  async getAccountInfo(): Promise<any> {
    if (!this.isConnected || !this.connection) {
      logger.warn('MetaAPI not connected');
      return null;
    }

    try {
      const accountInfo = await this.connection.getAccountInformation();
      const positions = await this.connection.getPositions();

      return {
        accountId: ACCOUNT_ID,
        balance: accountInfo.balance,
        equity: accountInfo.equity,
        margin: accountInfo.margin,
        freeMargin: accountInfo.freeMargin,
        positions: positions.map((pos: any) => ({
          symbol: pos.symbol,
          volume: pos.volume,
          type: pos.type === 0 ? 'buy' : 'sell',
          profit: pos.profit,
        })),
        dailyPnl: positions.reduce((sum: number, pos: any) => sum + pos.profit, 0),
        riskUsed: accountInfo.equity > 0 ? (accountInfo.margin / accountInfo.equity) * 100 : 0,
      };
    } catch (error: any) {
      logger.error('Failed to get account info:', error?.message);
      return null;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch (error) {
        logger.error('Disconnect error:', error);
      }
      this.isConnected = false;
      logger.info('MetaAPI disconnected');
    }
  }

  /**
   * 检查连接状态
   */
  isMetaApiConnected(): boolean {
    return this.isConnected;
  }

  /**
   * 添加新账户
   */
  async addAccount(accountData: {
    login: string;
    password: string;
    server: string;
    platform: 'mt4' | 'mt5';
  }): Promise<void> {
    if (!this.metaApi) {
      logger.error('MetaAPI not initialized');
      return;
    }

    try {
      logger.info('Adding account to MetaAPI...');
      const account = await this.metaApi.addAccount(accountData);

      logger.info('✅ Account added successfully');
      logger.info(`Account ID: ${account.id}`);
      logger.info('Please update METAAPI_ACCOUNT in .env with this ID');
    } catch (error: any) {
      logger.error('Failed to add account:', error?.message || error);

      if (error?.message?.includes('invalid credentials')) {
        logger.error('❌ Invalid account credentials');
        logger.error('Please check:');
        logger.error('  - Account number');
        logger.error('  - Password');
        logger.error('  - Server name');
      }
    }
  }
}

// 导出单例
export const metaApiService = new MetaApiService();
