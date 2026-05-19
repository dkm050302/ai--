import { useState, useEffect } from 'react';
import { PriceCard } from '@/components/PriceCard';
import { Chart } from '@/components/Chart';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { ActionPanel } from '@/components/ActionPanel';
import { EventList } from '@/components/EventList';
import { createDefaultPriceData } from '@/types/price';
import { createDefaultSignals, createDefaultDailyStats } from '@/types/signal';
import { createDefaultEvents, createDefaultFlashes } from '@/types/event';
import { createDefaultDecisionData } from '@/types/decision';
import type { PriceData, Candle } from '@/types';
import { fetchCandles, createRealtimeConnection } from '@/services/marketData';
import type { Period } from '@/services/marketData';

export function Home() {
  const [period, setPeriod] = useState<Period>('1m');
  const [priceData, setPriceData] = useState<PriceData>(createDefaultPriceData());
  const [candles, setCandles] = useState<Candle[]>([]);

  // 静态数据
  const signals = createDefaultSignals();
  const stats = createDefaultDailyStats();
  const events = createDefaultEvents();
  const flashes = createDefaultFlashes();
  const decisionData = createDefaultDecisionData();

  // 获取K线数据
  useEffect(() => {
    const loadCandles = async () => {
      try {
        const data = await fetchCandles(period, 500);
        setCandles(data);
      } catch (error) {
        console.error('Failed to load candles:', error);
      }
    };

    loadCandles();
  }, [period]);

  // 实时价格更新
  useEffect(() => {
    const cleanup = createRealtimeConnection(
      (price) => {
        setPriceData({
          symbol: price.symbol,
          price: price.price,
          change: price.change,
          changePct: price.changePct,
          high: price.high,
          low: price.low,
          support1: price.price * 0.995,
          support2: price.price * 0.99,
          resistance1: price.price * 1.005,
          timestamp: price.timestamp,
        });
      },
      (error) => {
        console.error('Real-time price error:', error);
      }
    );

    return cleanup;
  }, []);

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between pb-6">
        <div className="min-w-0">
          <h1 className="text-4xl font-black text-slate-900" style={{ fontFamily: '"Times New Roman", serif' }}>
            交易看板
          </h1>
          <p className="text-sm text-slate-600 font-medium mt-2" style={{ fontFamily: '"Georgia", serif' }}>
            实时监控黄金市场动态
          </p>
        </div>
        <div className="mr-5">
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full shadow-lg shadow-blue-500/30">
            <div className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></div>
            <span className="text-sm text-white font-bold whitespace-nowrap">实时更新中</span>
          </div>
        </div>
      </div>

      {/* 主内容区 - 左边K线，右边信息 */}
      <main className="main">
        {/* 左侧区域：实时行情K线图 */}
        <section className="left" aria-label="实时行情K线图">
          {/* 市场卡片 - 报价条 + K线图 */}
          <article className="market-card">
            {/* 报价条 */}
            <div className="quote-strip">
              <PriceCard priceData={priceData} />
            </div>

            {/* K线图 */}
            <Chart
              candles={candles}
              signals={signals}
              period={period}
              onPeriodChange={(p) => setPeriod(p as Period)}
            />
          </article>
        </section>

        {/* 右侧区域：信息咨询与分析 */}
        <section className="right" aria-label="信息咨询与分析">
          {/* 今日决策卡片 */}
          <DecisionCard
            headline={decisionData.headline}
            summary={decisionData.summary}
            eventCountdown={decisionData.eventCountdown}
            aiReason={decisionData.aiReason}
          />

          {/* 六卡片网格 */}
          <div className="info-grid">
            {/* 上涨/下跌概率 */}
            <ProbCard
              upProb={stats.upProb || 55}
              downProb={stats.downProb || 45}
            />

            {/* 仓位管理警示 */}
            <RiskCard
              risk={stats.risk || 50}
              riskLevel={stats.riskLevel || 'medium'}
              positionAdvice={stats.positionAdvice || 50}
              stopLoss={stats.stopLoss || 2.5}
            />

            {/* 当前行情支撑压力 */}
            <SupportCard
              support1={priceData.support1 || 4800}
              support2={priceData.support2 || 4750}
              resistance1={priceData.resistance1 || 4900}
            />

            {/* 当天重要数据 */}
            <MiniCard
              title="当天重要数据"
              pillText="三星以上"
              pillColor="amber"
              items={events.slice(0, 3).map(e => ({
                time: e.time,
                star: e.star,
                text: e.text,
              }))}
            />

            {/* 当天重要事项 */}
            <MiniCard
              title="当天重要事项"
              pillText="18:00-05:00"
              pillColor="amber"
              items={events.slice(0, 3).map(e => ({
                time: e.time,
                star: e.star,
                text: e.text,
              }))}
            />

            {/* 实时市场快讯 */}
            <MiniCard
              title="实时市场快讯"
              pillText="实时更新"
              pillColor="red"
              items={flashes.slice(0, 3).map(f => ({
                time: f.time,
                text: f.text,
                hot: f.hot,
              }))}
            />
          </div>

          {/* 三宽面板 */}
          <div className="wide-panels">
            {/* 美国重要事件明细 */}
            <EventList events={events} flashes={[]} />

            {/* 市场快讯流 */}
            <EventList events={[]} flashes={flashes} />

            {/* AI智能交易分析建议 */}
            <ActionPanel
              actions={[
                { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
                { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
                { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
              ]}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
