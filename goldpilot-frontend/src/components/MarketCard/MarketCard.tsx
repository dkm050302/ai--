import { useState, useEffect } from 'react';
import { Chart } from '@/components/Chart';
import type { PriceData, Candle, Signal } from '@/types';
import { fetchCandles, fetchRefreshInterval, refreshIntervalToMs } from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import type { Period } from '@/services/marketData';

interface MarketCardProps {
  priceData: PriceData;
}

export function MarketCard({ priceData }: MarketCardProps) {
  const [period, setPeriod] = useState<Period>('1m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [refreshMs, setRefreshMs] = useState<number | null>(5 * 60 * 1000);

  const getColorClass = (value: number) => {
    return value >= 0 ? 'green' : 'red';
  };

  // 获取K线数据
  useEffect(() => {
    let mounted = true;

    const loadRefreshSetting = async () => {
      try {
        const interval = await fetchRefreshInterval();
        if (mounted) {
          setRefreshMs(refreshIntervalToMs(interval));
        }
      } catch (error) {
        console.warn('读取行情刷新间隔失败，使用默认5分钟:', error);
      }
    };

    loadRefreshSetting();

    const handleRefreshIntervalChange: EventListener = (event) => {
      const interval = (event as unknown as CustomEvent).detail;
      if (interval === '1m' || interval === '5m' || interval === '10m' || interval === 'never') {
        setRefreshMs(refreshIntervalToMs(interval));
      }
    };

    window.addEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    return () => {
      mounted = false;
      window.removeEventListener('goldpilot-refresh-interval-change', handleRefreshIntervalChange);
    };
  }, []);

  useEffect(() => {
    const loadCandles = async () => {
      try {
        const data = await fetchCandles(period, period === '1d' ? 220 : 360);
        setCandles(data);

        // 计算信号（需要至少233根K线）
        if (data.length >= 233) {
          const detectedSignals = detectSignals(data);
          setSignals(detectedSignals);
        }
      } catch (error) {
        console.error('K线数据加载失败:', error);
      }
    };

    loadCandles();
    if (!refreshMs) {
      return undefined;
    }

    const interval = setInterval(loadCandles, refreshMs);
    return () => clearInterval(interval);
  }, [period, refreshMs]);

  return (
    <article className="market-card chart-panel">
      {/* 报价条 */}
      <div className="quote-strip">
        <div className="quote">
          <span className="sub">现货黄金 XAU/USD</span>
          <div className={`value ${getColorClass(priceData.change || 0)}`}>
            {priceData.price?.toFixed(2) || '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">涨跌额</span>
          <div className={`value ${getColorClass(priceData.change || 0)}`}>
            {priceData.change !== undefined ? (priceData.change >= 0 ? '+' : '') + priceData.change.toFixed(2) : '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">涨跌幅</span>
          <div className={`value ${getColorClass(priceData.changePct || 0)}`}>
            {priceData.changePct !== undefined ? (priceData.changePct >= 0 ? '+' : '') + priceData.changePct.toFixed(2) + '%' : '--'}
          </div>
        </div>
        <div className="quote">
          <span className="sub">最高</span>
          <div className="value">{priceData.high?.toFixed(2) || '--'}</div>
        </div>
        <div className="quote">
          <span className="sub">最低</span>
          <div className="value">{priceData.low?.toFixed(2) || '--'}</div>
        </div>
      </div>

      {/* K线图 */}
      <Chart
        candles={candles}
        signals={signals}
        period={period}
        currentPrice={priceData.price}
        onPeriodChange={(p) => setPeriod(p as Period)}
      />
    </article>
  );
}
