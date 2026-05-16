import { useState } from 'react';
import { Header } from '@/components/Header';
import { PriceCard } from '@/components/PriceCard';
import { Chart } from '@/components/Chart';
import { AccountCard } from '@/components/AccountCard';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { ActionPanel } from '@/components/ActionPanel';
import { EventList } from '@/components/EventList';
import { createDefaultPriceData } from '@/types/price';
import { createDefaultAccountData } from '@/types/account';
import { createDefaultCandles } from '@/types/chart';
import { createDefaultSignals, createDefaultDailyStats } from '@/types/signal';
import { createDefaultEvents, createDefaultFlashes } from '@/types/event';
import { createDefaultDecisionData } from '@/types/decision';

function App() {
  const [period, setPeriod] = useState('1m');

  // 使用默认模拟数据
  const priceData = createDefaultPriceData();
  const accountData = createDefaultAccountData();
  const candles = createDefaultCandles();
  const signals = createDefaultSignals();
  const stats = createDefaultDailyStats();
  const events = createDefaultEvents();
  const flashes = createDefaultFlashes();
  const decisionData = createDefaultDecisionData();

  return (
    <div className="page">
      {/* 顶部导航栏 */}
      <Header />

      {/* 主内容区 - 完全按照index.html布局 */}
      <main className="main">
        {/* 左侧区域：技术面与基本面 */}
        <section className="left" aria-label="技术面与基本面">
          {/* 今日决策卡片 */}
          <DecisionCard
            headline={decisionData.headline}
            summary={decisionData.summary}
            eventCountdown={decisionData.eventCountdown}
            aiReason={decisionData.aiReason}
          />

          {/* 六卡片网格 */}
          <div className="left-grid">
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

            {/* 客户服务动作 */}
            <ActionPanel
              actions={[
                { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
                { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
                { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
              ]}
            />
          </div>
        </section>

        {/* 右侧区域：实时行情与账号交易情况 */}
        <section className="right" aria-label="实时行情与账号交易情况">
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
              onPeriodChange={setPeriod}
            />
          </article>

          {/* 账户卡片 */}
          <AccountCard accountData={accountData} />
        </section>
      </main>
    </div>
  );
}

export default App;
