import { useEffect, useRef, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type CandlestickData, type Time } from 'lightweight-charts';
import type { Candle, Signal } from '@/types';
import { detectSignals, getSignalMarkerText } from '@/utils/signalCalculator';

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
export function Chart({ candles, signals: externalSignals, period, onPeriodChange }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  // 实时计算信号（仅在1分钟周期）
  const calculatedSignals = useMemo(() => {
    if (period === '1m' && candles.length > 233) {
      return detectSignals(candles);
    }
    return [];
  }, [candles, period]);

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

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#0f9f6e',
      downColor: '#e3342f',
      borderVisible: false,
      wickUpColor: '#0f9f6e',
      wickDownColor: '#e3342f',
    });

    console.log('🔍 [Chart] chart 对象:', chart);
    console.log('🔍 [Chart] chart 类型:', typeof chart);
    console.log('🔍 [Chart] chart 方法列表:', Object.getOwnPropertyNames(Object.getPrototypeOf(chart)));

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
    if (!seriesRef.current || signals.length === 0) {
      console.log('⚠️ [Chart] 未设置series或无信号数据', { hasSeries: !!seriesRef.current, signalsLength: signals.length });
      return;
    }

    const currentPeriodSignals = signals.filter(s => s.period === period || period === '1m');
    console.log(`📊 [Chart] 当前周期 ${period}, 筛选后信号数量: ${currentPeriodSignals.length}`, currentPeriodSignals);

    const markers = currentPeriodSignals.map(signal => {
      const time = (new Date(signal.timestamp).getTime() / 1000) as Time;
      console.log(`📍 [Chart] 信号时间戳: ${time}, 日期: ${signal.timestamp}`);

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

    console.log(`🎯 [Chart] 设置 ${markers.length} 个标记`);

    try {
      (seriesRef.current as any).setMarkers(markers);
      console.log('✅ [Chart] 标记设置成功');
    } catch (error) {
      console.warn('❌ [Chart] 标记设置失败:', error);
    }
  }, [signals, period]);

  return (
    <>
      {/* K线图标题和周期切换 */}
      <div className="chart-head">
        <div>
          <strong>现货黄金蜡烛图</strong>
          <div className="sub">实时行情，信号提醒基于EMA/ATR技术分析</div>
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

      {/* 图表容器 */}
      <div
        ref={chartContainerRef}
        className="chart-wrap"
      />
    </>
  );
}
