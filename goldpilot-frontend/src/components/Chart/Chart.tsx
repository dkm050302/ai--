import { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, MarkerPosition, MarkerShape } from 'lightweight-charts';
import type { Candle, Signal } from '@/types';

interface ChartProps {
  candles: Candle[];
  signals: Signal[];
  period: string;
  onPeriodChange: (period: string) => void;
}

/**
 * K线图组件 - 使用Lightweight Charts
 */
export function Chart({ candles, signals, period, onPeriodChange }: ChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);

  const periods = [
    { value: '1m', label: '1分钟' },
    { value: '5m', label: '5分钟' },
    { value: '15m', label: '15分钟' },
    { value: '1h', label: '1小时' },
    { value: '4h', label: '4小时' },
    { value: '1d', label: '日线' },
  ];

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;

    // 创建图表
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 330,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#1d252d',
      },
      grid: {
        vertLines: { color: '#eef3f7' },
        horzLines: { color: '#eef3f7' },
      },
      timeScale: {
        borderColor: '#dfe6ec',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#dfe6ec',
      },
    });

    // 添加K线系列
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#0f9f6e',
      downColor: '#e3342f',
      borderVisible: false,
      wickUpColor: '#0f9f6e',
      wickDownColor: '#e3342f',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // 响应式调整大小
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, []);

  // 更新K线数据
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;

    const candlestickData: CandlestickData[] = candles.map((candle) => ({
      time: (candle.time.getTime() / 1000) as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }));

    seriesRef.current.setData(candlestickData);
  }, [candles]);

  // 添加信号标记
  useEffect(() => {
    if (!seriesRef.current || signals.length === 0) return;

    // 过滤当前周期的信号
    const currentPeriodSignals = signals.filter(s => s.period === period);

    // 转换为Lightweight Charts标记格式
    const markers = currentPeriodSignals.map(signal => {
      const time = (new Date(signal.timestamp).getTime() / 1000) as Time;

      // 根据信号方向和状态设置标记样式
      let position: MarkerPosition;
      let color: string;
      let shape: MarkerShape;
      let text: string;

      if (signal.direction === 'long') {
        position = 'belowBar';
        if (signal.status === 'profit') {
          color = '#0f9f6e'; // 绿色
          shape = 'arrowUp';
          text = '买盈';
        } else if (signal.status === 'loss') {
          color = '#e3342f'; // 红色
          shape = 'arrowUp';
          text = '买亏';
        } else {
          color = '#1769e0'; // 蓝色
          shape = 'arrowUp';
          text = '买入';
        }
      } else {
        position = 'aboveBar';
        if (signal.status === 'profit') {
          color = '#0f9f6e'; // 绿色
          shape = 'arrowDown';
          text = '卖盈';
        } else if (signal.status === 'loss') {
          color = '#e3342f'; // 红色
          shape = 'arrowDown';
          text = '卖亏';
        } else {
          color = '#e3342f'; // 红色
          shape = 'arrowDown';
          text = '卖出';
        }
      }

      return {
        time,
        position,
        color,
        shape,
        text,
      };
    });

    seriesRef.current.setMarkers(markers);
  }, [signals, period]);

  return (
    <div className="bg-paper border border-line rounded-lg shadow-panel p-[13px] flex flex-col" style={{ minHeight: '460px' }}>
      {/* 标题和周期切换 */}
      <div className="flex justify-between items-center gap-2.5 mb-2">
        <div>
          <strong className="block">现货黄金蜡烛图</strong>
          <div className="text-xs text-muted">可切换不同周期，当前为前端模拟行情。</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {periods.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => onPeriodChange(p.value)}
              className={`px-2.25 py-1.5 rounded border text-xs cursor-pointer transition-colors ${
                period === p.value
                  ? 'border-blue bg-blue-soft text-blue font-bold'
                  : 'border-line-dark bg-[#f8fafc] text-muted hover:bg-gray-100'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* 图表容器 */}
      <div
        ref={chartContainerRef}
        className="flex-1 min-h-[330px] overflow-hidden border border-line rounded bg-[linear-gradient(#eef3f7_1px,_transparent_1px),_linear-gradient(90deg,#eef3f7_1px,_transparent_1px),_#ffffff]"
        style={{
          backgroundSize: '100% 58px, 70px 100%',
        }}
      />
    </div>
  );
}
