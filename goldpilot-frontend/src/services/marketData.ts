/**
 * 现货黄金市场数据服务
 * 使用免费的金融API获取实时行情和历史K线数据
 */

export type Period = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface PriceQuote {
  symbol: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  timestamp: Date;
}

interface Candle {
  time: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * 获取实时报价
 * 通过后端 API 获取，避免 CORS 跨域问题
 */
export async function fetchRealTimePrice(): Promise<PriceQuote> {
  console.log('🔍 [价格数据源] 正在从后端 API 获取实时报价...');

  try {
    // 调用后端 API
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
    const response = await fetch(`${apiUrl}/api/price`);

    if (!response.ok) {
      throw new Error(`后端 API 返回错误: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data) {
      throw new Error('后端 API 返回数据格式无效');
    }

    const data = result.data;

    console.log(
      `✅ [价格数据源] 后端 API - $${data.price.toFixed(2)} (${data.change >= 0 ? '+' : ''}${data.change.toFixed(2)})`
    );

    return {
      symbol: data.symbol || 'XAU/USD',
      price: data.price,
      change: data.change,
      changePct: data.changePct,
      high: data.high,
      low: data.low,
      timestamp: new Date(data.timestamp),
    };
  } catch (e) {
    console.error('❌ [价格数据源] 后端 API 失败:', (e as Error).message);

    // 直接抛出错误，不使用模拟数据
    throw e;
  }
}

/**
 * 获取历史K线数据
 * 通过后端 API 获取，避免 CORS 跨域问题
 * @param period 周期
 * @param limit 获取数量
 */
export async function fetchCandles(period: Period = '1m', limit: number = 500): Promise<Candle[]> {
  console.log(`📊 [K线数据源] 正在从后端 API 获取 ${period} 周期数据...`);

  try {
    // 调用后端 API
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3006';
    const response = await fetch(
      `${apiUrl}/api/candles?period=${period}&limit=${limit}`
    );

    if (!response.ok) {
      throw new Error(`后端 API 返回错误: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success || !result.data?.candles) {
      throw new Error('后端 API 返回数据格式无效');
    }

    const candles = result.data.candles;

    console.log(`✅ [K线数据源] 后端 API - 获取 ${candles.length} 条数据`);
    return candles;
  } catch (error) {
    console.error('❌ [K线数据源] 后端 API 失败:', (error as Error).message);

    // 直接抛出错误，不使用模拟数据
    throw error;
  }
}

/**
 * 创建实时数据连接（WebSocket）
 * 对于不支持WebSocket的场景，使用轮询
 */
export function createRealtimeConnection(
  onPriceUpdate: (price: PriceQuote) => void,
  onError?: (error: Error) => void
): () => void {
  const intervalMs = 300000; // 每5分钟更新一次（800次/天限制内）

  const updatePrice = async () => {
    try {
      const price = await fetchRealTimePrice();
      onPriceUpdate(price);
    } catch (error) {
      onError?.(error as Error);
    }
  };

  // 立即执行一次
  updatePrice();

  // 定期更新
  const intervalId = setInterval(updatePrice, intervalMs);

  // 返回清理函数
  return () => clearInterval(intervalId);
}
