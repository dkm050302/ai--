/**
 * 测试API连接的函数
 */
export async function testApiConnection() {
  try {
    console.log('🧪 Testing API connection...');

    // 测试健康检查
    const healthRes = await fetch('http://localhost:3002/health');
    const health = await healthRes.json();
    console.log('✅ Health check:', health);

    // 测试价格API
    const priceRes = await fetch('http://localhost:3002/api/price');
    const price = await priceRes.json();
    console.log('✅ Price API:', price);

    // 测试K线数据API
    const candlesRes = await fetch('http://localhost:3002/api/candles?period=1m&limit=10');
    const candles = await candlesRes.json();
    console.log('✅ Candles API:', candles.data?.candles?.length, 'candles');

    console.log('🎉 All API tests passed!');
    return true;
  } catch (error) {
    console.error('❌ API connection failed:', error);
    return false;
  }
}
