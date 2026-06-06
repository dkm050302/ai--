import { useState, useEffect, useRef, useMemo } from 'react';
import { createChart, type IChartApi, type IPriceLine, type ISeriesApi, type CandlestickData, type Time } from 'lightweight-charts';
import type { Candle, Signal } from '@/types';
import { detectSignals, getSignalMarkerText } from '@/utils/signalCalculator';

interface ChartProps {
  candles: Candle[];
  signals: Signal[];
  period: string;
  onPeriodChange: (period: string) => void;
  currentPrice?: number;
  marketClosed?: boolean;
  closedMessage?: string;
}

const periods = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '日线' },
];

function toUnixSeconds(value: Candle['time'] | Signal['timestamp']): number {
  if (typeof value === 'number') {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : value;
  }

  if (value instanceof Date) {
    return Math.floor(value.getTime() / 1000);
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0;
}

function normalizeCandles(candles: Candle[]): CandlestickData[] {
  const dataByTime = new Map<number, CandlestickData>();

  candles.forEach((candle) => {
    const timestamp = toUnixSeconds(candle.time);
    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);

    if (!timestamp || ![open, high, low, close].every(Number.isFinite)) {
      return;
    }

    dataByTime.set(timestamp, {
      time: timestamp as Time,
      open,
      high,
      low,
      close,
    });
  });

  return [...dataByTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

/**
 * K线图组件 - 完全按照index.html设计
 */
export function Chart({
  candles,
  signals: externalSignals,
  period,
  onPeriodChange,
  currentPrice,
  marketClosed = false,
  closedMessage,
}: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);

  // 实时计算信号（仅在1分钟周期）
  const calculatedSignals = useMemo(() => {
    if (!marketClosed && period === '1m' && candles.length > 233) {
      return detectSignals(candles);
    }
    return [];
  }, [candles, period, marketClosed]);

  // 使用计算出的信号或外部传入的信号
  const signals = calculatedSignals.length > 0 ? calculatedSignals : externalSignals;

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const rect = container.getBoundingClientRect();

    const chart = createChart(container, {
      width: rect.width,
      height: rect.height || 500,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#667482',
      },
      localization: {
        dateFormat: 'yyyy-MM-dd',
      },
      grid: {
        vertLines: { color: '#eef3f7' },
        horzLines: { color: '#eef3f7' },
      },
      timeScale: {
        borderColor: '#eef3f7',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: '#eef3f7',
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.12,
        },
      },
      crosshair: {
        vertLine: {
          color: '#1769e0',
          width: 1,
          style: 3,
        },
        horzLine: {
          color: '#1769e0',
          width: 1,
          style: 3,
        },
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#0f9f6e',
      downColor: '#e3342f',
      borderVisible: false,
      wickUpColor: '#0f9f6e',
      wickDownColor: '#e3342f',
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      },
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const newRect = chartContainerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({
          width: newRect.width,
          height: newRect.height,
        });
      }
    };

    // 使用ResizeObserver监听容器大小变化
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const candlestickData = normalizeCandles(candles);
    if (candlestickData.length === 0) return;

    seriesRef.current.setData(candlestickData);

    if (!initialDataLoaded && chartRef.current) {
      const visibleBars = 140;
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(candlestickData.length - visibleBars, 0),
        to: candlestickData.length + 8,
      });
      setInitialDataLoaded(true);
    } else if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
    }
  }, [candles, initialDataLoaded]);

  useEffect(() => {
    if (!seriesRef.current || !currentPrice || !Number.isFinite(currentPrice)) return;

    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
    }

    priceLineRef.current = seriesRef.current.createPriceLine({
      price: currentPrice,
      color: '#1769e0',
      lineWidth: 1,
      lineStyle: 2,
      lineVisible: true,
      axisLabelVisible: true,
      title: '现价',
    });
  }, [currentPrice]);

  useEffect(() => {
    if (!seriesRef.current || signals.length === 0) {
      try {
        (seriesRef.current as any)?.setMarkers([]);
      } catch {
        // lightweight-charts v3 exposes marker APIs dynamically.
      }
      return;
    }

    const currentPeriodSignals = signals.filter(s => s.period === period || period === '1m');

    const markers = currentPeriodSignals.map(signal => {
      const time = toUnixSeconds(signal.timestamp) as Time;

      let position: 'aboveBar' | 'belowBar';
      let color: string;
      let shape: 'arrowUp' | 'arrowDown';
      let text: string;

      const markerText = getSignalMarkerText(signal);

      if (signal.direction === 'long') {
        position = 'belowBar';
        if (signal.status === 'profit') {
          color = '#3b82f6'; // 蓝色止盈
          shape = 'arrowUp';
          text = markerText;
        } else if (signal.status === 'loss') {
          color = '#dc2626'; // 红色止损
          shape = 'arrowUp';
          text = '止损';
        } else {
          color = '#a855f7'; // 紫色做多信号
          shape = 'arrowUp';
          text = markerText;
        }
      } else {
        position = 'aboveBar';
        if (signal.status === 'profit') {
          color = '#3b82f6'; // 蓝色止盈
          shape = 'arrowDown';
          text = markerText;
        } else if (signal.status === 'loss') {
          color = '#dc2626'; // 红色止损
          shape = 'arrowDown';
          text = '止损';
        } else {
          color = '#f59e0b'; // 橙色做空信号
          shape = 'arrowDown';
          text = markerText;
        }
      }

      return { time, position, color, shape, text };
    });

    try {
      (seriesRef.current as any).setMarkers(markers);
    } catch (error) {
      console.warn('[Chart] 标记设置失败:', error);
    }
  }, [signals, period]);

  // 当前本地时间
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // 当周期切换时，重置初始加载状态并自动调整视图
  useEffect(() => {
    setInitialDataLoaded(false);
  }, [period]);

  // 手动重置视图
  const handleResetView = () => {
    if (chartRef.current && candles.length > 0) {
      const visibleBars = 140;
      chartRef.current.timeScale().setVisibleLogicalRange({
        from: Math.max(candles.length - visibleBars, 0),
        to: candles.length + 8,
      });
    }
  };

  return (
    <>
      {/* K线图标题和周期切换 */}
      <div className="chart-head">
        <div>
          <strong>现货黄金蜡烛图</strong>
          <div className="sub">
            {marketClosed ? '周末休市，图表仅作复盘参考' : '实时行情，信号提醒基于EMA/ATR技术分析'}
            {marketClosed && (
              <span style={{ marginLeft: '10px', color: '#d97706', fontWeight: 'bold' }}>
                周末休市
              </span>
            )}
            <span style={{ marginLeft: '10px', color: '#3b82f6', fontWeight: 'bold' }}>
              北京时间: {currentTime.toLocaleString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
        <div className="periods" id="periods">
          <button
            type="button"
            onClick={handleResetView}
            className="reset-view-btn"
            title="重置图表视图"
          >
            ⟲
          </button>
          {periods.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onPeriodChange(p.value)}
              className={period === p.value ? 'active' : ''}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图表容器 */}
      <div
        ref={chartContainerRef}
        className="chart-wrap"
        style={{
          position: 'relative',
        }}
      >
        {marketClosed && (
          <div className="chart-market-closed-overlay">
            <strong>周末休市</strong>
            <span>{closedMessage || '暂停实时行情刷新'}</span>
          </div>
        )}
        {candles.length === 0 && !marketClosed && (
          <div className="chart-empty-state">获取失败</div>
        )}
      </div>
    </>
  );
}
