import { useState, useEffect } from 'react';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { WidePanel } from '@/components/WidePanel';
import { MarketCard } from '@/components/MarketCard';
import { SimpleAccountCard } from '@/components/SimpleAccountCard';
import { createDefaultPriceData } from '@/types/price';
import { createDefaultDecisionData } from '@/types/decision';
import { createDefaultEvents, createDefaultFlashes } from '@/types/event';
import type { PriceData, Event, Flash } from '@/types';

const CALENDAR_SOURCES = [
  { name: '金十日历', text: '中文财经日历，按国家、重要程度查看美国数据。', url: 'https://cal.jin10.com/' },
  { name: '英为财情日历', text: '全球经济日历，适合交叉核对前值、预测值和公布值。', url: 'https://cn.investing.com/economic-calendar/' },
  { name: '汇通财经日历', text: '中文宏观日历，覆盖外汇、贵金属相关事件。', url: 'https://rl.fx678.com/' },
];

const EVENT_SOURCES = [
  { name: '美联储日程', text: '美联储官方日程，查看会议、公开活动和发布安排。', url: 'https://www.federalreserve.gov/newsevents/calendar.htm' },
  { name: '美联储讲话', text: '美联储官员讲话原文与发布时间。', url: 'https://www.federalreserve.gov/newsevents/speeches.htm' },
  { name: 'FOMC日程', text: 'FOMC会议日期、声明、纪要和经济预测材料。', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
];

const FLASH_SOURCES = [
  { name: '新浪7x24', url: 'https://finance.sina.com.cn/7x24/' },
  { name: '金十快讯', url: 'https://www.jin10.com/' },
  { name: '东方财富', url: 'https://finance.eastmoney.com/a/cqqgsx.html' },
];

interface ActionItem {
  title: string;
  text: string;
}

const ACTION_TITLES = ['客户提醒', '交易动作', '风险控制'];

export function EventDrivenHome() {
  const [priceData, setPriceData] = useState<PriceData>(createDefaultPriceData());
  const [events, setEvents] = useState<Event[]>(createDefaultEvents());
  const [flashes, setFlashes] = useState<Flash[]>(createDefaultFlashes());
  const [today] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  });

  // 模拟数据
  const decisionData = createDefaultDecisionData();
  const [upProb] = useState(58);
  const [downProb] = useState(42);
  const [risk] = useState(52);
  const riskLevel = risk >= 70 ? 'high' : risk >= 48 ? 'medium' : 'low';
  const positionAdvice = Math.max(20, 88 - risk);
  const stopLoss = 2.5;

  const actions: ActionItem[] = [
    { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
    { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
    { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
  ];

  // 获取实时价格
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        // 这里应该调用真实的价格API
        // 目前使用模拟数据
        const mockPrice: PriceData = {
          symbol: 'XAU/USD',
          price: 4850 + Math.random() * 50,
          change: (Math.random() - 0.5) * 20,
          changePct: (Math.random() - 0.5) * 0.5,
          high: 4880,
          low: 4820,
          support1: 4840,
          support2: 4820,
          resistance1: 4870,
          timestamp: new Date(),
        };
        setPriceData(mockPrice);
      } catch (error) {
        console.error('获取价格失败:', error);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="event-driven-home">
      {/* 页面标题 */}
      <div className="date-bar">
        <div className="brand-block">
          <div className="brand-name">GoldPilot 黄金交易决策驾驶舱</div>
          <div className="brand-sub">面向金融客户服务团队的事件驱动型交易辅助首页</div>
        </div>
        <div className="date-meta">
          <span className="pill green">免费数据源</span>
          <div className="status-dot"></div>
          <span className="date-text">{today}</span>
        </div>
      </div>

      {/* 主内容 */}
      <main className="main">
        {/* 左侧区域 */}
        <section className="left" aria-label="技术面与基本面">
          {/* 决策卡片 */}
          <DecisionCard
            headline={decisionData.headline}
            summary={decisionData.summary}
            eventCountdown={decisionData.eventCountdown}
            aiReason={decisionData.aiReason}
          />

          {/* 左侧网格 */}
          <div className="left-grid">
            {/* 上涨/下跌概率 */}
            <ProbCard upProb={upProb} downProb={downProb} />

            {/* 仓位管理警示 */}
            <RiskCard
              risk={risk}
              riskLevel={riskLevel}
              positionAdvice={positionAdvice}
              stopLoss={stopLoss}
            />

            {/* 当前行情支撑压力 */}
            <SupportCard
              support1={priceData.support1}
              support2={priceData.support2}
              resistance1={priceData.resistance1}
            />

            {/* 当天重要数据 */}
            <MiniCard
              title="当天重要数据"
              pillText="金十日历"
              pillColor="blue"
              items={events.slice(0, 3).map(e => ({
                time: e.time,
                star: e.star,
                text: e.text,
              }))}
              sources={CALENDAR_SOURCES}
            />

            {/* 当天重要事项 */}
            <MiniCard
              title="当天重要事项"
              pillText="汇头条日历"
              pillColor="blue"
              items={events.slice(0, 3).map(e => ({
                time: e.time,
                star: e.star,
                text: e.text,
              }))}
              sources={EVENT_SOURCES}
            />

            {/* 实时市场快讯 */}
            <MiniCard
              title="实时市场快讯"
              pillText="新浪7x24"
              pillColor="red"
              items={flashes.slice(0, 3).map(f => ({
                time: f.time,
                text: f.text,
                hot: f.hot,
              }))}
              sources={FLASH_SOURCES.map(s => ({ name: s.name, text: '', url: s.url }))}
            />
          </div>

          {/* 三宽面板 */}
          <div className="wide-panels">
            {/* 美国重要事件明细 */}
            <WidePanel
              title="美国重要事件明细"
              pillText="北京时间"
              events={events}
              sources={EVENT_SOURCES}
            />

            {/* 市场快讯流 */}
            <WidePanel
              title="市场快讯流"
              pillText={`${flashes.length} 条`}
              pillColor="red"
              flashes={flashes}
              sources={FLASH_SOURCES.map(s => ({ name: s.name, text: '', url: s.url }))}
            />

            {/* 客户服务动作 */}
            <WidePanel
              title="客户服务动作"
              pillText="可执行"
              pillColor="green"
              actions={actions}
            />
          </div>
        </section>

        {/* 右侧区域 */}
        <section className="right" aria-label="实时行情与账号交易情况">
          {/* 市场卡片 */}
          <MarketCard priceData={priceData} />

          {/* 账户卡片 */}
          <SimpleAccountCard />
        </section>
      </main>
    </div>
  );
}
