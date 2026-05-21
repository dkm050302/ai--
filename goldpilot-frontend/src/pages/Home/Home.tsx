import { useState, useEffect, useMemo } from 'react';
import { Button, Spin, message } from 'antd';
import { RobotOutlined, LoadingOutlined } from '@ant-design/icons';
import { PriceCard } from '@/components/PriceCard';
import { Chart } from '@/components/Chart';
import { SignalPanel } from '@/components/SignalPanel';
import { DecisionCard } from '@/components/DecisionCard';
import { ProbCard } from '@/components/ProbCard';
import { RiskCard } from '@/components/RiskCard';
import { SupportCard } from '@/components/SupportCard';
import { MiniCard } from '@/components/MiniCard';
import { ActionPanel } from '@/components/ActionPanel';
import { EventList } from '@/components/EventList';
import { createDefaultPriceData } from '@/types/price';
import { createDefaultEvents, createDefaultFlashes, type Event, type Flash } from '@/types/event';
import { createDefaultDecisionData } from '@/types/decision';
import type { PriceData, Candle, Signal, DailyStats } from '@/types';
import { fetchCandles, createRealtimeConnection } from '@/services/marketData';
import { detectSignals } from '@/utils/signalCalculator';
import type { Period } from '@/services/marketData';
import { dataApi, type EconomicEvent, type MarketFlash } from '@/services/data';
import { aiService, type AIAnalysisResult } from '@/services/ai';

/**
 * 计算信号统计数据
 */
function calculateSignalStats(signals: Signal[]): DailyStats {
  // 获取今天的信号
  const today = new Date().setHours(0, 0, 0, 0);
  const todaySignals = signals.filter(s => new Date(s.timestamp).getTime() >= today);

  // 计算统计数据
  const signalCount = todaySignals.length;
  const completedSignals = todaySignals.filter(s => s.status === 'profit' || s.status === 'loss');
  const winSignals = completedSignals.filter(s => s.status === 'profit');
  const lossSignals = completedSignals.filter(s => s.status === 'loss');
  const winCount = winSignals.length;
  const lossCount = lossSignals.length;
  const winRate = completedSignals.length > 0 ? (winSignals.length / completedSignals.length) * 100 : 0;
  const totalProfit = winSignals.reduce((sum, s) => sum + (s.profit || 0), 0);
  const totalLoss = Math.abs(lossSignals.reduce((sum, s) => sum + (s.profit || 0), 0));
  const netProfit = todaySignals.reduce((sum, s) => sum + (s.profit || 0), 0);

  return {
    date: new Date(),
    signalCount,
    winCount,
    lossCount,
    winRate,
    totalProfit,
    totalLoss,
    netProfit,
    upProb: 50,
    downProb: 50,
    risk: 50,
    riskLevel: 'medium',
    positionAdvice: 50,
    stopLoss: 2.5,
  };
}

export function Home() {
  const [period, setPeriod] = useState<Period>('1m');
  const [priceData, setPriceData] = useState<PriceData>(createDefaultPriceData());
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);

  // 真实数据状态
  const [events, setEvents] = useState<Event[]>(createDefaultEvents());
  const [flashes, setFlashes] = useState<Flash[]>(createDefaultFlashes());
  const [eventsLoading, setEventsLoading] = useState(false);

  // AI分析相关状态
  const [analyzing, setAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [showAnalysisButton, setShowAnalysisButton] = useState(true);

  // 计算统计数据（优先使用AI分析结果）
  const stats = useMemo(() => {
    if (aiAnalysis) {
      return {
        date: new Date(),
        signalCount: 0,
        winCount: 0,
        lossCount: 0,
        winRate: 0,
        totalProfit: 0,
        totalLoss: 0,
        netProfit: 0,
        upProb: aiAnalysis.probability.upProb,
        downProb: aiAnalysis.probability.downProb,
        risk: aiAnalysis.risk.risk,
        riskLevel: aiAnalysis.risk.riskLevel,
        positionAdvice: aiAnalysis.risk.positionAdvice,
        stopLoss: aiAnalysis.risk.stopLoss,
      };
    }
    return calculateSignalStats(signals);
  }, [signals, aiAnalysis]);

  // 决策数据（优先使用AI分析结果）
  const decisionData = useMemo(() => {
    if (aiAnalysis) {
      return {
        headline: aiAnalysis.decision.headline,
        summary: aiAnalysis.decision.summary,
        eventCountdown: aiAnalysis.decision.eventCountdown,
        aiReason: aiAnalysis.decision.aiReason,
      };
    }
    return createDefaultDecisionData();
  }, [aiAnalysis]);

  // AI建议（优先使用AI分析结果）
  const aiActions = useMemo(() => {
    if (aiAnalysis) {
      return aiAnalysis.actions;
    }
    return [
      { title: '客户提醒', text: '黄金短线偏多，但临近美国事件窗口，建议客户避免追涨满仓。' },
      { title: '交易动作', text: '若回踩第一支撑附近企稳，可关注小仓跟随机会。' },
      { title: '风险控制', text: '事件公布前把单笔风险控制在账户净值的1.2%以内。' },
    ];
  }, [aiAnalysis]);

  // 获取K线数据
  useEffect(() => {
    const loadCandles = async () => {
      try {
        const data = await fetchCandles(period, 500);
        setCandles(data);

        console.log(`📊 [信号检测] K线数据: ${data.length} 条`);
        console.log(`📊 [信号检测] 前5条:`, data.slice(0, 5));
        console.log(`📊 [信号检测] 后5条:`, data.slice(-5));

        // 计算信号（需要至少233根K线）
        if (data.length >= 233) {
          console.log('🔍 [信号检测] 开始计算 EMA...');
          const detectedSignals = detectSignals(data);
          console.log(`✅ [信号检测] 检测到 ${detectedSignals.length} 个信号:`, detectedSignals);
          setSignals(detectedSignals);
        } else {
          console.warn(`⚠️ K线数据不足（${data.length}条），需要至少233条`);
        }
      } catch (error) {
        console.error('❌ [信号检测] 失败:', error);
      }
    };

    loadCandles();
  }, [period]);

  // 加载事件和快讯数据
  useEffect(() => {
    const loadEventData = async () => {
      try {
        setEventsLoading(true);

        // 格式化今天日期
        const today = new Date().toISOString().split('T')[0];

        // 并行请求经济日历和市场快讯
        const [calendarRes, newsRes] = await Promise.all([
          dataApi.getEconomicCalendar(today).catch(() => ({ success: false, data: [] })),
          dataApi.getMarketNews().catch(() => ({ success: false, data: [] })),
        ]);

        // 转换经济日历数据格式
        if (calendarRes.success && calendarRes.data.length > 0) {
          const convertedEvents: Event[] = calendarRes.data
            .slice(0, 10) // 只取前10条
            .map((item: EconomicEvent) => ({
              time: item.time,
              star: '⭐'.repeat(item.importance),
              text: `${item.country} ${item.event}`,
            }));
          setEvents(convertedEvents);
        }

        // 转换市场快讯数据格式
        if (newsRes.success && newsRes.data.length > 0) {
          const convertedFlashes: Flash[] = newsRes.data
            .slice(0, 10) // 只取前10条
            .map((item: MarketFlash) => ({
              time: item.time,
              hot: item.hot || false,
              text: item.content,
            }));
          setFlashes(convertedFlashes);
        }

        console.log('✅ [事件数据] 加载成功');
      } catch (error) {
        console.error('❌ [事件数据] 加载失败:', error);
        // 失败时使用默认数据
        setEvents(createDefaultEvents());
        setFlashes(createDefaultFlashes());
      } finally {
        setEventsLoading(false);
      }
    };

    // 初始加载
    loadEventData();

    // 每5分钟刷新一次
    const interval = setInterval(loadEventData, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

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

  /**
   * 执行AI分析
   */
  const handleAIAnalyze = async () => {
    try {
      setAnalyzing(true);
      message.loading({ content: 'AI正在分析市场数据...', key: 'ai-analysis', duration: 0 });

      const result = await aiService.analyzeMarket({
        candles: candles.slice(-100), // 最近100根K线
        currentPrice: priceData.price,
        events: events.slice(0, 10),
        flashes: flashes.slice(0, 10),
        signals: signals.slice(-5),
      });

      setAiAnalysis(result);
      setShowAnalysisButton(false);

      message.success({ content: 'AI分析完成！', key: 'ai-analysis', duration: 2 });
    } catch (error) {
      console.error('AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : 'AI分析失败';

      if (errorMessage.includes('未配置AI服务')) {
        message.error({
          content: '请先在"AI账号"页面配置DeepSeek API Key',
          key: 'ai-analysis',
          duration: 4,
        });
      } else {
        message.error({ content: errorMessage, key: 'ai-analysis', duration: 3 });
      }
    } finally {
      setAnalyzing(false);
    }
  };

  /**
   * 重置为默认数据
   */
  const handleResetAnalysis = () => {
    setAiAnalysis(null);
    setShowAnalysisButton(true);
    message.info('已重置为默认数据');
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="title-bar">
        <div className="min-w-0 title-container">
          <h1 className="main-title">交易看板</h1>
          <div className="divider"></div>
          <p className="sub-title">实时监控黄金市场动态</p>
        </div>
        <div className="date-meta" style={{ marginTop: '-30px' }}>
          <span className="pill">实时更新</span>
          <div className="status-dot"></div>
          <span className="date-text">2026/05/21</span>

          {/* AI分析按钮 */}
          {showAnalysisButton ? (
            <Button
              type="primary"
              size="large"
              icon={analyzing ? <LoadingOutlined spin /> : <RobotOutlined />}
              onClick={handleAIAnalyze}
              disabled={analyzing || candles.length === 0}
              style={{ marginLeft: '12px', background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
            >
              {analyzing ? '分析中...' : 'AI 智能分析'}
            </Button>
          ) : (
            <Button
              size="large"
              onClick={handleResetAnalysis}
              style={{ marginLeft: '12px' }}
            >
              重新分析
            </Button>
          )}
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
          {/* 今日信号统计 */}
          <SignalPanel signals={signals} stats={stats} />

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
            <ActionPanel actions={aiActions} />
          </div>
        </section>
      </main>
    </div>
  );
}
