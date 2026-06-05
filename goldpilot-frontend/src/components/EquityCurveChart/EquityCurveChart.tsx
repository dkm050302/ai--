import { useEffect, useRef } from 'react';
import { createChart, type IChartApi, type ISeriesApi, type LineData, type Time } from 'lightweight-charts';

export interface EquityCurveSeries {
  id: string;
  name: string;
  color: string;
  data: Array<{
    time: number;
    value: number;
  }>;
}

interface EquityCurveChartProps {
  series: EquityCurveSeries[];
  height?: number;
}

export function EquityCurveChart({ series, height = 280 }: EquityCurveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineRefs = useRef<ISeriesApi<'Line'>[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const rect = container.getBoundingClientRect();
    const chart = createChart(container, {
      width: rect.width,
      height,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#667482',
      },
      grid: {
        vertLines: { color: '#eef3f7' },
        horzLines: { color: '#eef3f7' },
      },
      rightPriceScale: {
        borderColor: '#eef3f7',
      },
      timeScale: {
        borderColor: '#eef3f7',
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !chartRef.current) return;
      const nextRect = containerRef.current.getBoundingClientRect();
      chartRef.current.applyOptions({ width: nextRect.width, height });
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
      lineRefs.current = [];
    };
  }, [height]);

  useEffect(() => {
    if (!chartRef.current) return;

    lineRefs.current.forEach((line) => chartRef.current?.removeSeries(line));
    lineRefs.current = [];

    series.forEach((item) => {
      const line = chartRef.current?.addLineSeries({
        color: item.color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: item.name,
      });

      if (!line) return;

      const data: LineData[] = item.data
        .map((point, index) => ({
          time: (point.time + index) as Time,
          value: Number(point.value.toFixed(2)),
        }))
        .sort((a, b) => Number(a.time) - Number(b.time));

      line.setData(data);
      lineRefs.current.push(line);
    });

    chartRef.current.timeScale().fitContent();
  }, [series]);

  return <div ref={containerRef} style={{ width: '100%', height }} />;
}
