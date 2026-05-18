import { useEffect, useRef } from 'react';
import {
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  CandlestickSeries,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
} from 'lightweight-charts';
import type { Candle, Signal } from '@/types';

interface ChartProps {
  candles: Candle[];
  signals: Signal[];
  period: string;
  onPeriodChange: (period: string) => void;
}

const periods = [
  { value: '1m', label: '1分钟' },
  { value: '5m', label: '5分钟' },
  { value: '15m', label: '15分钟' },
  { value: '1h', label: '1小时' },
  { value: '4h', label: '4小时' },
  { value: '1d', label: '日线' },
];

/**
 * K线图组件 - 完全按照index.html设计
 */
export function Chart({ candles, signals, period, onPeriodChange }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const container = chartContainerRef.current;
    const rect = container.getBoundingClientRect();

    const chart = createChart(container, {
      width: rect.width,
      height: 330,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#667482',
      },
      grid: {
        vertLines: { color: '#eef3f7' },
        horzLines: { color: '#eef3f7' },
      },
      timeScale: {
        borderColor: '#eef3f7',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#eef3f7',
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

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#0f9f6e',
      downColor: '#e3342f',
      borderVisible: false,
      wickUpColor: '#0f9f6e',
      wickDownColor: '#e3342f',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;
    markersRef.current = createSeriesMarkers(candlestickSeries, []);

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        const newRect = chartContainerRef.current.getBoundingClientRect();
        chartRef.current.applyOptions({
          width: newRect.width,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      markersRef.current = null;
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const candlestickData: CandlestickData[] = candles.map((candle) => {
      const timestamp = candle.time instanceof Date
        ? candle.time.getTime()
        : new Date(candle.time).getTime();

      return {
        time: (timestamp / 1000) as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      };
    });

    seriesRef.current.setData(candlestickData);
  }, [candles]);

  useEffect(() => {
    if (!markersRef.current) return;

    const currentPeriodSignals = signals.filter(s => s.period === period);

    const markers: SeriesMarker<Time>[] = currentPeriodSignals.map(signal => {
      const time = (new Date(signal.timestamp).getTime() / 1000) as Time;

      let position: 'aboveBar' | 'belowBar';
      let color: string;
      let shape: 'arrowUp' | 'arrowDown';
      let text: string;

      if (signal.direction === 'long') {
        position = 'belowBar';
        if (signal.status === 'profit') {
          color = '#0f9f6e';
          shape = 'arrowUp';
          text = '买盈';
        } else if (signal.status === 'loss') {
          color = '#e3342f';
          shape = 'arrowUp';
          text = '买亏';
        } else {
          color = '#1769e0';
          shape = 'arrowUp';
          text = '买入';
        }
      } else {
        position = 'aboveBar';
        if (signal.status === 'profit') {
          color = '#0f9f6e';
          shape = 'arrowDown';
          text = '卖盈';
        } else if (signal.status === 'loss') {
          color = '#e3342f';
          shape = 'arrowDown';
          text = '卖亏';
        } else {
          color = '#e3342f';
          shape = 'arrowDown';
          text = '卖出';
        }
      }

      return { time, position, color, shape, text };
    });

    markersRef.current.setMarkers(markers);
  }, [signals, period]);

  return (
    <div className="min-h-0 flex flex-col">
      {/* K线图标题和周期切换 - 按照index.html */}
      <div className="chart-head">
        <div>
          <strong>现货黄金蜡烛图</strong>
          <div className="sub">可切换不同周期，当前为前端模拟行情。</div>
        </div>
        <div className="periods" id="periods">
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

      {/* 图表容器 - 按照index.html的chart-wrap样式 */}
      <div
        ref={chartContainerRef}
        className="chart-wrap"
      />
    </div>
  );
}
