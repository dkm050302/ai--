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
      if (!chartContainerRef.current || !chartRef.current) return;
      const newRect = chartContainerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions({ width: newRect.width });
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

      if (signal.direction === 'long') {
        return {
          time,
          position: 'belowBar',
          color: signal.status === 'loss' ? '#e3342f' : '#0f9f6e',
          shape: 'arrowUp',
          text: signal.status === 'pending' ? '买入' : signal.status === 'profit' ? '买盈' : '买损',
        };
      }

      return {
        time,
        position: 'aboveBar',
        color: signal.status === 'profit' ? '#0f9f6e' : '#e3342f',
        shape: 'arrowDown',
        text: signal.status === 'pending' ? '卖出' : signal.status === 'profit' ? '卖盈' : '卖损',
      };
    });

    markersRef.current.setMarkers(markers);
  }, [signals, period]);

  return (
    <div className="min-h-0 flex flex-col">
      <div className="chart-head">
        <div>
          <strong>现货黄金蜡烛图</strong>
          <div className="sub">当前使用免费行情源轮询生成，后续可替换为交易级 K 线。</div>
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

      <div ref={chartContainerRef} className="chart-wrap" />
    </div>
  );
}
