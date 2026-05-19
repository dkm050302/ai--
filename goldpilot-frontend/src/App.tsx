import { useEffect, useMemo, useState } from 'react';
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
import {
  buildCandlesFromPrice,
  fetchChineseMarketNews,
  fetchFreeGoldPrice,
} from '@/services/freeMarketData';
import { createDefaultAccountData } from '@/types/account';
import { createDefaultSignals, createDefaultDailyStats } from '@/types/signal';
import { createDefaultEvents, createDefaultFlashes } from '@/types/event';
import { createDefaultDecisionData } from '@/types/decision';
import { createDefaultPriceData } from '@/types/price';
import type { Candle, Event, Flash, PriceData } from '@/types';

function App() {
  const [period, setPeriod] = useState('1m');
  const [priceData, setPriceData] = useState<PriceData>(() => createDefaultPriceData());
  const [events, setEvents] = useState<Event[]>(() => createDefaultEvents());
  const [flashes, setFlashes] = useState<Flash[]>(() => createDefaultFlashes());
  const [isLiveMode, setIsLiveMode] = useState(false);

  const accountData = createDefaultAccountData();
  const signals = createDefaultSignals();
  const stats = createDefaultDailyStats();
  const decisionData = createDefaultDecisionData();

  const candles = useMemo<Candle[]>(
    () => buildCandlesFromPrice(priceData, period),
    [period, priceData]
  );

  useEffect(() => {
    let mounted = true;

    const refreshPrice = async () => {
      try {
        const nextPrice = await fetchFreeGoldPrice();
        if (!mounted) return;
        setPriceData(nextPrice);
        setIsLiveMode(true);
      } catch (error) {
        console.warn('[App] 价格刷新失败，保留本地兜底数据', error);
        if (mounted) {
          setIsLiveMode(false);
        }
      }
    };

    refreshPrice();
    const timer = window.setInterval(refreshPrice, 15000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const refreshNews = async () => {
      try {
        const nextNews = await fetchChineseMarketNews();
        if (!mounted) return;
        setEvents(nextNews.events);
        setFlashes(nextNews.flashes);
      } catch (error) {
        console.warn('[App] 中文快讯刷新失败，保留本地兜底数据', error);
      }
    };

    refreshNews();
    const timer = window.setInterval(refreshNews, 5 * 60 * 1000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="page">
      <Header modeText={isLiveMode ? '免费实时源' : '本地兜底'} />

      <main className="main">
        <section className="left" aria-label="技术面与基本面">
          <DecisionCard
            headline={decisionData.headline}
            summary={decisionData.summary}
            eventCountdown={decisionData.eventCountdown}
            aiReason={decisionData.aiReason}
          />

          <div className="left-grid">
            <ProbCard
              upProb={stats.upProb || 55}
              downProb={stats.downProb || 45}
            />

            <RiskCard
              risk={stats.risk || 50}
              riskLevel={stats.riskLevel || 'medium'}
              positionAdvice={stats.positionAdvice || 50}
              stopLoss={stats.stopLoss || 2.5}
            />

            <SupportCard
              support1={priceData.support1 || priceData.price - 8}
              support2={priceData.support2 || priceData.price - 18}
              resistance1={priceData.resistance1 || priceData.price + 10}
            />

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

            <MiniCard
              title="当天重要事项"
              pillText="北京时间"
              pillColor="amber"
              items={events.slice(0, 3).map(e => ({
                time: e.time,
                star: e.star,
                text: e.text,
              }))}
            />

            <MiniCard
              title="中文市场快讯"
              pillText={isLiveMode ? '实时更新' : '兜底数据'}
              pillColor={isLiveMode ? 'red' : 'amber'}
              items={flashes.slice(0, 3).map(f => ({
                time: f.time,
                text: f.text,
                hot: f.hot,
              }))}
            />
          </div>

          <div className="wide-panels">
            <EventList events={events} flashes={[]} showFlashes={false} />
            <EventList events={[]} flashes={flashes} showEvents={false} />

            <ActionPanel
              actions={[
                { title: '客户提醒', text: '现货黄金使用免费行情源轮询更新，短线波动放大时提醒客户控制追单节奏。' },
                { title: '交易动作', text: '结合支撑压力位观察回踩与突破，免费源可能存在延迟，正式跟单前需接交易级行情。' },
                { title: '风险控制', text: '事件公布前降低仓位暴露，单笔风险建议控制在账户净值的 1.2% 以内。' },
              ]}
            />
          </div>
        </section>

        <section className="right" aria-label="实时行情与账号交易情况">
          <article className="market-card">
            <div className="quote-strip">
              <PriceCard priceData={priceData} />
            </div>

            <Chart
              candles={candles}
              signals={signals}
              period={period}
              onPeriodChange={setPeriod}
            />
          </article>

          <AccountCard accountData={accountData} />
        </section>
      </main>
    </div>
  );
}

export default App;
